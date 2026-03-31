import * as fs from 'fs';
import * as path from 'path';
import {
  TimelineCollectorOutput,
  CollectedTimelineFact,
  TimelineReasonerOutput,
} from '../core/timeline_reasoner_contract';
import { buildConversationContextFromMessages } from './conversation_context';
import { TimelineQueryPlan } from '../core/resolve_window';
import { addHours, formatTimestamp, parseTimestampParts, TimestampParts } from '../lib/time-utils';
import {
  timelineResolve,
  timelineResolveToolSpec,
  TimelineRuntimeDependencies,
  TimelineResolveInput,
} from '../tools/timeline_resolve';
import { createLegacyPersonaExtractorRuntime } from './legacy_persona_extractor_runtime';
import { loadTimelinePersonaContractFromWorkspace } from '../persona/load_persona_contract';

interface PluginLoggerLike {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

interface PluginToolContextLike {
  config?: unknown;
  workspaceDir?: string;
  agentId?: string;
  sessionKey?: string;
}

interface AgentToolLike {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, params: unknown) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    details?: unknown;
  }>;
}

interface PluginApiLike {
  config?: unknown;
  pluginConfig?: Record<string, unknown>;
  runtime?: {
    subagent?: {
      run?: (params: {
        sessionKey: string;
        message: string;
        extraSystemPrompt?: string;
        lane?: string;
        deliver?: boolean;
        idempotencyKey?: string;
      }) => Promise<{ runId: string }>;
      waitForRun?: (params: { runId: string; timeoutMs?: number }) => Promise<{ status: string; error?: string }>;
      getSessionMessages?: (params: { sessionKey: string; limit?: number }) => Promise<{ messages: unknown[] }>;
      deleteSession?: (params: { sessionKey: string; deleteTranscript?: boolean }) => Promise<void>;
    };
    tools?: {
      createMemorySearchTool?: (options: { config?: unknown; agentSessionKey?: string }) => AgentToolLike | null;
    };
  };
  workspaceDir?: string;
  logger?: PluginLoggerLike;
  resolvePath?: (input: string) => string;
}

interface OpenClawPluginRuntimeModuleLike {
  createPluginRuntime?: (options?: {
    allowGatewaySubagentBinding?: boolean;
  }) => PluginApiLike['runtime'];
}

interface TimelinePluginRuntimeConfig {
  enableTrace: boolean;
  traceLogPath?: string;
  canonicalMemoryRoot: string;
  reasonerTimeoutMs: number;
  reasonerSessionPrefix: string;
  reasonerMessageLimit: number;
  personaExtractorTimeoutMs: number;
  personaExtractorSessionPrefix: string;
  sessionHistoryLimit: number;
  memorySearchMaxResults: number;
  conversationStickinessWindowMinutes: number;
}

type OpenClawPluginRuntimeModuleLoader = () => OpenClawPluginRuntimeModuleLike | null;
type SubagentRuntimeLike = {
  run: NonNullable<NonNullable<NonNullable<PluginApiLike['runtime']>['subagent']>['run']>;
  waitForRun: NonNullable<NonNullable<NonNullable<PluginApiLike['runtime']>['subagent']>['waitForRun']>;
  getSessionMessages: NonNullable<NonNullable<NonNullable<PluginApiLike['runtime']>['subagent']>['getSessionMessages']>;
  deleteSession?: NonNullable<NonNullable<NonNullable<PluginApiLike['runtime']>['subagent']>['deleteSession']>;
};

let openClawPluginRuntimeModuleLoader: OpenClawPluginRuntimeModuleLoader = () => {
  try {
    return require('openclaw/plugin-sdk/runtime') as OpenClawPluginRuntimeModuleLike;
  } catch {
    return null;
  }
};

let cachedLateBoundGatewaySubagentRuntime: SubagentRuntimeLike | null | undefined;

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function resolvePluginRuntimeConfig(pluginConfig?: Record<string, unknown>): TimelinePluginRuntimeConfig {
  return {
    enableTrace: readBoolean(pluginConfig?.enableTrace, true),
    traceLogPath: readString(pluginConfig?.traceLogPath),
    canonicalMemoryRoot: readString(pluginConfig?.canonicalMemoryRoot) || 'memory',
    reasonerTimeoutMs: readInteger(pluginConfig?.reasonerTimeoutMs, 90000),
    reasonerSessionPrefix: readString(pluginConfig?.reasonerSessionPrefix) || 'timeline-reasoner',
    reasonerMessageLimit: readInteger(pluginConfig?.reasonerMessageLimit, 24),
    personaExtractorTimeoutMs: readInteger(pluginConfig?.personaExtractorTimeoutMs, 60000),
    personaExtractorSessionPrefix: readString(pluginConfig?.personaExtractorSessionPrefix) || 'timeline-persona-extractor',
    sessionHistoryLimit: readInteger(pluginConfig?.sessionHistoryLimit, 12),
    memorySearchMaxResults: readInteger(pluginConfig?.memorySearchMaxResults, 6),
    conversationStickinessWindowMinutes: readInteger(pluginConfig?.conversationStickinessWindowMinutes, 10),
  };
}

function wrapToolPayload(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function isSubagentRuntimeAvailable(
  runtime: NonNullable<PluginApiLike['runtime']>['subagent'] | undefined,
): runtime is SubagentRuntimeLike {
  return Boolean(
    runtime
    && typeof runtime.run === 'function'
    && typeof runtime.waitForRun === 'function'
    && typeof runtime.getSessionMessages === 'function',
  );
}

function isUnavailableSubagentRuntimeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Plugin runtime subagent methods are only available during a gateway request.');
}

function getLateBoundGatewaySubagentRuntime(
  pluginApi: PluginApiLike,
): SubagentRuntimeLike | undefined {
  if (cachedLateBoundGatewaySubagentRuntime !== undefined) {
    return cachedLateBoundGatewaySubagentRuntime || undefined;
  }

  const runtimeModule = openClawPluginRuntimeModuleLoader();
  const lateBoundRuntime = runtimeModule?.createPluginRuntime?.({
    allowGatewaySubagentBinding: true,
  });
  const lateBoundSubagent = lateBoundRuntime?.subagent;
  const subagentRuntime = isSubagentRuntimeAvailable(lateBoundSubagent)
    ? lateBoundSubagent
    : undefined;

  if (!subagentRuntime) {
    pluginApi.logger?.debug?.('timeline late-bound gateway subagent runtime unavailable');
  }

  cachedLateBoundGatewaySubagentRuntime = subagentRuntime ?? null;
  return subagentRuntime;
}

