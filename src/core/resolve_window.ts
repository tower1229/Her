import { TimelineResolveInput } from '../tools/timeline_resolve';
import { addHours, formatTimestamp, parseTimestampParts } from '../lib/time-utils';

export interface ResolvedWindow {
  preset: 'now_today' | 'recent_3d' | 'explicit';
  start: string;
  end: string;
  calendar_date: string;
  timezone: string;
}

function makeNowToday(nowIso: string, timezone: string): ResolvedWindow {
  const parts = parseTimestampParts(nowIso);
  if (!parts) throw new Error(`Invalid current time: ${nowIso}`);
  const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return {
    preset: 'now_today',
    start: `${date}T00:00:00${parts.offset ?? ''}`,
    end: nowIso,
    calendar_date: date,
    timezone,
  };
}

export function resolveWindow(input: TimelineResolveInput, nowIso: string, timezone: string): ResolvedWindow {
  if (input.target_time_range === 'now_today') {
    return makeNowToday(nowIso, timezone);
  }

  if (input.target_time_range === 'recent_3d') {
    const endParts = parseTimestampParts(nowIso);
    if (!endParts) throw new Error(`Invalid current time: ${nowIso}`);
    const startParts = addHours(endParts, -72);
    const date = `${endParts.year}-${String(endParts.month).padStart(2, '0')}-${String(endParts.day).padStart(2, '0')}`;
    return {
      preset: 'recent_3d',
      start: formatTimestamp(startParts),
      end: nowIso,
      calendar_date: date,
      timezone,
    };
  }

  if (input.target_time_range === 'explicit') {
    if (!input.start || !input.end) throw new Error('explicit range requires start and end');
    const parts = parseTimestampParts(input.start);
    if (!parts) throw new Error(`Invalid explicit start: ${input.start}`);
    return {
      preset: 'explicit',
      start: input.start,
      end: input.end,
      calendar_date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
      timezone,
    };
  }

  const query = (input.query || '').toLowerCase();
  if (query.includes('right now') || query.includes('现在') || query.includes('这会')) {
    return makeNowToday(nowIso, timezone);
  }
  if (query.includes('lately') || query.includes('最近')) {
    return resolveWindow({ ...input, target_time_range: 'recent_3d' }, nowIso, timezone);
  }

  return makeNowToday(nowIso, timezone);
}
