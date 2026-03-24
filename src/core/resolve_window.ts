import { parseTimestampParts } from '../lib/time-utils';

export type TimelineSemanticTarget = 'now' | 'past_point' | 'past_range';
export type TimelineCollectionScope = 'today_so_far' | 'point_day' | 'explicit_range';

export interface TimelineQueryPlan {
  schema_version: '1.0';
  target_time_range: TimelineSemanticTarget;
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

function makeNowWindow(nowIso: string, timezone: string, notes: string[]): ResolvedWindow {
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
    normalization_notes: notes,
  };
}

function makePointDayWindow(pointTime: string, timezone: string, notes: string[]): ResolvedWindow {
  const parts = parseRequiredTimestamp(pointTime, 'normalized_point');
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
  const startParts = parseRequiredTimestamp(start, 'normalized_start');
  parseRequiredTimestamp(end, 'normalized_end');
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
    normalization_notes: notes,
  };
}

export function resolveWindow(plan: TimelineQueryPlan, nowIso: string, timezone: string): ResolvedWindow {
  const notes = [plan.summary];

  if (plan.target_time_range === 'now') {
    return makeNowWindow(nowIso, timezone, notes);
  }

  if (plan.target_time_range === 'past_point') {
    if (!plan.normalized_point) {
      throw new Error('Timeline query plan missing normalized_point for past_point');
    }
    return makePointDayWindow(plan.normalized_point, timezone, notes);
  }

  if (!plan.normalized_start || !plan.normalized_end) {
    throw new Error('Timeline query plan missing normalized_start or normalized_end for past_range');
  }
  return makeExplicitRangeWindow(plan.normalized_start, plan.normalized_end, timezone, notes);
}
