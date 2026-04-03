import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { withFileLock } from '../storage/lock';

export type ContactScopeStatus = 'unknown' | 'single' | 'conflict';

export interface EngagementDecisionSummary {
  ts: string;
  ok: boolean;
  reason_code: string;
  idle_hours: number;
  local_time: string;
  rule_snapshot: Record<string, unknown>;
}

export interface EngagementErrorSummary {
  ts: string;
  code: string;
  message: string;
}

export interface EngagementStateV1 {
  schema_version: '1.0';
  state_revision: number;
  user_timezone: string | null;
  last_user_message_at: string | null;
  last_proactive_checkin_at: string | null;
  last_non_social_outbound_at: string | null;
  last_outbound_reason: string | null;
  last_successful_proactive_message_id: string | null;
  last_inbound_dedupe_key: string | null;
  last_outbound_dedupe_key: string | null;
  recent_inbound_dedupe_keys: string[];
  recent_outbound_dedupe_keys: string[];
  last_proactive_decision_token: string | null;
  pending_proactive_send: boolean;
  pending_proactive_send_started_at: string | null;
  proactive_greeting_enabled: boolean;
  idle_threshold_hours: number;
  proactive_opt_out: boolean;
  unanswered_proactive_count: number;
  last_heartbeat_checked_at: string | null;
  last_decision: EngagementDecisionSummary | null;
  last_error: EngagementErrorSummary | null;
  primary_contact_fingerprint: string | null;
  contact_scope_status: ContactScopeStatus;
}

export interface ResolvedHeartbeatActiveHours {
  start?: string;
  end?: string;
  timezone?: string;
}

export interface ResolvedProactiveGreetingConfig {
  enabled: boolean;
  idleThresholdHours: number;
  minHoursBetweenCheckins: number;
  minHoursSinceNonSocialOutbound: number;
  unansweredPenaltyThreshold: number;
  unansweredPenaltyIdleHours: number;
  sessionKey: string;
  pendingSendTimeoutMinutes: number;
  singleUserGuard: boolean;
  canonicalMemoryRoot: string;
  activeHours?: ResolvedHeartbeatActiveHours;
  userTimezone?: string;
}

const SCHEMA_VERSION: '1.0' = '1.0';
const MAX_RECENT_KEYS = 64;

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function readNonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(-MAX_RECENT_KEYS);
}

function normalizeContactScopeStatus(value: unknown): ContactScopeStatus {
  return value === 'single' || value === 'conflict' ? value : 'unknown';
}

function defaultUserTimezone(config?: unknown): string {
  const root = (config ?? {}) as Record<string, unknown>;
  const agents = (root.agents ?? {}) as Record<string, unknown>;
  const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
  return readString(defaults.userTimezone)
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || 'UTC';
}

export function createDefaultEngagementState(config?: unknown): EngagementStateV1 {
  return {
    schema_version: SCHEMA_VERSION,
    state_revision: 0,
    user_timezone: defaultUserTimezone(config),
    last_user_message_at: null,
    last_proactive_checkin_at: null,
    last_non_social_outbound_at: null,
    last_outbound_reason: null,
    last_successful_proactive_message_id: null,
    last_inbound_dedupe_key: null,
    last_outbound_dedupe_key: null,
    recent_inbound_dedupe_keys: [],
    recent_outbound_dedupe_keys: [],
    last_proactive_decision_token: null,
    pending_proactive_send: false,
    pending_proactive_send_started_at: null,
    proactive_greeting_enabled: false,
    idle_threshold_hours: 7,
    proactive_opt_out: false,
    unanswered_proactive_count: 0,
    last_heartbeat_checked_at: null,
    last_decision: null,
    last_error: null,
    primary_contact_fingerprint: null,
    contact_scope_status: 'unknown',
  };
}

function sanitizeDecision(value: unknown): EngagementDecisionSummary | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const ts = readString(record.ts);
  const reasonCode = readString(record.reason_code);
  const localTime = readString(record.local_time);
  if (!ts || !reasonCode || !localTime) return null;
  return {
    ts,
    ok: record.ok === true,
    reason_code: reasonCode,
    idle_hours: readNonNegativeNumber(record.idle_hours, 0),
    local_time: localTime,
    rule_snapshot: typeof record.rule_snapshot === 'object' && record.rule_snapshot
      ? record.rule_snapshot as Record<string, unknown>
      : {},
  };
}

function sanitizeError(value: unknown): EngagementErrorSummary | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const ts = readString(record.ts);
  const code = readString(record.code);
  const message = readString(record.message);
  if (!ts || !code || !message) return null;
  return { ts, code, message };
}