async function withPreferredSubagentRuntime<T>(
  pluginApi: PluginApiLike,
  purpose: string,
  execute: (subagentRuntime: SubagentRuntimeLike) => Promise<T>,
): Promise<T> {
  const injectedSubagent = pluginApi.runtime?.subagent;
  const injectedRuntime = isSubagentRuntimeAvailable(injectedSubagent)
    ? injectedSubagent
    : undefined;
  let injectedError: unknown;

  if (injectedRuntime) {
    try {
      return await execute(injectedRuntime);
    } catch (error) {
      injectedError = error;
      if (!isUnavailableSubagentRuntimeError(error)) {
        throw error;
      }
      pluginApi.logger?.debug?.(`timeline ${purpose} retrying with late-bound gateway subagent runtime`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const lateBoundRuntime = getLateBoundGatewaySubagentRuntime(pluginApi);
  if (lateBoundRuntime && lateBoundRuntime !== injectedRuntime) {
    return execute(lateBoundRuntime);
  }

  if (injectedError) {
    throw injectedError;
  }
  throw new Error(`${purpose} dependency missing`);
}

export function setOpenClawPluginRuntimeModuleLoaderForTests(
  loader: OpenClawPluginRuntimeModuleLoader,
): void {
  openClawPluginRuntimeModuleLoader = loader;
  cachedLateBoundGatewaySubagentRuntime = undefined;
}

export function resetOpenClawPluginRuntimeModuleLoaderForTests(): void {
  openClawPluginRuntimeModuleLoader = () => {
    try {
      return require('openclaw/plugin-sdk/runtime') as OpenClawPluginRuntimeModuleLike;
    } catch {
      return null;
    }
  };
  cachedLateBoundGatewaySubagentRuntime = undefined;
}

function resolveWorkspaceDir(pluginApi: PluginApiLike, toolContext: PluginToolContextLike): string {
  if (toolContext.workspaceDir) return toolContext.workspaceDir;
  if (pluginApi.workspaceDir) return pluginApi.workspaceDir;
  if (typeof pluginApi.resolvePath === 'function') return pluginApi.resolvePath('.');
  return process.cwd();
}

function resolveConfiguredPath(workspaceDir: string, configuredPath: string | undefined, fallbackRelativePath: string): string {
  const raw = configuredPath || fallbackRelativePath;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.normalize(path.join(workspaceDir, raw));
}

function formatOffsetMinutes(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function formatCurrentTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const offset = formatOffsetMinutes(-date.getTimezoneOffset());
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

function readWorkspaceTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function buildMemorySearchQuery(input: { query?: string }): string | null {
  const explicit = readString(input.query);
  if (explicit) return explicit;
  return null;
}

function stringifySearchResult(entry: unknown): string {
  if (!entry || typeof entry !== 'object') {
    return typeof entry === 'string' ? entry : JSON.stringify(entry);
  }
  const record = entry as Record<string, unknown>;
  if (typeof record.snippet === 'string' && record.snippet.trim()) return record.snippet.trim();
  return JSON.stringify(entry);
}

function extractMessageText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const directKeys = ['bodyText', 'body', 'text', 'contentText'];
  for (const key of directKeys) {
    if (typeof record[key] === 'string' && String(record[key]).trim()) {
      return String(record[key]).trim();
    }
  }

  if (Array.isArray(record.content)) {
    const joined = record.content
      .map((part) => extractMessageText(part))
      .filter(Boolean)
      .join('\n');
    if (joined) return joined;
  }

  if (record.content && typeof record.content === 'object') {
    const nestedContent = extractMessageText(record.content);
    if (nestedContent) return nestedContent;
  }

  if (record.message && typeof record.message === 'object') {
    const nestedMessage = extractMessageText(record.message);
    if (nestedMessage) return nestedMessage;
  }

  if (typeof record.type === 'string' && record.type === 'text' && typeof record.text === 'string') {
    return record.text.trim();
  }

  return '';
}

function extractMessageRole(value: unknown): string {
  if (!value || typeof value !== 'object') return 'unknown';
  const directRole = (value as { role?: unknown }).role;
  if (typeof directRole === 'string' && directRole.trim()) {
    return directRole.trim();
  }
  const nestedMessage = (value as { message?: unknown }).message;
  if (nestedMessage && typeof nestedMessage === 'object') {
    const nestedRole = (nestedMessage as { role?: unknown }).role;
    if (typeof nestedRole === 'string' && nestedRole.trim()) {
      return nestedRole.trim();
    }
  }
  return 'unknown';
}

function normalizeSessionHistory(messages: unknown[], limit: number): string[] {
  return messages
    .map((message) => {
      const role = extractMessageRole(message);
      const text = extractMessageText(message);
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean)
    .slice(-limit);
}

function extractLatestAssistantText(messages: unknown[]): string {
  const reversed = [...messages].reverse();
  for (const message of reversed) {
    const role = extractMessageRole(message);
    const text = extractMessageText(message);
    if (role === 'assistant' && text) return text;
  }
  for (const message of reversed) {
    const text = extractMessageText(message);
    if (text) return text;
  }
  return '';
}

function collectBalancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaping = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }
    if (char === '}') {
      if (depth === 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function tryExtractJsonObject(text: string, sourceLabel: string, expectedRequestId?: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || text.trim();
  const objects = collectBalancedJsonObjects(candidate);
  if (objects.length === 0) {
    throw new Error(`${sourceLabel} did not return a JSON object`);
  }

  let firstParsedObject: string | null = null;
  for (const objectText of objects) {
    try {
      const parsed = JSON.parse(objectText) as { request_id?: string };
      if (!firstParsedObject) {
        firstParsedObject = objectText;
      }
      if (!expectedRequestId || parsed.request_id === expectedRequestId) {
        return objectText;
      }
    } catch {
      continue;
    }
  }

  if (firstParsedObject && !expectedRequestId) {
    return firstParsedObject;
  }
  if (firstParsedObject && expectedRequestId) {
    throw new Error(`${sourceLabel} returned mismatched request_id`);
  }
  throw new Error(`${sourceLabel} did not return a parseable JSON object`);
}

function collectRelevantTranscriptTexts(messages: unknown[]): Array<{ role: string; text: string }> {
  return [...messages]
    .reverse()
    .map((message) => ({
      role: extractMessageRole(message),
      text: extractMessageText(message),
    }))
    .filter((entry) => Boolean(entry.text))
    .filter((entry) => entry.role === 'assistant' || entry.role === 'unknown');
}

function extractJsonObjectFromMessages(messages: unknown[], sourceLabel: string, expectedRequestId?: string): string {
  const relevantMessages = collectRelevantTranscriptTexts(messages);
  let sawMismatchedRequestId = false;
  let sawJsonLikeOutput = false;

  for (const entry of relevantMessages) {
    try {
      return tryExtractJsonObject(entry.text, sourceLabel, expectedRequestId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('mismatched request_id')) {
        sawMismatchedRequestId = true;
        sawJsonLikeOutput = true;
        continue;
      }
      if (message.includes('parseable JSON object')) {
        sawJsonLikeOutput = true;
        continue;
      }
      if (message.includes('did not return a JSON object')) {
        continue;
      }
      throw error;
    }
  }

  if (sawMismatchedRequestId) {
    throw new Error(`${sourceLabel} returned mismatched request_id`);
  }
  if (sawJsonLikeOutput) {
    throw new Error(`${sourceLabel} did not return a parseable JSON object`);
  }
  throw new Error(`${sourceLabel} did not return a JSON object`);
}

function makePlannerRequestId(): string {
  return `timeline-plan-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function buildTimelineQueryPlannerSystemPrompt(): string {
  return [
    'You are the internal Timeline plugin query normalizer.',
    'Your only task is to normalize a natural-language time request into a structured time plan that Timeline can execute.',
    'Do not call tools. Do not output Markdown, explanations, or extra text. Output strict JSON only.',
    'You must follow these constraints:',
    '1. First classify the request as now, past_point, or past_range.',
    '2. Do not classify mechanically from keywords. Interpret the actual time semantics in the user request.',
    '3. For now, do not output normalized_point / normalized_start / normalized_end.',
    '4. For past_point, normalized_point is required.',
    '5. For past_range, normalized_start and normalized_end are required.',
    '6. For colloquial ranges such as “最近”, normalize into concrete bounds using anchor.now.',
    '7. For expressions such as “昨晚”, “今天”, or “昨天上午”, produce a realistic range that fits ordinary usage.',
    '8. All output times must be ISO-like timestamps with timezone offsets.',
    '9. Classify as past_point only when the user clearly points to a specific moment, for example “昨晚八点”, “昨天上午十点”, or “上周六晚上九点”.',
    '10. If the user is asking about a duration or a whole period, it must be past_range, for example “昨晚在做什么”, “今天都忙了什么”, “最近有什么有趣的事吗”, or “这几天怎么样”.',
    '11. “昨晚” by itself is not a point in time. It is an evening range. Only expressions with an explicit anchor such as “昨晚八点” are past_point.',
    '12. Questions about the most recent or previous occurrence of something, such as “最近一次…”, “上一次…”, “上回…”, or “最后一次…”, should usually be normalized as past_range unless the user also gives an exact timestamp.',
    '13. This also applies to reflective autobiographical recall such as “最近一次知道自己错了是什么场景”, “上一次后悔是什么时候”, or “最后一次改变主意是在什么时候”.',
  ].join('\n');
}

function buildTimelineQueryPlannerMessage(input: TimelineResolveInput, anchor: { now: string; timezone: string }, requestId: string): string {
  return [
    'Normalize time only from the information below.',
    'Output a JSON object with the following shape:',
    JSON.stringify({
      schema_version: '1.0',
      request_id: requestId,
      target_time_range: 'now | past_point | past_range',
      normalized_point: 'required for past_point, omit otherwise',
      normalized_start: 'required for past_range, omit otherwise',
      normalized_end: 'required for past_range, omit otherwise',
      summary: 'short summary of how you interpreted the user time semantics',
    }, null, 2),
    '',
    'input:',
    JSON.stringify({
      query: input.query,
      anchor,
    }, null, 2),
  ].join('\n');
}

function buildTimelineReasonerSystemPrompt(): string {
  const coreRules = [
    'You are the internal Timeline plugin time-semantics reasoner.',
    'Your only task is to use the collector fact bundle and output a JSON object that strictly matches TimelineReasonerOutput.',
    'Do not call tools. Do not introduce pre-existing facts beyond the collector input. Do not output Markdown, explanations, or extra text.',
    'Priority A - Output validity and action legality:',
    '- request_type must be one of now, past_point, or past_range. continuity is not a separate request type.',
    '- Session hard facts and existing canon facts take priority over generation.',
    '- If collector.request.mode is read_only, you must never generate_new_fact.',
    '- If decision.action is reuse_existing_fact, selected_fact_id must come from candidate_facts.',
    '- If decision.action is generate_new_fact, you must provide a complete generated_fact and set should_write_canon=true.',
    '- generated_fact must contain structured fields only, with no free-form prose, explanation, or extra narration.',
  ];

  const reasoningRules = [
    'Priority B - Time semantics and continuity:',
    '- The continuity field must truthfully report whether continuity reasoning was used and why.',
    '- past_point may hit either by exact match or by a prior fact that naturally continues to the target time.',
    '- For past_range, first understand the normalized range, then choose the most relevant, vivid, and worth-mentioning facts from that range.',
    '- If the user asks with semantic filters such as “有趣”, “好玩”, or “忙不忙”, interpret that filter before deciding reuse vs generation.',
    '- When generating for past_point or past_range, provide a reasonable timestamp inside the target point or range.',
  ];

  const generationRules = [
    'Priority C - Safe generation constraints (allow_generate):',
    '- If collector.request.mode is allow_generate and no reusable canon fact exists, prefer generate_new_fact by default.',
    '- In allow_generate mode, use return_empty only when safe generation is not possible (for example sleep-window gaps, or hard persona/world-rhythm violations).',
    '- If decision.action is return_empty, rationale.summary must explicitly frame memory blankness/forgetfulness instead of generic unknown wording.',
    '- If collector.persona_context.should_constrain_generation=true, generation must respect the loaded persona contract and its stable commitments.',
    '- If persona signals exist, rationale.persona_basis and rationale.constraint_basis must both be non-empty and specific.',
    '- Avoid generic template scenes. Location, action, emotion, appearance, and internalMonologue must reflect lived continuity.',
    '- Respect collector.world_context temporal logic: meals, sleep, work/study, leisure, weekends, weekdays, and holidays.',
    '- For late-night and pre-dawn, prefer sleep/rest/quiet activities. Meal scenes must stay within plausible meal windows.',
    '- estimated_duration_minutes (top-level, integer): how many minutes this scene/state is expected to persist.',
    '  Must be present when decision.action is reuse_existing_fact or generate_new_fact.',
    '  Consider activityMode, persona temperament, time of day, and typical real-world durations.',
    '  Examples: sleep ≈ 420, meal ≈ 30–60, work_or_study ≈ 60–180, bath ≈ 20–40, commute ≈ 20–50, exercise ≈ 30–90, rest ≈ 15–45, transition ≈ 5–20.',
    '- Scene diversity: when collector.world_context.target.day_kind is weekend or holiday, or time_band is evening on any day, actively consider outdoor, social, shopping, exercise, and leisure activity modes instead of defaulting to indoor/domestic scenes.',
    '- Use persona.rhythm weekend_bias, evening_bias, and persona.scene plausible_locations/plausible_activities to select realistic non-indoor scenes.',
    '- If the previous canon entries for the day are all indoor, increase the likelihood of an outdoor or social scene for subsequent generation, unless persona constraints explicitly restrict it.',
    '- Avoid generating the same activity_mode for more than 3 consecutive entries on the same day (excluding sleep and work_or_study).',
  ];

  const macroEventRules = [
    'Priority C3 - Macro event refinement (long-duration events):',
    '- Each candidate_fact now carries precomputed time fields: estimated_duration_minutes, elapsed_minutes, is_within_duration_window (boolean), event_id (string), has_parent_event (boolean), parent_event_tag, parent_event_phase, parent_event_progress. Use these directly; do NOT recalculate elapsed time or duration windows yourself.',
    '- event_id is a deterministic identifier assigned to every canon entry at write time. When generating a refined phase, set sceneSemantics.parentEventTag to the event_id of the parent macro event (available on the candidate_fact). Do NOT invent freeform strings; always copy the exact event_id value.',
    '- When a candidate_fact has estimated_duration_minutes > 120 AND has_parent_event is false (meaning it is an original macro event, not already a refined phase) AND is_within_duration_window is true:',
    '  Check whether any other candidate_fact with a matching parent_event_tag (equal to the parent\'s event_id) also has is_within_duration_window=true. If such a still-active refined phase exists, reuse it (reuse_existing_fact) instead of generating a new one.',
    '  If no still-active refined phase covers the current time, you SHOULD generate_new_fact as a new refined instantaneous phase of that macro event. A macro event can spawn multiple non-overlapping refined phases over its lifetime.',
    '  Set sceneSemantics.parentEventTag to the parent candidate_fact\'s event_id.',
    '  Set sceneSemantics.parentEventPhase to a short label for the current phase (e.g., "packing", "in-transit", "arriving", "exploring-old-town", "lakeside-walk"). Each new phase should be distinct from previous phases of the same parent event.',
    '  Set sceneSemantics.parentEventProgress to elapsed_minutes / estimated_duration_minutes from the parent fact (already available as precomputed numbers).',
    '  The refined fact must be temporally plausible: location, action, appearance, and emotion should reflect what would realistically be happening at this point in the larger event. Consider previously generated phases (visible as expired candidate_facts with the same parent_event_tag) to ensure narrative continuity and avoid repeating the same phase.',
    '  Set estimated_duration_minutes for the refined phase to a reasonable sub-interval (typically 30-120 minutes).',
    '- ANTI-RECURSION GUARD: If a candidate_fact has has_parent_event=true, it is itself a refined phase. Do NOT generate a further refinement of it. Treat it as a normal reusable fact instead. This prevents infinite subdivision.',
    '- When a macro event fact has is_within_duration_window=false, it has expired. Do NOT reference it as a parent. The macro event is complete.',
  ];

  const appearanceRules = [
    'Priority C2 - Appearance and clothing constraints:',
    '- If decision.action is generate_new_fact, generated_fact.sceneSemantics must be complete and explain scene fit.',
    '- If decision.action is generate_new_fact, generated_fact.appearanceLogic must be complete and explain continuity vs change.',
    '- Appearance and clothing must depend on the concrete event itself. Exercise, bathing, sleep, formal outings, and buying/changing clothes are strong appearance drivers.',
    '- Clothing must be season-aware using collector.world_context season signals. Avoid obvious seasonal contradictions (for example, heavy winter layers in summer or summerwear in winter) unless rationale clearly explains why.',
    '- If there is not enough reason for an outfit change, prefer same-day clothing continuity and avoid repeated same-day appearance drift.',
  ];

  const conversationAndRecoveryRules = [
    'Priority D - Conversation continuity and recovery hints:',
    '- For now queries, if collector.conversation_context.should_prefer_conversation_continuity_for_now=true, treat continuing the just-active conversation as highest-priority near-field reality.',
    '- If the current session is inside the stickiness window, prefer continuity with the active topic over unrelated off-thread life scenes.',
    '- collector.request.recovery_hint is an internal structured control signal.',
    '- If recovery_hint is no_reuse_allowed, you must not output reuse_existing_fact.',
    '- If recovery_hint is prefer_generation, prefer generate_new_fact over return_empty when generation is safe.',
    '- If recovery_hint is forgetfulness_only, prefer return_empty with a clear forgetfulness rationale.',
  ];

  const outputSchema = [
    '',
    'Output format:',
    'Output a JSON object matching TimelineReasonerOutput with this shape:',
    JSON.stringify({
      schema_version: '1.0',
      request_id: 'echo collector.request_id',
      request_type: 'now | past_point | past_range',
      time_interpretation: {
        normalized_kind: 'now | point | range',
        normalized_point: 'optional',
        normalized_start: 'optional',
        normalized_end: 'optional',
        match_strategy: 'exact_match | continuation | range_summary | generated',
        summary: 'how you interpreted the user time semantics',
      },
      decision: {
        action: 'reuse_existing_fact | generate_new_fact | return_empty',
        selected_fact_id: 'required when action is reuse_existing_fact',
        should_write_canon: true,
      },
      continuity: {
        judged: true,
        is_continuing: true,
        reason: 'continuity reasoning summary',
      },
      estimated_duration_minutes: 'integer, required when action is reuse_existing_fact or generate_new_fact',
      rationale: {
        summary: 'short summary',
        hard_fact_basis: ['...'],
        canon_basis: ['...'],
        persona_basis: ['...'],
        constraint_basis: ['...'],
        uncertainty: 'optional',
      },
      generated_fact: {
        timestamp: 'optional ISO-like timestamp when generation should land at a specific past point or past range',
        location: 'string',
        action: 'string',
        emotionTags: ['string'],
        appearance: 'string',
        internalMonologue: 'string',
        confidence: 0.8,
        reason: 'string',
        sceneSemantics: {
          activityMode: 'sleep | bath | meal | work_or_study | commute | exercise | social | shopping | leisure | domestic | errands | transition | rest | unknown',
          continuityRelation: 'same_day_continuation | same_scene_continuation | shifted_scene | return_home | fresh_moment | unknown',
          rationale: 'why this generated scene fits the current timeline state',
          estimatedDurationMinutes: 'optional integer, mirrors top-level estimated_duration_minutes',
          parentEventTag: 'optional string, must be the exact event_id of the parent macro event candidate_fact — do NOT invent values',
          parentEventPhase: 'optional string, short label for the current phase of the macro event (e.g., "packing", "in-transit", "settling-in")',
          parentEventProgress: 'optional float 0.0-1.0, elapsed proportion of the macro event duration',
        },
        appearanceLogic: {
          transition: 'inherit | change_required | change_allowed | unknown',
          changeReason: 'same_day_continuation | exercise | bath | sleep | formal_outing | shopping | weather_adjustment | unknown',
          outfitMode: 'casual_home | casual_outing | workwear | sportswear | sleepwear | bathrobe | dressed_up | fresh_purchase | unknown',
        },
      },
    }, null, 2),
  ];

  return [
    ...coreRules,
    ...reasoningRules,
    ...generationRules,
    ...macroEventRules,
    ...appearanceRules,
    ...conversationAndRecoveryRules,
    ...outputSchema,
  ].join('\n');
}

function setClock(parts: TimestampParts, hour: number, minute = 0, second = 0): TimestampParts {
  return {
    ...parts,
    hour,
    minute,
    second,
  };
}

function normalizeHourFromQuery(query: string): number | null {
  const digitMatch = query.match(/(\d{1,2})点/);
  let hour: number | null = digitMatch ? Number(digitMatch[1]) : null;
  if (hour === null) {
    const chineseHourMap: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      十一: 11,
      十二: 12,
    };
    const chineseMatch = query.match(/(十一|十二|十|零|一|二|两|三|四|五|六|七|八|九)点/);
    if (chineseMatch) {
      hour = chineseHourMap[chineseMatch[1]] ?? null;
    }
  }
  if (hour === null) return null;
  if ((/昨晚|晚上|傍晚|夜里/.test(query)) && hour < 12) {
    return hour === 12 ? 12 : hour + 12;
  }
  if ((/下午/.test(query)) && hour < 12) {
    return hour === 12 ? 12 : hour + 12;
  }
  return hour;
}

function buildFallbackTimelineQueryPlan(
  input: TimelineResolveInput,
  anchor: { now: string; timezone: string },
): TimelineQueryPlan {
  const query = String(input.query || '').trim();
  const anchorParts = parseTimestampParts(anchor.now);
  if (!anchorParts) {
    return {
      schema_version: '1.0',
      target_time_range: 'now',
      summary: 'Fallback planner defaulted to now because anchor.now was not parseable.',
    };
  }

  if (/昨晚|昨天|上周|前天/.test(query) && /点/.test(query)) {
    const targetHour = normalizeHourFromQuery(query) ?? 20;
    const targetDay = addHours(anchorParts, -24);
    return {
      schema_version: '1.0',
      target_time_range: 'past_point',
      normalized_point: formatTimestamp(setClock(targetDay, targetHour, 0, 0)),
      summary: 'Fallback planner normalized the query into a concrete past point.',
    };
  }

  if (/最近|这几天|昨晚|今天都|昨天都/.test(query)) {
    if (/昨晚/.test(query)) {
      const targetDay = addHours(anchorParts, -24);
      return {
        schema_version: '1.0',
        target_time_range: 'past_range',
        normalized_start: formatTimestamp(setClock(targetDay, 18, 0, 0)),
        normalized_end: formatTimestamp(setClock(targetDay, 23, 59, 59)),
        summary: 'Fallback planner normalized the query into last night\'s evening range.',
      };
    }
    const recentStart = addHours(anchorParts, -24 * 7);
    return {
      schema_version: '1.0',
      target_time_range: 'past_range',
      normalized_start: formatTimestamp(setClock(recentStart, 0, 0, 0)),
      normalized_end: anchor.now,
      summary: 'Fallback planner normalized the query into a recent past range.',
    };
  }

  return {
    schema_version: '1.0',
    target_time_range: 'now',
    summary: 'Fallback planner normalized the query into the current moment.',
  };
}

function parseTimestampMs(timestamp: string | undefined): number {
  if (!timestamp) return Number.NaN;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function selectLatestFact(facts: CollectedTimelineFact[]): CollectedTimelineFact | null {
  return [...facts]
    .sort((left, right) => parseTimestampMs(right.timestamp) - parseTimestampMs(left.timestamp))[0] || null;
}

function scorePastRangeFact(fact: CollectedTimelineFact, query: string): number {
  let score = parseTimestampMs(fact.timestamp);
  const haystack = `${fact.location} ${fact.action} ${(fact.emotion_tags || []).join(' ')}`;

  if (/有趣|好玩|开心|趣事/.test(query) && /(朋友|球|篮球|烧烤|聊天|公园|运动|开心)/.test(haystack)) {
    score += 1000 * 60 * 60 * 24 * 30;
  }
  if (/昨晚/.test(query)) {
    const parts = parseTimestampParts(fact.timestamp);
    if (parts && parts.hour >= 18 && parts.hour <= 23) {
      score += 1000 * 60 * 60 * 12;
    }
  }

  return score;
}

function selectFallbackFact(collector: TimelineCollectorOutput): CollectedTimelineFact | null {
  const facts = collector.candidate_facts || [];
  if (facts.length === 0) return null;

  if (collector.window.query_range === 'now') {
    return selectLatestFact(facts);
  }

  if (collector.window.query_range === 'past_point') {
    const query = String(collector.request.user_query || '');
    const explicitHour = normalizeHourFromQuery(query);
    if (explicitHour === null) {
      return selectLatestFact(facts);
    }

    return [...facts].sort((left, right) => {
      const leftParts = parseTimestampParts(left.timestamp);
      const rightParts = parseTimestampParts(right.timestamp);
      const leftDistance = leftParts ? Math.abs((leftParts.hour * 60 + leftParts.minute) - explicitHour * 60) : Number.MAX_SAFE_INTEGER;
      const rightDistance = rightParts ? Math.abs((rightParts.hour * 60 + rightParts.minute) - explicitHour * 60) : Number.MAX_SAFE_INTEGER;
      return leftDistance - rightDistance || (parseTimestampMs(right.timestamp) - parseTimestampMs(left.timestamp));
    })[0] || null;
  }

  const query = String(collector.request.user_query || '');
  return [...facts].sort((left, right) =>
    scorePastRangeFact(right, query) - scorePastRangeFact(left, query),
  )[0] || null;
}

function buildFallbackTimeInterpretation(collector: TimelineCollectorOutput, selectedFact?: CollectedTimelineFact | null) {
  if (collector.window.query_range === 'now') {
    return {
      normalized_kind: 'now' as const,
      match_strategy: selectedFact ? 'continuation' as const : 'generated' as const,
      summary: 'Fallback reasoner treated the request as a current-moment query.',
    };
  }
  if (collector.window.query_range === 'past_point') {
    const query = String(collector.request.user_query || '');
    const hour = normalizeHourFromQuery(query);
    const anchorParts = parseTimestampParts(collector.anchor.now);
    const targetDay = anchorParts ? addHours(anchorParts, -24) : null;
    return {
      normalized_kind: 'point' as const,
      normalized_point: targetDay && hour !== null ? formatTimestamp(setClock(targetDay, hour, 0, 0)) : selectedFact?.timestamp,
      match_strategy: selectedFact ? 'continuation' as const : 'generated' as const,
      summary: 'Fallback reasoner treated the request as a concrete past point query.',
    };
  }
  return {
    normalized_kind: 'range' as const,
    normalized_start: collector.window.start,
    normalized_end: collector.window.end,
    match_strategy: selectedFact ? 'range_summary' as const : 'generated' as const,
    summary: 'Fallback reasoner treated the request as a past range query.',
  };
}

function buildFallbackReasonerOutput(
  collector: TimelineCollectorOutput,
  error: unknown,
): TimelineReasonerOutput {
  const selectedFact = selectFallbackFact(collector);
  const fallbackReason = error instanceof Error ? error.message : String(error);

  if (!selectedFact) {
    return {
      schema_version: '1.0',
      request_id: collector.request_id,
      request_type: collector.window.query_range,
      time_interpretation: buildFallbackTimeInterpretation(collector, null),
      decision: {
        action: 'return_empty',
        should_write_canon: false,
      },
      continuity: {
        judged: collector.window.query_range !== 'past_range',
        is_continuing: false,
        reason: `Fallback reasoner could not find a reusable canon fact after: ${fallbackReason}`,
      },
      rationale: {
        summary: 'Fallback reasoner returned empty because no reusable canon fact was available.',
        hard_fact_basis: collector.hard_facts.sessions_history.slice(0, 2),
        canon_basis: [],
        persona_basis: [],
        constraint_basis: [],
        uncertainty: fallbackReason,
      },
    };
  }

  const selectedParts = parseTimestampParts(selectedFact.timestamp);
  const targetHour = normalizeHourFromQuery(String(collector.request.user_query || ''));
  const isPastPointContinuation = Boolean(
    collector.window.query_range === 'past_point'
    && selectedParts
    && targetHour !== null
    && Math.abs((selectedParts.hour * 60 + selectedParts.minute) - targetHour * 60) <= 90,
  );

  return {
    schema_version: '1.0',
    request_id: collector.request_id,
    request_type: collector.window.query_range,
    time_interpretation: buildFallbackTimeInterpretation(collector, selectedFact),
    decision: {
      action: 'reuse_existing_fact',
      selected_fact_id: selectedFact.fact_id,
      should_write_canon: false,
    },
    continuity: {
      judged: collector.window.query_range !== 'past_range',
      is_continuing: collector.window.query_range === 'now' || isPastPointContinuation,
      reason: 'Fallback reasoner reused the strongest available canon fact when the subagent result was unavailable.',
    },
    rationale: {
      summary: 'Fallback reasoner reused an existing canon fact because the subagent result was unavailable or invalid.',
      hard_fact_basis: collector.hard_facts.sessions_history.slice(0, 2),
      canon_basis: [selectedFact.fact_id],
      persona_basis: [],
      constraint_basis: [],
      uncertainty: fallbackReason,
    },
  };
}

function createTimelineQueryPlanner(
  pluginApi: PluginApiLike,
  toolContext: PluginToolContextLike,
  runtimeConfig: TimelinePluginRuntimeConfig,
): TimelineRuntimeDependencies['planTimelineQuery'] {
  return async (input, anchor) => {
    try {
      if (!String(input.query || '').trim()) {
        throw new Error('Timeline query planner dependency missing query');
      }

      const requestId = makePlannerRequestId();
      const baseSessionKey = toolContext.sessionKey || `plugin:${runtimeConfig.reasonerSessionPrefix}`;
      const plannerSessionKey = `${baseSessionKey}:${runtimeConfig.reasonerSessionPrefix}:planner:${requestId}`;

      return await withPreferredSubagentRuntime(pluginApi, 'Timeline query planner', async (subagentRuntime) => {
        try {
          const runResult = await subagentRuntime.run({
            sessionKey: plannerSessionKey,
            message: buildTimelineQueryPlannerMessage(input, anchor, requestId),
            extraSystemPrompt: buildTimelineQueryPlannerSystemPrompt(),
            deliver: false,
            idempotencyKey: requestId,
          });
          const waitResult = await subagentRuntime.waitForRun({
            runId: runResult.runId,
            timeoutMs: runtimeConfig.reasonerTimeoutMs,
          });
          if (waitResult.status === 'timeout') {
            throw new Error('Timeline query planner returned no decision');
          }
          if (waitResult.status === 'error') {
            throw new Error(waitResult.error || 'Timeline query planner returned no decision');
          }

          const session = await subagentRuntime.getSessionMessages({
            sessionKey: plannerSessionKey,
            limit: runtimeConfig.reasonerMessageLimit,
          });
          const jsonText = extractJsonObjectFromMessages(
            session.messages || [],
            'Timeline query planner',
            requestId,
          );
          const parsed = JSON.parse(jsonText) as TimelineQueryPlan & { request_id?: string };
          if (parsed.request_id && parsed.request_id !== requestId) {
            throw new Error('Timeline query planner returned mismatched request_id');
          }
          if (!['now', 'past_point', 'past_range'].includes(parsed.target_time_range)) {
            throw new Error('Timeline query planner returned an invalid target_time_range');
          }
          return parsed;
        } finally {
          try {
            await subagentRuntime.deleteSession?.({
              sessionKey: plannerSessionKey,
              deleteTranscript: true,
            });
          } catch (error) {
            pluginApi.logger?.debug?.('timeline query planner session cleanup skipped', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
    } catch (error) {
      pluginApi.logger?.warn?.('timeline query planner fallback engaged', {
        error: error instanceof Error ? error.message : String(error),
      });
      return buildFallbackTimelineQueryPlan(input, anchor);
    }
  };
}

function buildTimelineReasonerMessage(collector: TimelineCollectorOutput): string {
  return [
    'Perform structured time reasoning using only the collector JSON below.',
    '',
    'collector:',
    JSON.stringify(collector, null, 2),
  ].join('\n');
}

function createSubagentReasoner(
  pluginApi: PluginApiLike,
  toolContext: PluginToolContextLike,
  runtimeConfig: TimelinePluginRuntimeConfig,
): TimelineRuntimeDependencies['reasonTimeline'] {
  return async (collector) => {
    try {
      const baseSessionKey = toolContext.sessionKey || `plugin:${runtimeConfig.reasonerSessionPrefix}`;
      const reasonerSessionKey = `${baseSessionKey}:${runtimeConfig.reasonerSessionPrefix}:${collector.request_id}`;

      return await withPreferredSubagentRuntime(pluginApi, 'Timeline reasoner', async (subagentRuntime) => {
        try {
          const runResult = await subagentRuntime.run({
            sessionKey: reasonerSessionKey,
            message: buildTimelineReasonerMessage(collector),
            extraSystemPrompt: buildTimelineReasonerSystemPrompt(),
            deliver: false,
            idempotencyKey: collector.request_id,
          });
          const waitResult = await subagentRuntime.waitForRun({
            runId: runResult.runId,
            timeoutMs: runtimeConfig.reasonerTimeoutMs,
          });
          if (waitResult.status === 'timeout') {
            throw new Error('Timeline reasoner returned no decision');
          }
          if (waitResult.status === 'error') {
            throw new Error(waitResult.error || 'Timeline reasoner returned no decision');
          }

          const session = await subagentRuntime.getSessionMessages({
            sessionKey: reasonerSessionKey,
            limit: runtimeConfig.reasonerMessageLimit,
          });
          const jsonText = extractJsonObjectFromMessages(
            session.messages || [],
            'Timeline reasoner',
            collector.request_id,
          );
          return JSON.parse(jsonText) as TimelineReasonerOutput;
        } finally {
          try {
            await subagentRuntime.deleteSession?.({
              sessionKey: reasonerSessionKey,
              deleteTranscript: true,
            });
          } catch (error) {
            pluginApi.logger?.debug?.('timeline reasoner session cleanup skipped', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
    } catch (error) {
      pluginApi.logger?.warn?.('timeline reasoner fallback engaged', {
        error: error instanceof Error ? error.message : String(error),
      });
      return buildFallbackReasonerOutput(collector, error);
    }
  };
}

// -------------------------------------------------------------
// Scene Transition Planner Subagent integration
// -------------------------------------------------------------
import { TimelineTransitionInput, TransitionPlan } from '../core/transition_planner_contract';
import { buildTransitionPlannerSystemPrompt, buildTransitionPlannerMessage } from '../core/transition_planner';
import { PersonaContractV1 } from '../persona/persona_contract';

function createSubagentTransitionPlanner(
  pluginApi: PluginApiLike,
  toolContext: PluginToolContextLike,
  runtimeConfig: TimelinePluginRuntimeConfig,
) {
  return async (
    input: TimelineTransitionInput,
    anchor: { now: string; timezone: string },
    persona: PersonaContractV1,
    activeFacts: CollectedTimelineFact[]
  ): Promise<TransitionPlan> => {
    const requestId = `trans-${Date.now()}`;
    const baseSessionKey = toolContext.sessionKey || `plugin:${runtimeConfig.reasonerSessionPrefix}`;
    const transitionSessionKey = `${baseSessionKey}:transition-planner:${requestId}`;

    return await withPreferredSubagentRuntime(pluginApi, 'Timeline transition planner', async (subagentRuntime) => {
      try {
        const runResult = await subagentRuntime.run({
          sessionKey: transitionSessionKey,
          message: buildTransitionPlannerMessage(input, anchor, persona, activeFacts, requestId),
          extraSystemPrompt: buildTransitionPlannerSystemPrompt(),
          deliver: false,
          idempotencyKey: requestId,
        });
        const waitResult = await subagentRuntime.waitForRun({
          runId: runResult.runId,
          timeoutMs: runtimeConfig.reasonerTimeoutMs,
        });
        if (waitResult.status === 'timeout') {
          throw new Error('Timeline transition planner returned no decision');
        }
        if (waitResult.status === 'error') {
          throw new Error(waitResult.error || 'Timeline transition planner returned no decision');
        }

        const session = await subagentRuntime.getSessionMessages({
          sessionKey: transitionSessionKey,
          limit: runtimeConfig.reasonerMessageLimit,
        });
        const jsonText = extractJsonObjectFromMessages(
          session.messages || [],
          'Timeline transition planner',
        );
        return JSON.parse(jsonText) as TransitionPlan;
      } finally {
        try {
          await subagentRuntime.deleteSession?.({
            sessionKey: transitionSessionKey,
            deleteTranscript: true,
          });
        } catch (error) {
          pluginApi.logger?.debug?.('timeline transition planner session cleanup skipped', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
  };
}

function createRuntimeJsonPromptRunner(
  pluginApi: PluginApiLike,
): (input: {
  sessionKey: string;
  requestId: string;
  message: string;
  extraSystemPrompt: string;
  timeoutMs: number;
  sourceLabel: string;
}) => Promise<Record<string, unknown>> {
  return async (input) => {
    return withPreferredSubagentRuntime(pluginApi, input.sourceLabel, async (subagentRuntime) => {
      try {
        const runResult = await subagentRuntime.run({
          sessionKey: input.sessionKey,
          message: input.message,
          extraSystemPrompt: input.extraSystemPrompt,
          deliver: false,
          idempotencyKey: input.requestId,
        });
        const waitResult = await subagentRuntime.waitForRun({
          runId: runResult.runId,
          timeoutMs: input.timeoutMs,
        });
        if (waitResult.status === 'timeout') {
          throw new Error(`${input.sourceLabel} returned no decision`);
        }
        if (waitResult.status === 'error') {
          throw new Error(waitResult.error || `${input.sourceLabel} returned no decision`);
        }
        const session = await subagentRuntime.getSessionMessages({
          sessionKey: input.sessionKey,
          limit: 24,
        });
        const jsonText = extractJsonObjectFromMessages(
          session.messages || [],
          input.sourceLabel,
          input.requestId,
        );
        return JSON.parse(jsonText) as Record<string, unknown>;
      } finally {
        try {
          await subagentRuntime.deleteSession?.({
            sessionKey: input.sessionKey,
            deleteTranscript: true,
          });
        } catch (error) {
          pluginApi.logger?.debug?.('timeline structured prompt session cleanup skipped', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
  };
}

function createTimelineResolveDependencies(
  pluginApi: PluginApiLike,
  toolContext: PluginToolContextLike,
): Partial<TimelineRuntimeDependencies> {
  const runtimeConfig = resolvePluginRuntimeConfig(pluginApi.pluginConfig);
  const workspaceDir = resolveWorkspaceDir(pluginApi, toolContext);
  const canonicalRootPath = resolveConfiguredPath(workspaceDir, runtimeConfig.canonicalMemoryRoot, 'memory');
  const canonicalRootName = path.basename(canonicalRootPath);
  const traceLogPath = runtimeConfig.enableTrace
    ? resolveConfiguredPath(workspaceDir, runtimeConfig.traceLogPath, path.join(canonicalRootName, '.timeline-trace.log'))
    : undefined;
  const baseSessionKey = toolContext.sessionKey || `plugin:${runtimeConfig.reasonerSessionPrefix}`;
  const legacyPersonaExtractor = createLegacyPersonaExtractorRuntime({
    baseSessionKey,
    sessionPrefix: runtimeConfig.personaExtractorSessionPrefix,
    timeoutMs: runtimeConfig.personaExtractorTimeoutMs,
    modelId: 'openclaw-subagent',
    extractorVersion: 'persona-contract-v1',
    runJsonPrompt: createRuntimeJsonPromptRunner(pluginApi),
  });

  return {
    currentTime: async () => ({
      now: formatCurrentTimestamp(new Date()),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }),
    sessionsHistory: async () => {
      const sessionKey = toolContext.sessionKey;
      if (!sessionKey) return [];
      try {
        const session = await withPreferredSubagentRuntime(pluginApi, 'timeline sessionsHistory', (subagentRuntime) =>
          subagentRuntime.getSessionMessages({
            sessionKey,
            limit: runtimeConfig.sessionHistoryLimit,
          }),
        );
        return normalizeSessionHistory(session.messages || [], runtimeConfig.sessionHistoryLimit);
      } catch (error) {
        pluginApi.logger?.debug?.('timeline sessionsHistory fallback to empty', {
          error: error instanceof Error ? error.message : String(error),
        });
          return [];
        }
      },
    conversationContext: async (window, input) => {
      const sessionKey = toolContext.sessionKey;
      if (!sessionKey) {
        return {
          is_recently_active: false,
          minutes_since_last_turn: null,
          stickiness_window_minutes: runtimeConfig.conversationStickinessWindowMinutes,
          active_topic_summary: '',
          should_prefer_conversation_continuity_for_now: false,
        };
      }
      try {
        const session = await withPreferredSubagentRuntime(pluginApi, 'timeline conversationContext', (subagentRuntime) =>
          subagentRuntime.getSessionMessages({
            sessionKey,
            limit: runtimeConfig.sessionHistoryLimit,
          }),
        );
        return buildConversationContextFromMessages(
          session.messages || [],
          window.end,
          input,
          runtimeConfig.conversationStickinessWindowMinutes,
          window.query_range,
        );
      } catch (error) {
        pluginApi.logger?.debug?.('timeline conversationContext fallback to inactive', {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          is_recently_active: false,
          minutes_since_last_turn: null,
          stickiness_window_minutes: runtimeConfig.conversationStickinessWindowMinutes,
          active_topic_summary: '',
          should_prefer_conversation_continuity_for_now: false,
        };
      }
    },
    memoryGet: async (calendarDate) => {
      const filePath = path.join(canonicalRootPath, `${calendarDate}.md`);
      return readWorkspaceTextFile(filePath);
    },
    memorySearch: async (window, input) => {
      const createMemorySearchTool = pluginApi.runtime?.tools?.createMemorySearchTool;
      if (!createMemorySearchTool) return [];
      const query = buildMemorySearchQuery(input);
      if (!query) return [];

      const tool = createMemorySearchTool({
        config: pluginApi.config,
        agentSessionKey: toolContext.sessionKey,
      });
      if (!tool) return [];

      try {
        const result = await tool.execute(`timeline-memory-search-${Date.now()}`, {
          query,
          maxResults: runtimeConfig.memorySearchMaxResults,
        });
        const payload = result?.details as { disabled?: boolean; results?: unknown[] } | undefined;
        if (!payload || payload.disabled || !Array.isArray(payload.results)) return [];
        return payload.results.map((entry) => stringifySearchResult(entry)).filter(Boolean);
      } catch (error) {
        pluginApi.logger?.debug?.('timeline memorySearch fallback to empty', {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
    personaContext: async () => {
      const loaded = await loadTimelinePersonaContractFromWorkspace(workspaceDir, {
        extractLegacyPersonaContract: legacyPersonaExtractor,
        cacheDirName: '.timeline-cache/persona-contract',
        maxAttempts: 3,
      });
      return {
        contract: loaded.contract,
        available_sources: loaded.available_sources,
        should_constrain_generation: loaded.should_constrain_generation,
      };
    },
    extractLegacyPersonaContract: legacyPersonaExtractor,
    personaCacheDirName: '.timeline-cache/persona-contract',
    personaExtractionMaxAttempts: 3,
    memoryFilePath: (calendarDate) => path.join(canonicalRootPath, `${calendarDate}.md`),
    canonicalRootName,
    traceLogPath,
    planTimelineQuery: createTimelineQueryPlanner(pluginApi, toolContext, runtimeConfig),
    reasonTimeline: createSubagentReasoner(pluginApi, toolContext, runtimeConfig),
  };
}

export function makeOpenClawTimelineResolveToolFactory(pluginApi: PluginApiLike) {
  return (toolContext: PluginToolContextLike): AgentToolLike => ({
    name: timelineResolveToolSpec.name,
    description: timelineResolveToolSpec.description,
    parameters: timelineResolveToolSpec.inputSchema,
    execute: async (_toolCallId, params) =>
      wrapToolPayload(await timelineResolve(params as never, createTimelineResolveDependencies(pluginApi, toolContext))),
  });
}

import { timelineTransition, timelineTransitionToolSpec } from '../tools/timeline_transition';

export function makeOpenClawTimelineTransitionToolFactory(pluginApi: PluginApiLike) {
  return (toolContext: PluginToolContextLike): AgentToolLike => ({
    name: timelineTransitionToolSpec.name,
    description: timelineTransitionToolSpec.description,
    parameters: timelineTransitionToolSpec.inputSchema,
    execute: async (_toolCallId, params) => {
      const deps = createTimelineResolveDependencies(pluginApi, toolContext);
      const transitionDeps = {
        ...deps,
        planTransition: createSubagentTransitionPlanner(pluginApi, toolContext, resolvePluginRuntimeConfig(pluginApi.pluginConfig))
      };
      return wrapToolPayload(await timelineTransition(params as any, transitionDeps as any));
    }
  });
}

