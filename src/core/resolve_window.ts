import { TimelineResolveInput } from '../tools/timeline_resolve';
import { formatTimestamp, parseTimestampParts } from '../lib/time-utils';

export type TimelineSemanticTarget = 'now' | 'past_point' | 'past_range';
export type TimelineCollectionScope = 'today_so_far' | 'point_day' | 'explicit_range';

export interface TimelineQueryPlan {
  schema_version: '1.0';
  target_time_range: 'past_point' | 'past_range';
  normalized_point?: string;
  normalized_start?: string;
  normalized_end?: string;
  summary: string;
}

export interface ResolvedWindow {
  query_range: TimelineSemanticTarget;
  semantic_target: TimelineSemanticTarget;
  collection_scope: TimelineCollectionScope;
  start: string;
  end: string;
  calendar_date: string;
  timezone: string;
  normalization_notes: string[];
}

function parseRequiredTimestamp(value: string, label: string) {
  const parts = parseTimestampParts(value);
  if (!parts) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parts;
}

function formatCalendarDate(parts: ReturnType<typeof parseRequiredTimestamp>): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function makeNowWindow(nowIso: string, timezone: string): ResolvedWindow {
  const parts = parseRequiredTimestamp(nowIso, 'current time');
  const date = formatCalendarDate(parts);
  return {
    query_range: 'now',
    semantic_target: 'now',
    collection_scope: 'today_so_far',
    start: `${date}T00:00:00${parts.offset ?? ''}`,
    end: nowIso,
    calendar_date: date,
    timezone,
    normalization_notes: ['公开查询类型为 now；collector 读取 today_so_far 作为当前状态的候选事实范围。'],
  };
}

function makePointDayWindow(pointTime: string, timezone: string, notes: string[]): ResolvedWindow {
  const parts = parseRequiredTimestamp(pointTime, 'point_time');
  const date = formatCalendarDate(parts);
  return {
    query_range: 'past_point',
    semantic_target: 'past_point',
    collection_scope: 'point_day',
    start: `${date}T00:00:00${parts.offset ?? ''}`,
    end: `${date}T23:59:59${parts.offset ?? ''}`,
    calendar_date: date,
    timezone,
    normalization_notes: notes,
  };
}

function makeExplicitRangeWindow(start: string, end: string, timezone: string, notes: string[]): ResolvedWindow {
  const startParts = parseRequiredTimestamp(start, 'start');
  const endParts = parseRequiredTimestamp(end, 'end');
  const startEpoch = new Date(start).getTime();
  const endEpoch = new Date(end).getTime();
  if (Number.isNaN(startEpoch) || Number.isNaN(endEpoch) || startEpoch > endEpoch) {
    throw new Error(`Invalid explicit range: ${start} -> ${end}`);
  }
  return {
    query_range: 'past_range',
    semantic_target: 'past_range',
    collection_scope: 'explicit_range',
    start,
    end,
    calendar_date: formatCalendarDate(startParts),
    timezone,
    normalization_notes: notes.length ? notes : [
      `时间范围已归一化为 ${formatTimestamp(startParts)} 到 ${formatTimestamp(endParts)}。`,
    ],
  };
}

function resolvePointTime(input: TimelineResolveInput, plan?: TimelineQueryPlan): { pointTime: string; notes: string[] } {
  if (input.point_time) {
    return {
      pointTime: input.point_time,
      notes: ['上游已提供结构化 point_time；runtime 不再自行解析自然语言时间。'],
    };
  }
  if (plan?.normalized_point) {
    return {
      pointTime: plan.normalized_point,
      notes: [plan.summary],
    };
  }
  throw new Error('past_point requires point_time or a query plan with normalized_point');
}

function resolveRange(input: TimelineResolveInput, plan?: TimelineQueryPlan): { start: string; end: string; notes: string[] } {
  if (input.start && input.end) {
    return {
      start: input.start,
      end: input.end,
      notes: ['上游已提供结构化 start/end；runtime 不再自行解析自然语言时间。'],
    };
  }
  if (plan?.normalized_start && plan?.normalized_end) {
    return {
      start: plan.normalized_start,
      end: plan.normalized_end,
      notes: [plan.summary],
    };
  }
  throw new Error('past_range requires start/end or a query plan with normalized_start and normalized_end');
}

export function resolveWindow(
  input: TimelineResolveInput,
  nowIso: string,
  timezone: string,
  queryPlan?: TimelineQueryPlan,
): ResolvedWindow {
  if (input.target_time_range === 'now') {
    return makeNowWindow(nowIso, timezone);
  }

  if (input.target_time_range === 'past_point') {
    const { pointTime, notes } = resolvePointTime(input, queryPlan);
    return makePointDayWindow(pointTime, timezone, notes);
  }

  const { start, end, notes } = resolveRange(input, queryPlan);
  return makeExplicitRangeWindow(start, end, timezone, notes);
}
