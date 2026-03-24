import { TimelineResolveInput } from '../tools/timeline_resolve';
import { addHours, formatTimestamp, parseTimestampParts } from '../lib/time-utils';

export type TimelineSemanticTarget = 'now' | 'past_point' | 'past_range';
export type TimelineCollectionScope = 'today_so_far' | 'recent_3d' | 'explicit_range';

export interface ResolvedWindow {
  query_range: 'now' | 'recent_3d' | 'explicit';
  semantic_target: TimelineSemanticTarget;
  collection_scope: TimelineCollectionScope;
  start: string;
  end: string;
  calendar_date: string;
  timezone: string;
  normalization_notes: string[];
}

function makeTodaySoFar(
  nowIso: string,
  timezone: string,
  semanticTarget: 'now' | 'past_range',
  normalizationNotes: string[] = [],
): ResolvedWindow {
  const parts = parseTimestampParts(nowIso);
  if (!parts) throw new Error(`Invalid current time: ${nowIso}`);
  const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return {
    query_range: 'now',
    semantic_target: semanticTarget,
    collection_scope: 'today_so_far',
    start: `${date}T00:00:00${parts.offset ?? ''}`,
    end: nowIso,
    calendar_date: date,
    timezone,
    normalization_notes: normalizationNotes,
  };
}

