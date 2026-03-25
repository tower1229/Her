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
  reasonerTimeoutMs: number;
  reasonerSessionPrefix: string;
  reasonerMessageLimit: number;
  sessionHistoryLimit: number;
  memorySearchMaxResults: number;
  conversationStickinessWindowMinutes: number;
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
    reasonerTimeoutMs: readInteger(pluginConfig?.reasonerTimeoutMs, 90000),
    reasonerSessionPrefix: readString(pluginConfig?.reasonerSessionPrefix) || 'timeline-reasoner',
    reasonerMessageLimit: readInteger(pluginConfig?.reasonerMessageLimit, 24),
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
    '你是 Timeline 插件内部的时间查询归一化器。',
    '你的唯一任务，是把自然语言时间请求归一化为 Timeline 内部可执行的结构化时间计划。',
    '禁止调用任何工具，禁止输出 Markdown、解释或多余文本，只输出严格 JSON。',
    '必须遵守这些约束：',
    '1. 你必须先判断请求属于 now、past_point、past_range 中的哪一类。',
    '2. 不能靠关键词机械枚举，而要真正理解用户语言中的时间语义。',
    '3. now 不输出 normalized_point / normalized_start / normalized_end。',
    '4. past_point 必须输出 normalized_point。',
    '5. past_range 必须输出 normalized_start 和 normalized_end。',
    '6. 对“最近”这类口语范围，要结合 anchor.now 归一化成具体起止时间。',
    '7. 对“昨晚”“今天”“昨天上午”这类表达，要给出符合现实习惯的合理时间范围。',
    '8. 输出时间必须是带时区偏移的 ISO-like 时间戳。',
    '9. 只有用户明确指向某个时刻时，才允许判为 past_point；例如“昨晚八点”“昨天上午十点”“上周六晚上九点”。',
    '10. 只要用户问的是一个时间段或一整个时段，就必须判为 past_range；例如“昨晚在做什么”“今天都忙了什么”“最近有什么有趣的事吗”“这几天怎么样”。',
    '11. “昨晚”本身不是时间点，而是一个晚间范围；只有“昨晚八点”这类带明确时点锚点的表达才是 past_point。',
  ].join('\n');
}