export function sanitizeEngagementState(raw: unknown, config?: unknown): EngagementStateV1 {
  const base = createDefaultEngagementState(config);
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const record = raw as Record<string, unknown>;
  return {
    schema_version: SCHEMA_VERSION,
    state_revision: readNonNegativeNumber(record.state_revision, 0),
    user_timezone: readString(record.user_timezone) || base.user_timezone,
    last_user_message_at: readString(record.last_user_message_at) || null,
    last_proactive_checkin_at: readString(record.last_proactive_checkin_at) || null,
    last_non_social_outbound_at: readString(record.last_non_social_outbound_at) || null,
    last_outbound_reason: readString(record.last_outbound_reason) || null,
    last_successful_proactive_message_id: readString(record.last_successful_proactive_message_id) || null,
    last_inbound_dedupe_key: readString(record.last_inbound_dedupe_key) || null,
    last_outbound_dedupe_key: readString(record.last_outbound_dedupe_key) || null,
    recent_inbound_dedupe_keys: readStringArray(record.recent_inbound_dedupe_keys),
    recent_outbound_dedupe_keys: readStringArray(record.recent_outbound_dedupe_keys),
    last_proactive_decision_token: readString(record.last_proactive_decision_token) || null,
    pending_proactive_send: readBoolean(record.pending_proactive_send, false),
    pending_proactive_send_started_at: readString(record.pending_proactive_send_started_at) || null,
    proactive_greeting_enabled: readBoolean(record.proactive_greeting_enabled, false),
    idle_threshold_hours: readPositiveNumber(record.idle_threshold_hours, 7),
    proactive_opt_out: readBoolean(record.proactive_opt_out, false),
    unanswered_proactive_count: Math.floor(readNonNegativeNumber(record.unanswered_proactive_count, 0)),
    last_heartbeat_checked_at: readString(record.last_heartbeat_checked_at) || null,
    last_decision: sanitizeDecision(record.last_decision),
    last_error: sanitizeError(record.last_error),
    primary_contact_fingerprint: readString(record.primary_contact_fingerprint) || null,
    contact_scope_status: normalizeContactScopeStatus(record.contact_scope_status),
  };
}

export function resolveEngagementStatePath(
  workspaceDir: string,
  canonicalMemoryRoot = 'memory',
): string {
  return path.join(workspaceDir, canonicalMemoryRoot, 'engagement_state.json');
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function loadEngagementState(filePath: string, config?: unknown): EngagementStateV1 {
  if (!fs.existsSync(filePath)) {
    return createDefaultEngagementState(config);
  }

  try {
    return sanitizeEngagementState(readJsonFile(filePath), config);
  } catch {
    const backupPath = `${filePath}.bak`;
    if (fs.existsSync(backupPath)) {
      try {
        return sanitizeEngagementState(readJsonFile(backupPath), config);
      } catch {
        return withLastError(createDefaultEngagementState(config), {
          code: 'state_recover_failed',
          message: `Failed to parse ${filePath} and ${backupPath}; regenerated defaults.`,
        });
      }
    }
    return withLastError(createDefaultEngagementState(config), {
      code: 'state_parse_failed',
      message: `Failed to parse ${filePath}; regenerated defaults.`,
    });
  }
}

function atomicWriteJson(filePath: string, payload: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const nextJson = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(tempPath, nextJson, 'utf8');
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }
  fs.renameSync(tempPath, filePath);
}

export async function updateEngagementState(
  filePath: string,
  config: unknown,
  updater: (state: EngagementStateV1) => EngagementStateV1,
): Promise<EngagementStateV1> {
  return withFileLock(filePath, async () => {
    const current = loadEngagementState(filePath, config);
    const next = sanitizeEngagementState(updater(current), config);
    const committed = {
      ...next,
      schema_version: SCHEMA_VERSION,
      state_revision: current.state_revision + 1,
    };
    atomicWriteJson(filePath, committed);
    return committed;
  });
}

export function withLastError(
  state: EngagementStateV1,
  error: { code: string; message: string },
  now = new Date(),
): EngagementStateV1 {
  return {
    ...state,
    last_error: {
      ts: now.toISOString(),
      code: error.code,
      message: error.message,
    },
  };
}

export function appendRecentKey(keys: string[], nextKey: string): string[] {
  return [...keys.filter((entry) => entry !== nextKey), nextKey].slice(-MAX_RECENT_KEYS);
}

export function hashDedupeKey(parts: Array<string | number | boolean | null | undefined>): string {
  return crypto
    .createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex');
}

export function createDecisionToken(now = new Date()): string {
  return `decision-${now.getTime()}-${crypto.randomUUID()}`;
}

export function resolveProactiveGreetingConfig(
  pluginConfig?: Record<string, unknown>,
  rootConfig?: unknown,
): ResolvedProactiveGreetingConfig {
  const proactive = ((pluginConfig?.proactiveGreeting ?? {}) as Record<string, unknown>);
  const root = (rootConfig ?? {}) as Record<string, unknown>;
  const agents = (root.agents ?? {}) as Record<string, unknown>;
  const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
  const heartbeat = (defaults.heartbeat ?? {}) as Record<string, unknown>;
  const activeHoursRaw = (heartbeat.activeHours ?? {}) as Record<string, unknown>;

  return {
    enabled: readBoolean(proactive.enabled, false),
    idleThresholdHours: readPositiveNumber(proactive.idleThresholdHours, 7),
    minHoursBetweenCheckins: readPositiveNumber(proactive.minHoursBetweenCheckins, 24),
    minHoursSinceNonSocialOutbound: readPositiveNumber(proactive.minHoursSinceNonSocialOutbound, 6),
    unansweredPenaltyThreshold: Math.floor(readNonNegativeNumber(proactive.unansweredPenaltyThreshold, 2)),
    unansweredPenaltyIdleHours: readPositiveNumber(proactive.unansweredPenaltyIdleHours, 72),
    sessionKey: readString(proactive.sessionKey) || 'proactive-greeting',
    pendingSendTimeoutMinutes: readPositiveNumber(proactive.pendingSendTimeoutMinutes, 20),
    singleUserGuard: readBoolean(proactive.singleUserGuard, true),
    canonicalMemoryRoot: readString(pluginConfig?.canonicalMemoryRoot) || 'memory',
    activeHours: Object.keys(activeHoursRaw).length > 0
      ? {
          start: readString(activeHoursRaw.start),
          end: readString(activeHoursRaw.end),
          timezone: readString(activeHoursRaw.timezone),
        }
      : undefined,
    userTimezone: readString(defaults.userTimezone),
  };
}
