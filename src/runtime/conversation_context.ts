import { TimelineResolveInput } from '../tools/timeline_resolve';
import { TimelineConversationContext } from '../core/collect_sources';
import { parseTimestampParts } from '../lib/time-utils';

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

function extractRole(value: unknown): string {
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

function extractTimestamp(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const tryKeys = (record: Record<string, unknown>): string | null => {
    const keys = ['createdAt', 'created_at', 'timestamp', 'ts', 'sentAt', 'sent_at'];
    for (const key of keys) {
      if (typeof record[key] === 'string' && String(record[key]).trim()) {
        const candidate = String(record[key]).trim();
        if (!Number.isNaN(Date.parse(candidate)) || parseTimestampParts(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  };
  const record = value as Record<string, unknown>;
  const direct = tryKeys(record);
  if (direct) return direct;
  const nestedMessage = record.message;
  if (nestedMessage && typeof nestedMessage === 'object') {
    return tryKeys(nestedMessage as Record<string, unknown>);
  }
  return null;
}

function minutesBetween(nowIso: string, thenIso: string): number | null {
  const nowMs = Date.parse(nowIso);
  const thenMs = Date.parse(thenIso);
  if (Number.isNaN(nowMs) || Number.isNaN(thenMs)) return null;
  return Math.max(0, Math.round((nowMs - thenMs) / 60000));
}

function normalizeLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function summarizeTopic(messages: unknown[], input: TimelineResolveInput): string {
  const currentQuery = normalizeLine(String(input.query || ''));
  const candidates = [...messages]
    .reverse()
    .map((message) => ({
      role: extractRole(message),
      text: normalizeLine(extractMessageText(message)),
    }))
    .filter((entry) => entry.text)
    .filter((entry) => entry.text !== currentQuery);

  const userMessage = candidates.find((entry) => entry.role === 'user')?.text;
  const assistantMessage = candidates.find((entry) => entry.role === 'assistant')?.text;

  if (userMessage && assistantMessage) {
    return `${userMessage} / ${assistantMessage}`.slice(0, 240);
  }
  if (userMessage) return userMessage.slice(0, 180);
  if (assistantMessage) return assistantMessage.slice(0, 180);
  return currentQuery.slice(0, 180);
}

export function buildConversationContextFromMessages(
  messages: unknown[],
  windowEnd: string,
  input: TimelineResolveInput,
  stickinessWindowMinutes: number,
  requestedRange: 'now' | 'past_point' | 'past_range',
): TimelineConversationContext {
  const lastTimestamp = [...messages]
    .reverse()
    .map((message) => extractTimestamp(message))
    .find(Boolean) || undefined;

  const minutesSinceLastTurn = lastTimestamp ? minutesBetween(windowEnd, lastTimestamp) : null;
  const isRecentlyActive = minutesSinceLastTurn !== null && minutesSinceLastTurn <= stickinessWindowMinutes;
  const activeTopicSummary = summarizeTopic(messages, input);

  return {
    is_recently_active: isRecentlyActive,
    minutes_since_last_turn: minutesSinceLastTurn,
    stickiness_window_minutes: stickinessWindowMinutes,
    active_topic_summary: activeTopicSummary,
    should_prefer_conversation_continuity_for_now: requestedRange === 'now' && isRecentlyActive,
    last_active_timestamp: lastTimestamp,
  };
}