function buildTimelineQueryPlannerMessage(input: TimelineResolveInput, anchor: { now: string; timezone: string }, requestId: string): string {
  return [
    '请只根据下面的信息做时间归一化。',
    '输出 JSON 对象，字段必须满足下列结构：',
    JSON.stringify({
      schema_version: '1.0',
      request_id: requestId,
      target_time_range: 'now | past_point | past_range',
      normalized_point: 'past_point 时必填，其余省略',
      normalized_start: 'past_range 时必填，其余省略',
      normalized_end: 'past_range 时必填，其余省略',
      summary: '你如何理解用户时间语义的简短说明',
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
    '8. continuity 不是独立请求类型；它只是 now 或 past_point 查询中的推理结果。',
    '9. past_point 可以通过精确命中，或通过“较早事实自然持续到目标时间点”的方式命中。',
    '10. past_range 需要先理解已经归一化的时间范围，再从该范围内挑选最相关、最鲜活、最值得提的事实。',
    '11. 如果用户在问“有趣”“好玩”“忙不忙”这类语义筛选词，必须先理解筛选语义，再决定复用什么事实或生成什么事实。',
    '12. 如果为 past_point 或 past_range 生成新事实，generated_fact 应尽量提供一个合理的 timestamp，并保证它落在目标时间点或目标时间范围内，而不是默认落在当前时刻。',
    '13. generated_fact 只输出结构化字段，不要输出自然正文、解释或额外叙述。',
    '14. 如果 collector.persona_context.should_constrain_generation=true，则生成的新事实必须显式参考 SOUL / MEMORY / IDENTITY 中的稳定人格、语气、兴趣、生活习惯或长期约定，不能生成与这些内容冲突的生活片段。',
    '15. 当 persona_context 中存在明确人格线索时，rationale.persona_basis 不能为空，且必须指出本次生成具体参考了哪些 persona 线索。',
    '16. 当 persona_context 中存在明确人格线索时，rationale.constraint_basis 不能为空，且必须指出哪些长期约束限制了生成结果。',
    '17. 不要生成通用、模板化、任何人格都能成立的空泛日常；应尽量让 location、action、emotion、appearance、internalMonologue 都体现该 persona 的生活连续性。',
    '18. MEMORY 中的长期偏好、关系、生活节奏和与用户的长期约定，都是编织时间记忆时的重要约束；它们不是时间事实本身，但会限制什么样的生成是可信的。',
    '19. 还必须遵守 collector.world_context 提供的现实时间逻辑：一日三餐、睡眠、工作/学习、休闲、周末、工作日、节假日的安排都应尽量符合普通现实生活节奏。',
    '20. 如果生成的是凌晨或深夜时段，优先考虑睡眠、休息、安静活动；如果生成的是早餐/午餐/晚餐，则时间应落在合理餐段；不要生成明显违背现实作息的片段。',
    '21. 如果 decision.action 是 generate_new_fact，generated_fact.sceneSemantics 必须完整输出，用来说明本次编织的事件属于什么活动类型、与当天已知状态是什么连续关系，以及为什么这样判断。',
      '22. 如果 decision.action 是 generate_new_fact，generated_fact.appearanceLogic 必须完整输出，用来说明这次事件是否延续当天穿着、是否需要换装、换装原因是什么、最终服装类型属于哪一类。',
      '23. 外貌与穿着必须依赖具体事件本身，而不是脱离事件单独生成；例如运动、洗澡、入睡、正式出门、买到并换上新衣物，都会显著影响 appearanceLogic。',
      '24. 如果没有足够理由触发换装，优先认为当天穿着具有连续性；不要无缘无故在同一天内频繁改变外貌描述。',
      '25. 对 now 查询，如果 collector.conversation_context.should_prefer_conversation_continuity_for_now=true，则“刚刚还在和用户继续这段对话”应被视为最高优先级的近场现实。',
      '26. 如果当前会话仍处于粘连窗口内，优先把当前状态理解为还在和用户继续刚才的话题、思考上一轮内容或准备回应，而不是立即跳到脱离当前会话的生活片段。',
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
      const subagentRuntime = pluginApi.runtime?.subagent;
      if (!subagentRuntime?.run || !subagentRuntime.waitForRun || !subagentRuntime.getSessionMessages) {
        throw new Error('Timeline query planner dependency missing');
      }
      if (!String(input.query || '').trim()) {
        throw new Error('Timeline query planner dependency missing query');
      }

      const requestId = makePlannerRequestId();
      const baseSessionKey = toolContext.sessionKey || `plugin:${runtimeConfig.reasonerSessionPrefix}`;
      const plannerSessionKey = `${baseSessionKey}:${runtimeConfig.reasonerSessionPrefix}:planner:${requestId}`;

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
        conversation_context: {
          is_recently_active: true,
          minutes_since_last_turn: 3,
          stickiness_window_minutes: 10,
          active_topic_summary: 'what the conversation was just about',
          should_prefer_conversation_continuity_for_now: true,
          last_active_timestamp: 'optional timestamp',
        },
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
        },
        appearanceLogic: {
          transition: 'inherit | change_required | change_allowed | unknown',
          changeReason: 'same_day_continuation | exercise | bath | sleep | formal_outing | shopping | weather_adjustment | unknown',
          outfitMode: 'casual_home | casual_outing | workwear | sportswear | sleepwear | bathrobe | dressed_up | fresh_purchase | unknown',
        },
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
    try {
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
    } catch (error) {
      pluginApi.logger?.warn?.('timeline reasoner fallback engaged', {
        error: error instanceof Error ? error.message : String(error),
      });
      return buildFallbackReasonerOutput(collector, error);
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
    conversationContext: async (window, input) => {
      const sessionKey = toolContext.sessionKey;
      const getSessionMessages = pluginApi.runtime?.subagent?.getSessionMessages;
      if (!sessionKey || !getSessionMessages) {
        return {
          is_recently_active: false,
          minutes_since_last_turn: null,
          stickiness_window_minutes: runtimeConfig.conversationStickinessWindowMinutes,
          active_topic_summary: '',
          should_prefer_conversation_continuity_for_now: false,
        };
      }
      try {
        const session = await getSessionMessages({
          sessionKey,
          limit: runtimeConfig.sessionHistoryLimit,
        });
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
    coreFiles: async () => ({
      soul: readWorkspaceTextFile(path.join(workspaceDir, 'SOUL.md')),
      memory:
        readWorkspaceTextFile(path.join(workspaceDir, 'MEMORY.md'))
        || readWorkspaceTextFile(path.join(workspaceDir, 'memory.md')),
      identity:
        readWorkspaceTextFile(path.join(workspaceDir, 'IDENTITY.md'))
        || readWorkspaceTextFile(path.join(workspaceDir, 'IDENTITY')),
      available_sources: [
        readWorkspaceTextFile(path.join(workspaceDir, 'SOUL.md')).trim() ? 'soul' : '',
        (
          readWorkspaceTextFile(path.join(workspaceDir, 'MEMORY.md'))
          || readWorkspaceTextFile(path.join(workspaceDir, 'memory.md'))
        ).trim() ? 'memory' : '',
        (
          readWorkspaceTextFile(path.join(workspaceDir, 'IDENTITY.md'))
          || readWorkspaceTextFile(path.join(workspaceDir, 'IDENTITY'))
        ).trim() ? 'identity' : '',
      ].filter(Boolean),
      should_constrain_generation: Boolean(
        readWorkspaceTextFile(path.join(workspaceDir, 'SOUL.md')).trim()
        || (
          readWorkspaceTextFile(path.join(workspaceDir, 'MEMORY.md'))
          || readWorkspaceTextFile(path.join(workspaceDir, 'memory.md'))
        ).trim()
        || (
          readWorkspaceTextFile(path.join(workspaceDir, 'IDENTITY.md'))
          || readWorkspaceTextFile(path.join(workspaceDir, 'IDENTITY'))
        ).trim(),
      ),
    }),
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
