import { TimelineResolveInput } from '../tools/timeline_resolve';
import { addHours, formatTimestamp, parseTimestampParts } from '../lib/time-utils';

export type TimelineSemanticTarget = 'now' | 'today_summary' | 'recent_recall' | 'explicit_past';
export type TimelineCollectionScope = 'today_so_far' | 'recent_3d' | 'explicit_range';

export interface ResolvedWindow {
  legacy_preset: 'now_today' | 'recent_3d' | 'explicit';
  semantic_target: TimelineSemanticTarget;
  collection_scope: TimelineCollectionScope;
  start: string;
  end: string;
  calendar_date: string;
  timezone: string;
}

function makeTodaySoFar(
  nowIso: string,
  timezone: string,
  semanticTarget: 'now' | 'today_summary',
): ResolvedWindow {
  const parts = parseTimestampParts(nowIso);
  if (!parts) throw new Error(`Invalid current time: ${nowIso}`);
  const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return {
    legacy_preset: 'now_today',
    semantic_target: semanticTarget,
    collection_scope: 'today_so_far',
    start: `${date}T00:00:00${parts.offset ?? ''}`,
    end: nowIso,
    calendar_date: date,
    timezone,
  };
}

function parseWindowDate(iso: string, label: 'start' | 'end'): { date: string; epoch: number } {
  const parts = parseTimestampParts(iso);
  if (!parts) throw new Error(`Invalid explicit ${label}: ${iso}`);
  const epoch = new Date(iso).getTime();
  if (Number.isNaN(epoch)) throw new Error(`Invalid explicit ${label}: ${iso}`);
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    epoch,
  };
}

export function resolveWindow(input: TimelineResolveInput, nowIso: string, timezone: string): ResolvedWindow {
  if (input.target_time_range === 'now_today') {
    return makeTodaySoFar(
      nowIso,
      timezone,
      input.reason === 'current_status' || input.reason === 'compaction_flush' || input.reason === 'snapshot' || input.reason === 'heartbeat'
        ? 'now'
        : 'today_summary',
    );
  }

  if (input.target_time_range === 'recent_3d') {
    const endParts = parseTimestampParts(nowIso);
    if (!endParts) throw new Error(`Invalid current time: ${nowIso}`);
    const startParts = addHours(endParts, -72);
    const date = `${endParts.year}-${String(endParts.month).padStart(2, '0')}-${String(endParts.day).padStart(2, '0')}`;
    return {
      legacy_preset: 'recent_3d',
      semantic_target: 'recent_recall',
      collection_scope: 'recent_3d',
      start: formatTimestamp(startParts),
      end: nowIso,
      calendar_date: date,
      timezone,
    };
  }

  if (input.target_time_range === 'explicit') {
    if (!input.start || !input.end) throw new Error('explicit range requires start and end');
    const start = parseWindowDate(input.start, 'start');
    const end = parseWindowDate(input.end, 'end');
    if (start.epoch > end.epoch) throw new Error('explicit range start must be earlier than or equal to end');
    return {
      legacy_preset: 'explicit',
      semantic_target: 'explicit_past',
      collection_scope: 'explicit_range',
      start: input.start,
      end: input.end,
      calendar_date: start.date,
      timezone,
    };
  }

  const query = (input.query || '').toLowerCase();
  if (query.includes('right now') || query.includes('现在') || query.includes('这会') || query.includes('此刻')) {
    return makeTodaySoFar(nowIso, timezone, 'now');
  }
  if (query.includes('lately') || query.includes('最近')) {
    return resolveWindow({ ...input, target_time_range: 'recent_3d' }, nowIso, timezone);
  }
  if (query.includes('today') || query.includes('今天')) {
    return makeTodaySoFar(nowIso, timezone, 'today_summary');
  }

  return makeTodaySoFar(nowIso, timezone, input.reason === 'current_status' ? 'now' : 'today_summary');
}
