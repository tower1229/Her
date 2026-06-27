import {
  EngagementStateV1,
  appendRecentKey,
  createDecisionToken,
  hashDedupeKey,
  loadEngagementState,
  resolveEngagementStatePath,
  resolveProactiveGreetingConfig,
  updateEngagementState,
  withLastError,
} from './engagement_state';
import {
  shouldSendProactiveGreeting,
  toDecisionSummary,
} from './should_send_proactive_greeting';

interface LoggerLike {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface InternalHookEventLike<TContext extends Record<string, unknown>> {
  sessionKey?: string;
  timestamp?: Date;
  context: TContext;
}

export interface MessagePreprocessedContextLike extends Record<string, unknown> {
  from?: string;
  body?: string;
  bodyForAgent?: string;
  transcript?: string;
  timestamp?: number;
  channelId?: string;
  accountId?: string;
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
}

export interface MessageSentContextLike extends Record<string, unknown> {
  to?: string;
  content?: string;
  success?: boolean;
  error?: string;
  timestamp?: number;
  channelId?: string;
  accountId?: string;
  conversationId?: string;
  messageId?: string;
}

export interface BeforePromptBuildEventLike {
  prompt: string;
  messages: unknown[];
}

export interface PluginHookContextLike {
  workspaceDir?: string;
  sessionKey?: string;
  trigger?: string;
}

export interface EngagementHookParams {
  workspaceDir: string;
  pluginConfig?: Record<string, unknown>;
  config?: unknown;
  logger?: LoggerLike;
}

const OPT_OUT_PATTERNS = [
  /别太频繁/i,
  /少联系/i,
  /别主动联系/i,
  /不要主动联系/i,
  /不想被主动联系/i,
  /别老发/i,
  /不要老发/i,
  /stop reaching out/i,
  /don'?t message me/i,
  /do not message me/i,
  /opt out/i,
];

const OPT_IN_PATTERNS = [
  /可以主动联系/i,
  /可以再联系/i,
  /恢复联系/i,
  /恢复问候/i,
  /继续联系/i,
  /you can message me/i,
  /you can reach out/i,
  /opt in/i,
];

function normalizeMeaningfulText(raw?: string): string {
  return String(raw || '')
    .replace(/<media:[^>]+>/gi, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIdentity(raw?: string): string | null {
  const normalized = String(raw || '').trim().toLowerCase();
  return normalized || null;
}

function inferInboundText(context: MessagePreprocessedContextLike): string {
  const transcript = normalizeMeaningfulText(context.transcript);
  if (transcript) return transcript;
  return normalizeMeaningfulText(context.bodyForAgent || context.body);
}

export function buildContactFingerprint(context: MessagePreprocessedContextLike): string | null {
  const identity = normalizeIdentity(context.from)
    || normalizeIdentity(context.senderId)
    || normalizeIdentity(context.senderUsername);
  if (!identity) return null;
  return hashDedupeKey(['contact', identity]);
}

function createInboundDedupeKey(context: MessagePreprocessedContextLike): string {
  if (typeof context.messageId === 'string' && context.messageId.trim()) {
    return `msg:${context.messageId.trim()}`;
  }
  return hashDedupeKey([
    context.channelId,
    context.accountId,
    context.conversationId,
    context.from,
    context.timestamp,
    inferInboundText(context),
  ]);
}

function createOutboundDedupeKey(context: MessageSentContextLike): string {
  if (typeof context.messageId === 'string' && context.messageId.trim()) {
    return `msg:${context.messageId.trim()}`;
  }
  return hashDedupeKey([
    context.channelId,
    context.accountId,
    context.conversationId,
    context.to,
    context.timestamp,
    context.success === true,
    context.content,
  ]);
}

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasMeaningfulInboundContent(context: MessagePreprocessedContextLike): boolean {
  return inferInboundText(context).length > 0;
}

function markContactScope(
  state: EngagementStateV1,
  fingerprint: string | null,
  singleUserGuard: boolean,
): EngagementStateV1 {
  if (!singleUserGuard || !fingerprint) {
    return state;
  }
  if (!state.primary_contact_fingerprint) {
    return {
      ...state,
      primary_contact_fingerprint: fingerprint,
      contact_scope_status: 'single',
    };
  }
  if (state.primary_contact_fingerprint === fingerprint) {
    return {
      ...state,
      contact_scope_status: 'single',
    };
  }
  return {
    ...state,
    contact_scope_status: 'conflict',
  };
}

function expirePendingIfNeeded(
  state: EngagementStateV1,
  now: Date,
  pendingSendTimeoutMinutes: number,
): EngagementStateV1 {
  if (!state.pending_proactive_send || !state.pending_proactive_send_started_at) {
    return state;
  }
  const startedAt = new Date(state.pending_proactive_send_started_at);
  if (Number.isNaN(startedAt.getTime())) {
    return withLastError(
      {
        ...state,
        pending_proactive_send: false,
        pending_proactive_send_started_at: null,
        pending_proactive_session_key: null,
      },
      {
        code: 'pending_send_invalid_started_at',
        message: 'Cleared proactive pending flag because pending_proactive_send_started_at was invalid.',
      },
      now,
    );
  }
  const elapsedMs = now.getTime() - startedAt.getTime();
  if (elapsedMs < pendingSendTimeoutMinutes * 60_000) {
    return state;
  }
  return withLastError(
    {
      ...state,
      pending_proactive_send: false,
      pending_proactive_send_started_at: null,
      pending_proactive_session_key: null,
    },
    {
      code: 'pending_send_timeout',
      message: `Cleared proactive pending flag after ${pendingSendTimeoutMinutes} minutes without a matching send callback.`,
    },
    now,
  );
}

export async function handlePreprocessedInbound(
  event: InternalHookEventLike<MessagePreprocessedContextLike>,
  params: EngagementHookParams,
): Promise<void> {
  const config = resolveProactiveGreetingConfig(params.pluginConfig, params.config);
  const statePath = resolveEngagementStatePath(params.workspaceDir, config.canonicalMemoryRoot);
  const dedupeKey = createInboundDedupeKey(event.context);
  const contactFingerprint = buildContactFingerprint(event.context);
  const now = event.timestamp instanceof Date
    ? event.timestamp
    : typeof event.context.timestamp === 'number'
      ? new Date(event.context.timestamp)
      : new Date();
  const inboundText = inferInboundText(event.context);

  await updateEngagementState(statePath, params.config, (current) => {
    const normalized = expirePendingIfNeeded(current, now, config.pendingSendTimeoutMinutes);
    if (normalized.recent_inbound_dedupe_keys.includes(dedupeKey)) {
      return normalized;
    }

    let next = markContactScope(normalized, contactFingerprint, config.singleUserGuard);
    next = {
      ...next,
      proactive_greeting_enabled: config.enabled,
      idle_threshold_hours: config.idleThresholdHours,
      last_inbound_dedupe_key: dedupeKey,
      recent_inbound_dedupe_keys: appendRecentKey(next.recent_inbound_dedupe_keys, dedupeKey),
    };

    if (!hasMeaningfulInboundContent(event.context)) {
      return next;
    }

    next = {
      ...next,
      last_user_message_at: now.toISOString(),
      unanswered_proactive_count: 0,
    };

    if (matchesAnyPattern(inboundText, OPT_OUT_PATTERNS)) {
      next = {
        ...next,
        proactive_opt_out: true,
      };
    } else if (matchesAnyPattern(inboundText, OPT_IN_PATTERNS)) {
      next = {
        ...next,
        proactive_opt_out: false,
      };
    }
    return next;
  });
}

export async function handleSentOutbound(
  event: InternalHookEventLike<MessageSentContextLike>,
  params: EngagementHookParams,
): Promise<void> {
  const config = resolveProactiveGreetingConfig(params.pluginConfig, params.config);
  const statePath = resolveEngagementStatePath(params.workspaceDir, config.canonicalMemoryRoot);
  const currentState = loadEngagementState(statePath, params.config);
  if (!currentState.pending_proactive_send) return;
  const expectedSessionKey = currentState.pending_proactive_session_key || config.sessionKey;
  if (event.sessionKey !== expectedSessionKey) return;
  const dedupeKey = createOutboundDedupeKey(event.context);
  const now = event.timestamp instanceof Date
    ? event.timestamp
    : typeof event.context.timestamp === 'number'
      ? new Date(event.context.timestamp)
      : new Date();

  await updateEngagementState(statePath, params.config, (current) => {
    const normalized = expirePendingIfNeeded(current, now, config.pendingSendTimeoutMinutes);
    if (normalized.recent_outbound_dedupe_keys.includes(dedupeKey)) {
      return normalized;
    }

    let next: EngagementStateV1 = {
      ...normalized,
      proactive_greeting_enabled: config.enabled,
      idle_threshold_hours: config.idleThresholdHours,
      last_outbound_dedupe_key: dedupeKey,
      recent_outbound_dedupe_keys: appendRecentKey(normalized.recent_outbound_dedupe_keys, dedupeKey),
    };

    if (!normalized.pending_proactive_send) {
      return next;
    }

    if (event.context.success === true) {
      return {
        ...next,
        last_proactive_checkin_at: now.toISOString(),
        last_outbound_reason: 'proactive_greeting',
        last_successful_proactive_message_id: typeof event.context.messageId === 'string' ? event.context.messageId : null,
        unanswered_proactive_count: normalized.unanswered_proactive_count + 1,
        pending_proactive_send: false,
        pending_proactive_send_started_at: null,
        pending_proactive_session_key: null,
      };
    }

    next = {
      ...next,
      pending_proactive_send: false,
      pending_proactive_send_started_at: null,
      pending_proactive_session_key: null,
    };
    return withLastError(next, {
      code: 'proactive_send_failed',
      message: String(event.context.error || 'Proactive greeting send failed without an error message.'),
    }, now);
  });
}

function mergePrependContext(existing: string | undefined, injected: string | undefined): string | undefined {
  if (!existing) return injected;
  if (!injected) return existing;
  return `${existing}\n\n${injected}`;
}

function isHeartbeatPreflightRun(
  event: BeforePromptBuildEventLike,
  hookContext: PluginHookContextLike,
): boolean {
  if (hookContext.trigger === 'heartbeat') {
    return true;
  }
  return /HEARTBEAT_OK|HEARTBEAT\.md/i.test(event.prompt);
}

export async function prepareProactiveGreetingHeartbeatContext(
  event: BeforePromptBuildEventLike,
  hookContext: PluginHookContextLike,
  params: EngagementHookParams,
): Promise<{ prependContext?: string } | undefined> {
  const config = resolveProactiveGreetingConfig(params.pluginConfig, params.config);
  if (!hookContext.workspaceDir) {
    return undefined;
  }
  if (!isHeartbeatPreflightRun(event, hookContext)) {
    return undefined;
  }

  const statePath = resolveEngagementStatePath(hookContext.workspaceDir, config.canonicalMemoryRoot);
  const now = new Date();
  const currentState = loadEngagementState(statePath, params.config);
  const preparedState = expirePendingIfNeeded(currentState, now, config.pendingSendTimeoutMinutes);
  const decision = shouldSendProactiveGreeting(preparedState, now, config);

  await updateEngagementState(statePath, params.config, (current) => {
    let next = expirePendingIfNeeded(current, now, config.pendingSendTimeoutMinutes);
    next = {
      ...next,
      proactive_greeting_enabled: config.enabled,
      idle_threshold_hours: config.idleThresholdHours,
      last_heartbeat_checked_at: now.toISOString(),
      last_decision: toDecisionSummary(decision, now),
    };
    if (!decision.ok) {
      return next;
    }
    return {
      ...next,
      last_proactive_decision_token: createDecisionToken(now),
      pending_proactive_send: true,
      pending_proactive_send_started_at: now.toISOString(),
      pending_proactive_session_key: hookContext.sessionKey || null,
    };
  });

  if (!decision.ok) {
    return {
      prependContext: [
        'Proactive greeting preflight: send is not allowed for this heartbeat run.',
        `Decision reason: ${decision.reason_code}.`,
        'Reply exactly HEARTBEAT_OK and do not send any user-facing text.',
      ].join('\n'),
    };
  }

  return {
    prependContext: [
      'Proactive greeting preflight: send is allowed for this heartbeat run.',
      'Send exactly one short, warm, low-pressure proactive greeting now.',
      'Do not mention automation, rules, thresholds, or internal checks.',
      'Do not ask multiple questions and do not send follow-up messages.',
    ].join('\n'),
  };
}

export function mergeBeforePromptBuildContext(
  base: { prependContext?: string } | undefined,
  injected: { prependContext?: string } | undefined,
): { prependContext?: string } | undefined {
  if (!base) return injected;
  if (!injected) return base;
  return {
    prependContext: mergePrependContext(base.prependContext, injected.prependContext),
  };
}