function makeExplicitRangeWindow(
  start: string,
  end: string,
  timezone: string,
  semanticTarget: 'past_point' | 'past_range',
  normalizationNotes: string[] = [],
): ResolvedWindow {
  const parts = parseTimestampParts(start);
  if (!parts) throw new Error(`Invalid explicit start: ${start}`);
  return {
    query_range: 'explicit',
    semantic_target: semanticTarget,
    collection_scope: 'explicit_range',
    start,
    end,
    calendar_date: `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
    timezone,
    normalization_notes: normalizationNotes,
  };
}

function makeRecent3dWindow(nowIso: string, timezone: string, normalizationNotes: string[] = []): ResolvedWindow {
  const endParts = parseTimestampParts(nowIso);
  if (!endParts) throw new Error(`Invalid current time: ${nowIso}`);
  const startParts = addHours(endParts, -72);
  const date = `${endParts.year}-${String(endParts.month).padStart(2, '0')}-${String(endParts.day).padStart(2, '0')}`;
  return {
    query_range: 'recent_3d',
    semantic_target: 'past_range',
    collection_scope: 'recent_3d',
    start: formatTimestamp(startParts),
    end: nowIso,
    calendar_date: date,
    timezone,
    normalization_notes: normalizationNotes,
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

function looksLikeNowQuery(query: string): boolean {
  return /right now|现在|这会|此刻|此时/.test(query);
}

function looksLikeRecentRangeQuery(query: string): boolean {
  return /lately|recent|最近|这几天|近一段时间/.test(query);
}

function looksLikeTodayRangeQuery(query: string): boolean {
  return /today|今天/.test(query);
}

function looksLikePointQuery(query: string): boolean {
  return /\d{1,2}:\d{2}|\d{1,2}\s?(am|pm)\b|([上下午早晚凌晨中午傍晚]{0,2}\d{1,2}点半?)|([上下午早晚凌晨中午傍晚昨今]{0,3}[零一二两三四五六七八九十百]{1,3}点半?)|(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{1,2}(:\d{2})?)/i.test(query);
}

function extractAbsoluteDate(query: string): string | null {
  const match = query.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function deriveRelativeDayOffset(query: string): number | null {
  if (query.includes('前天')) return -2;
  if (query.includes('昨天') || query.includes('昨晚')) return -1;
  if (query.includes('今天') || query.includes('今晚') || query.includes('今早') || query.includes('今晚')) return 0;
  return null;
}

function offsetSuffixFromNow(nowIso: string): string {
  return parseTimestampParts(nowIso)?.offset ?? '';
}

function makeWholeDayWindow(date: string, timezone: string, nowIso: string, semanticTarget: 'past_point' | 'past_range', notes: string[]): ResolvedWindow {
  const offset = offsetSuffixFromNow(nowIso);
  return makeExplicitRangeWindow(
    `${date}T00:00:00${offset}`,
    `${date}T23:59:59${offset}`,
    timezone,
    semanticTarget,
    notes,
  );
}

function deriveRelativeDate(nowIso: string, dayOffset: number): string {
  const parts = parseTimestampParts(nowIso);
  if (!parts) throw new Error(`Invalid current time: ${nowIso}`);
  const shifted = addHours(parts, dayOffset * 24);
  return `${shifted.year}-${String(shifted.month).padStart(2, '0')}-${String(shifted.day).padStart(2, '0')}`;
}

export function resolveWindow(input: TimelineResolveInput, nowIso: string, timezone: string): ResolvedWindow {
  if (input.target_time_range === 'now') {
    return makeTodaySoFar(
      nowIso,
      timezone,
      input.reason === 'current_status' || input.reason === 'compaction_flush' || input.reason === 'snapshot' || input.reason === 'heartbeat'
        ? 'now'
        : 'past_range',
      ['公开查询类型为 now；候选事实收集范围使用 today_so_far。'],
    );
  }

  if (input.target_time_range === 'recent_3d') {
    return makeRecent3dWindow(nowIso, timezone, ['recent_3d 是对口语“最近”的内部特殊范围约定，本质属于 past_range。']);
  }

  if (input.target_time_range === 'explicit') {
    if (!input.start || !input.end) throw new Error('explicit range requires start and end');
    const start = parseWindowDate(input.start, 'start');
    const end = parseWindowDate(input.end, 'end');
    if (start.epoch > end.epoch) throw new Error('explicit range start must be earlier than or equal to end');
    return makeExplicitRangeWindow(
      input.start,
      input.end,
      timezone,
      start.epoch === end.epoch ? 'past_point' : 'past_range',
      ['explicit 查询已被归一化为可直接检索的时间点或时间范围。'],
    );
  }

  const query = (input.query || '').toLowerCase();
  if (looksLikeNowQuery(query)) {
    return makeTodaySoFar(nowIso, timezone, 'now', ['自然语言查询命中了 now 语义；候选事实收集范围使用 today_so_far。']);
  }
  if (looksLikeRecentRangeQuery(query)) {
    return makeRecent3dWindow(nowIso, timezone, ['自然语言中的“最近/这几天”被归一化为 recent_3d 内部范围约定。']);
  }
  if (looksLikeTodayRangeQuery(query) && !looksLikePointQuery(query)) {
    return makeTodaySoFar(nowIso, timezone, 'past_range', ['自然语言中的“今天”被归一化为从今日零点到现在的 past_range。']);
  }

  const absoluteDate = extractAbsoluteDate(query);
  if (absoluteDate) {
    return makeWholeDayWindow(
      absoluteDate,
      timezone,
      nowIso,
      looksLikePointQuery(query) ? 'past_point' : 'past_range',
      ['自然语言中包含显式日期；collector 读取该日期整天的候选事实，具体时间点语义交给 reasoner 判断。'],
    );
  }

  const relativeDayOffset = deriveRelativeDayOffset(query);
  if (relativeDayOffset !== null) {
    return makeWholeDayWindow(
      deriveRelativeDate(nowIso, relativeDayOffset),
      timezone,
      nowIso,
      looksLikePointQuery(query) ? 'past_point' : 'past_range',
      ['自然语言中的相对日期已归一化为对应日历日；是否命中具体时间点或范围由 reasoner 判断。'],
    );
  }

  if (looksLikePointQuery(query)) {
    return makeRecent3dWindow(nowIso, timezone, ['检测到时间点提示词，但未可靠解析出明确日期；collector 回收最近三天事实，具体点位归一化由 reasoner 完成。']);
  }

  return input.reason === 'current_status'
    ? makeTodaySoFar(nowIso, timezone, 'now', ['未显式命中其他时间语义；因 reason=current_status，默认按 now 处理。'])
    : makeRecent3dWindow(nowIso, timezone, ['未显式命中其他时间语义；默认按 past_range 的近时段上下文处理。']);
}
