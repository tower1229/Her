import * as fs from 'fs';
import * as path from 'path';
import {
  TimelineCollectorOutput,
  TimelineReasonerOutput,
} from '../core/timeline_reasoner_contract';
import {
  timelineResolve,
  timelineResolveToolSpec,
  TimelineRuntimeDependencies,
} from '../tools/timeline_resolve';
import { timelineRepair, timelineRepairToolSpec } from '../tools/timeline_repair';
import { timelineStatus, timelineStatusToolSpec } from '../tools/timeline_status';

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

interface TimelinePluginRuntimeConfig {
  enableTrace: boolean;
  traceLogPath?: string;
  canonicalMemoryRoot: string;
  reasonerMode: 'subagent' | 'disabled';
  reasonerTimeoutMs: number;
  reasonerSessionPrefix: string;
  reasonerMessageLimit: number;
  sessionHistoryLimit: number;
  memorySearchMaxResults: number;
}

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
    reasonerMode: pluginConfig?.reasonerMode === 'disabled' ? 'disabled' : 'subagent',
    reasonerTimeoutMs: readInteger(pluginConfig?.reasonerTimeoutMs, 45000),
    reasonerSessionPrefix: readString(pluginConfig?.reasonerSessionPrefix) || 'timeline-reasoner',
    reasonerMessageLimit: readInteger(pluginConfig?.reasonerMessageLimit, 24),
    sessionHistoryLimit: readInteger(pluginConfig?.sessionHistoryLimit, 12),
    memorySearchMaxResults: readInteger(pluginConfig?.memorySearchMaxResults, 6),
  };
}

function wrapToolPayload(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
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

function buildMemorySearchQuery(input: { query?: string; reason: string }, semanticTarget: string): string | null {
  const explicit = readString(input.query);
  if (explicit) return explicit;

  if (semanticTarget === 'past_range' && input.reason === 'past_recall') {
    return '最近三天发生了什么，在忙什么，有什么有趣的事';
  }
  if (semanticTarget === 'past_point') {
    return '回忆指定时间点附近发生的事情，并考虑可持续覆盖到该时间点的活动';
  }
  if (semanticTarget === 'past_range') {
    return '回忆指定时间范围发生的事情，并优先找更鲜活、值得提起的内容';
  }
  if (semanticTarget === 'now' || input.reason === 'current_status') {
    return '当前状态，现在在哪里，在做什么';
  }
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

function normalizeSessionHistory(messages: unknown[], limit: number): string[] {
  return messages
    .map((message) => {
      const role = typeof (message as { role?: unknown })?.role === 'string'
        ? String((message as { role?: string }).role).trim()
        : 'unknown';
      const text = extractMessageText(message);
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean)
    .slice(-limit);
}

function extractLatestAssistantText(messages: unknown[]): string {
  const reversed = [...messages].reverse();
  for (const message of reversed) {
    const role = typeof (message as { role?: unknown })?.role === 'string'
      ? String((message as { role?: string }).role).trim()
      : '';
    const text = extractMessageText(message);
    if (role === 'assistant' && text) return text;
  }
  for (const message of reversed) {
    const text = extractMessageText(message);
    if (text) return text;
  }
  return '';
}

function tryExtractJsonObject(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || text.trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error('Timeline reasoner did not return a JSON object');
  }
  return candidate.slice(firstBrace, lastBrace + 1);
}

function buildTimelineReasonerSystemPrompt(): string {
  return [
    '你是 Timeline 插件内部的时间语义推理器。',
    '你的唯一任务，是基于 collector 提供的事实包，输出一个严格符合 TimelineReasonerOutput 结构的 JSON 对象。',
    '禁止调用任何工具，禁止引用 collector 之外的新既有事实，禁止输出 Markdown、解释或多余文本。',
    '必须遵守这些约束：',
    '1. 会话硬事实和已存在 canon 优先于生成。',
    '2. 如果 collector.request.mode 是 read_only，则绝不能 generate_new_fact。',
    '3. 如果 decision.action 是 reuse_existing_fact，selected_fact_id 必须来自 candidate_facts。',
    '4. 如果 decision.action 是 generate_new_fact，必须给出完整 generated_fact，并且 should_write_canon=true。',
    '5. 如果当前信息不足且不应复用或生成，才允许 return_empty。',
    '6. continuity 字段必须如实表达是否做了延续性判断，以及判断理由。',
    '7. request_type 只能是 now、past_point、past_range。',
    '8. recent_3d 只是口语“最近”的内部范围约定，本质属于 past_range。',
    '9. continuity 不是独立请求类型；它只是 now 或 past_point 查询中的推理结果。',
    '10. past_point 可以通过精确命中，或通过“较早事实自然持续到目标时间点”的方式命中。',
    '11. past_range 需要先理解自然语言对应的时间范围，再从该范围内挑选最相关、最鲜活、最值得提的事实。',
    '12. 如果用户在问“有趣”“好玩”“忙不忙”这类语义筛选词，必须先理解筛选语义，再决定复用什么事实或生成什么事实。',
    '13. 如果为 past_point 或 past_range 生成新事实，generated_fact 应尽量提供一个合理的 timestamp，并保证它落在目标时间点或目标时间范围内，而不是默认落在当前时刻。',
  ].join('\n');
}

function buildTimelineReasonerMessage(collector: TimelineCollectorOutput): string {
  return [
    '请只根据下面的 collector JSON 做结构化时间推理。',
    '输出一个 JSON 对象，字段必须满足 TimelineReasonerOutput：',
    JSON.stringify({
      schema_version: '1.0',
      request_id: collector.request_id,
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
        selected_fact_id: 'reuse_existing_fact 时必填',
        should_write_canon: true,
      },
      continuity: {
        judged: true,
        is_continuing: true,
        reason: 'continuity reasoning summary',
      },
      rationale: {
        summary: 'short summary',
        hard_fact_basis: ['...'],
        canon_basis: ['...'],
        persona_basis: ['...'],
        uncertainty: 'optional',
      },
      generated_fact: {
        timestamp: 'optional ISO-like timestamp when generation should land at a specific past point or past range',
        location: 'string',
        action: 'string',
        emotionTags: ['string'],
        appearance: 'string',
        internalMonologue: 'string',
        naturalText: 'string',
        confidence: 0.8,
        reason: 'string',
      },
    }, null, 2),
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
    const subagentRuntime = pluginApi.runtime?.subagent;
    if (!subagentRuntime?.run || !subagentRuntime.waitForRun || !subagentRuntime.getSessionMessages) {
      throw new Error('Timeline reasoner dependency missing');
    }

    const baseSessionKey = toolContext.sessionKey || `plugin:${runtimeConfig.reasonerSessionPrefix}`;
    const reasonerSessionKey = `${baseSessionKey}:${runtimeConfig.reasonerSessionPrefix}:${collector.request_id}`;

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
      const assistantText = extractLatestAssistantText(session.messages || []);
      const jsonText = tryExtractJsonObject(assistantText);
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

  return {
    currentTime: async () => ({
      now: formatCurrentTimestamp(new Date()),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }),
    sessionsHistory: async () => {
      const sessionKey = toolContext.sessionKey;
      const getSessionMessages = pluginApi.runtime?.subagent?.getSessionMessages;
      if (!sessionKey || !getSessionMessages) return [];
      try {
        const session = await getSessionMessages({
          sessionKey,
          limit: runtimeConfig.sessionHistoryLimit,
        });
        return normalizeSessionHistory(session.messages || [], runtimeConfig.sessionHistoryLimit);
      } catch (error) {
        pluginApi.logger?.debug?.('timeline sessionsHistory fallback to empty', {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    },
    memoryGet: async (calendarDate) => {
      const filePath = path.join(canonicalRootPath, `${calendarDate}.md`);
      return readWorkspaceTextFile(filePath);
    },
    memorySearch: async (window, input) => {
      const createMemorySearchTool = pluginApi.runtime?.tools?.createMemorySearchTool;
      if (!createMemorySearchTool) return [];
      const query = buildMemorySearchQuery(input, window.semantic_target);
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
    coreFiles: async () => ({
      soul: readWorkspaceTextFile(path.join(workspaceDir, 'SOUL.md')),
      memory: readWorkspaceTextFile(path.join(workspaceDir, 'MEMORY.md')),
      identity:
        readWorkspaceTextFile(path.join(workspaceDir, 'IDENTITY.md'))
        || readWorkspaceTextFile(path.join(workspaceDir, 'IDENTITY')),
    }),
    memoryFilePath: (calendarDate) => path.join(canonicalRootPath, `${calendarDate}.md`),
    canonicalRootName,
    traceLogPath,
    reasonTimeline: runtimeConfig.reasonerMode === 'subagent'
      ? createSubagentReasoner(pluginApi, toolContext, runtimeConfig)
      : undefined,
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

export function makeOpenClawTimelineStatusToolFactory(_pluginApi: PluginApiLike) {
  return (_toolContext: PluginToolContextLike): AgentToolLike => ({
    name: timelineStatusToolSpec.name,
    description: timelineStatusToolSpec.description,
    parameters: timelineStatusToolSpec.inputSchema,
    execute: async (_toolCallId, params) => wrapToolPayload(await timelineStatus(params as never)),
  });
}

export function makeOpenClawTimelineRepairToolFactory(pluginApi: PluginApiLike) {
  return (toolContext: PluginToolContextLike): AgentToolLike => {
    const runtimeConfig = resolvePluginRuntimeConfig(pluginApi.pluginConfig);
    const workspaceDir = resolveWorkspaceDir(pluginApi, toolContext);
    const canonicalRootPath = resolveConfiguredPath(workspaceDir, runtimeConfig.canonicalMemoryRoot, 'memory');
    const traceLogPath = runtimeConfig.enableTrace
      ? resolveConfiguredPath(workspaceDir, runtimeConfig.traceLogPath, path.join(path.basename(canonicalRootPath), '.timeline-trace.log'))
      : undefined;

    return {
      name: timelineRepairToolSpec.name,
      description: timelineRepairToolSpec.description,
      parameters: timelineRepairToolSpec.inputSchema,
      execute: async (_toolCallId, params) =>
        wrapToolPayload(
          await timelineRepair(params as never, {
            canonical_memory_root: canonicalRootPath,
            default_trace_log_path: traceLogPath,
          }),
        ),
    };
  };
}
