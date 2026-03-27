import { getHoliday } from '../lib/holidays';
import { inferCountryFromOffset, inferHemisphere } from '../lib/country';
import { formatDate, parseTimestampParts, TimestampParts, dayOfWeek } from '../lib/time-utils';
import { ActivityMode } from '../lib/timeline_semantics';
import { ResolvedWindow } from './resolve_window';
import { TimelineGeneratedDraft } from './timeline_reasoner_contract';

export type WorldTimeBand =
  | 'late_night'
  | 'early_morning'
  | 'morning_work'
  | 'midday'
  | 'afternoon'
  | 'dinner_window'
  | 'evening'
  | 'late_evening';

export type WorldRhythmMode =
  | 'sleep'
  | 'wake_up'
  | 'breakfast'
  | 'lunch'
  | 'dinner'
  | 'work_or_study'
  | 'commute'
  | 'exercise'
  | 'social'
  | 'leisure'
  | 'rest'
  | 'domestic'
  | 'errands'
  | 'nightlife';

export interface WorldRhythmSlot {
  timestamp_hint: string;
  calendar_date: string;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  weekday: boolean;
  holiday_key: string | null;
  day_kind: 'workday' | 'weekend' | 'holiday';
  time_band: WorldTimeBand;
  encouraged_modes: WorldRhythmMode[];
  discouraged_modes: WorldRhythmMode[];
  notes: string[];
}

export interface TimelineWorldContext {
  target: WorldRhythmSlot | null;
  range_calendar: WorldRhythmSlot[];
}

export interface WorldRhythmValidationResult {
  ok: boolean;
  matched_modes: WorldRhythmMode[];
  issues: string[];
}

function inferTimeBand(hour: number): WorldTimeBand {
  if (hour <= 4) return 'late_night';
  if (hour <= 8) return 'early_morning';
  if (hour <= 11) return 'morning_work';
  if (hour <= 13) return 'midday';
  if (hour <= 16) return 'afternoon';
  if (hour <= 19) return 'dinner_window';
  if (hour <= 22) return 'evening';
  return 'late_evening';
}

function inferSeason(month: number, hemisphere: 'northern' | 'southern'): 'spring' | 'summer' | 'autumn' | 'winter' {
  const northern: 'spring' | 'summer' | 'autumn' | 'winter' = month === 12 || month <= 2
    ? 'winter'
    : month <= 5
      ? 'spring'
      : month <= 8
        ? 'summer'
        : 'autumn';
  if (hemisphere === 'southern') {
    const flip: Record<typeof northern, typeof northern> = {
      winter: 'summer',
      summer: 'winter',
      spring: 'autumn',
      autumn: 'spring',
    };
    return flip[northern];
  }
  return northern;
}

function buildSeasonNotes(season: 'spring' | 'summer' | 'autumn' | 'winter'): string[] {
  switch (season) {
    case 'spring':
      return [
        'Season context: spring. Layered but lighter outfits are usually more plausible than heavy winter clothing.',
      ];
    case 'summer':
      return [
        'Season context: summer. Breathable, lighter clothing is usually more plausible than thick layered outfits.',
      ];
    case 'autumn':
      return [
        'Season context: autumn. Light outer layers and moderate warmth are usually plausible.',
      ];
    case 'winter':
      return [
        'Season context: winter. Warmer layers and cold-weather clothing are usually more plausible than summerwear.',
      ];
    default:
      return [];
  }
}

function describeBand(timeBand: WorldTimeBand, weekday: boolean, holidayKey: string | null): {
  encouraged_modes: WorldRhythmMode[];
  discouraged_modes: WorldRhythmMode[];
  notes: string[];
} {
  const notes: string[] = [];
  const encouraged = new Set<WorldRhythmMode>();
  const discouraged = new Set<WorldRhythmMode>();

  const addEncouraged = (...modes: WorldRhythmMode[]) => modes.forEach((mode) => encouraged.add(mode));
  const addDiscouraged = (...modes: WorldRhythmMode[]) => modes.forEach((mode) => discouraged.add(mode));

  switch (timeBand) {
    case 'late_night':
      addEncouraged('sleep', 'rest', 'leisure');
      addDiscouraged('breakfast', 'lunch', 'dinner', 'errands', 'work_or_study');
      notes.push('Deep-night slots usually favor sleep, winding down, or very quiet activities.');
      break;
    case 'early_morning':
      addEncouraged('wake_up', 'breakfast', 'commute', 'exercise', 'domestic');
      addDiscouraged('nightlife');
      notes.push('Early morning usually fits waking up, breakfast, commuting, or light exercise.');
      break;
    case 'morning_work':
      addEncouraged('work_or_study', 'commute', 'errands');
      addDiscouraged('sleep', 'nightlife');
      notes.push('Late morning often fits work, study, focused errands, or commuting.');
      break;
    case 'midday':
      addEncouraged('lunch', 'work_or_study', 'social', 'errands');
      addDiscouraged('sleep', 'nightlife');
      notes.push('Midday usually fits lunch, a work break, errands, or a short social moment.');
      break;
    case 'afternoon':
      addEncouraged('work_or_study', 'errands', 'exercise', 'domestic');
      addDiscouraged('sleep');
      notes.push('Afternoon often fits work, study, chores, errands, or exercise.');
      break;
    case 'dinner_window':
      addEncouraged('dinner', 'social', 'exercise', 'domestic', 'commute');
      addDiscouraged('sleep');
      notes.push('Early evening usually fits dinner, going out, exercise, or returning home.');
      break;
    case 'evening':
      addEncouraged('social', 'leisure', 'domestic', 'rest');
      addDiscouraged('breakfast');
      notes.push('Evening often fits leisure, social time, domestic tasks, or gentle decompression.');
      break;
    case 'late_evening':
      addEncouraged('rest', 'sleep', 'leisure');
      addDiscouraged('breakfast', 'errands');
      notes.push('Late evening usually fits winding down, resting, or going to sleep.');
      break;
  }

  if (holidayKey) {
    addEncouraged('social', 'leisure', 'domestic');
    notes.push(`Public holiday context: ${holidayKey}. Social, family, celebration, travel, or relaxed home activities are more plausible.`);
  } else if (!weekday) {
    addEncouraged('social', 'leisure', 'domestic', 'exercise');
    notes.push('Weekend context: leisure, outings, exercise, social time, or slower domestic routines are especially plausible.');
  } else if (timeBand === 'morning_work' || timeBand === 'afternoon') {
    addEncouraged('work_or_study');
    notes.push('Workday daylight context: work, study, or purposeful errands are especially plausible.');
  }

  return {
    encouraged_modes: [...encouraged],
    discouraged_modes: [...discouraged],
    notes,
  };
}

function classifyDateKind(parts: TimestampParts): { weekday: boolean; holiday_key: string | null; day_kind: 'workday' | 'weekend' | 'holiday' } {
  const calendarDate = formatDate(parts);
  const holidayKey = getHoliday(calendarDate, inferCountryFromOffset(parts.offset));
  const weekday = ![0, 6].includes(dayOfWeek(parts));
  return {
    weekday,
    holiday_key: holidayKey,
    day_kind: holidayKey ? 'holiday' : weekday ? 'workday' : 'weekend',
  };
}

export function buildWorldRhythmSlot(timestamp: string): WorldRhythmSlot | null {
  const parts = parseTimestampParts(timestamp);
  if (!parts) return null;
  const calendarDate = formatDate(parts);
  const hemisphere = inferHemisphere(parts.offset);
  const season = inferSeason(parts.month, hemisphere);
  const dateKind = classifyDateKind(parts);
  const timeBand = inferTimeBand(parts.hour);
  const bandDescription = describeBand(timeBand, dateKind.weekday, dateKind.holiday_key);
  const seasonNotes = buildSeasonNotes(season);

  return {
    timestamp_hint: timestamp,
    calendar_date: calendarDate,
    season,
    weekday: dateKind.weekday,
    holiday_key: dateKind.holiday_key,
    day_kind: dateKind.day_kind,
    time_band: timeBand,
    encouraged_modes: bandDescription.encouraged_modes,
    discouraged_modes: bandDescription.discouraged_modes,
    notes: [...bandDescription.notes, ...seasonNotes],
  };
}

function makeDateTimestamp(date: string, offset: string | undefined): string {
  return `${date}T12:00:00${offset || ''}`;
}

export function buildTimelineWorldContext(window: ResolvedWindow): TimelineWorldContext {
  const startParts = parseTimestampParts(window.start);
  const offset = startParts?.offset;
  return {
    target: window.target_timestamp_hint ? buildWorldRhythmSlot(window.target_timestamp_hint) : null,
    range_calendar: window.calendar_dates.map((date) => buildWorldRhythmSlot(makeDateTimestamp(date, offset))).filter(Boolean) as WorldRhythmSlot[],
  };
}

function matched(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

export function classifyWorldRhythmModes(input: { action?: string; location?: string; internalMonologue?: string }): WorldRhythmMode[] {
  const text = [input.action || '', input.location || '', input.internalMonologue || ''].join(' ').toLowerCase();
  const modes = new Set<WorldRhythmMode>();

  if (matched(text, [/\b(sleep|sleeping|asleep|bed|nap|napping|woke|wake up)\b/, /睡|睡觉|午睡|醒来|起床|床上/])) {
    if (matched(text, [/\b(wake|woke|wake up)\b/, /醒来|起床/])) {
      modes.add('wake_up');
    } else {
      modes.add('sleep');
    }
  }
  if (matched(text, [/\b(breakfast|coffee|morning meal)\b/, /早餐|早饭|咖啡/])) modes.add('breakfast');
  if (matched(text, [/\b(lunch|midday meal)\b/, /午饭|午餐/])) modes.add('lunch');
  if (matched(text, [/\b(dinner|bbq|supper)\b/, /晚饭|晚餐|烧烤/])) modes.add('dinner');
  if (matched(text, [/\b(work|working|study|studying|notes|desk|meeting|organizing)\b/, /工作|学习|整理|书房|会议|记录|待办/])) modes.add('work_or_study');
  if (matched(text, [/\b(commute|subway|bus|train|drive)\b/, /通勤|地铁|公交|开车|路上/])) modes.add('commute');
  if (matched(text, [/\b(exercise|gym|run|running|basketball|walk)\b/, /运动|健身|跑步|打球|散步/])) modes.add('exercise');
  if (matched(text, [/\b(friend|friends|party|date|chatting|hang out)\b/, /朋友|聚会|约会|聊天|一起/])) modes.add('social');
  if (matched(text, [/\b(movie|show|watching|reading|book|game|cafe)\b/, /看剧|电影|看书|书店|咖啡馆|发呆|放松/])) modes.add('leisure');
  if (matched(text, [/\b(rest|resting|relax|relaxing|quiet|settle)\b/, /休息|放松|安静|缓下来|歇一会/])) modes.add('rest');
  if (matched(text, [/\b(cooking|laundry|cleaning|home)\b/, /做饭|收拾|家务|在家/])) modes.add('domestic');
  if (matched(text, [/\b(errand|shopping|bank|grocery)\b/, /买东西|采购|办事|超市/])) modes.add('errands');
  if (matched(text, [/\b(bar|club|drinks|late-night)\b/, /酒吧|夜店|喝酒|夜生活/])) modes.add('nightlife');

  return [...modes];
}

function hourFromTimestamp(timestamp: string): number | null {
  const parts = parseTimestampParts(timestamp);
  return parts ? parts.hour : null;
}

function worldModesFromActivityMode(activityMode: ActivityMode): WorldRhythmMode[] {
  switch (activityMode) {
    case 'sleep':
      return ['sleep'];
    case 'bath':
      return ['rest', 'domestic'];
    case 'meal':
      return [];
    case 'work_or_study':
      return ['work_or_study'];
    case 'commute':
      return ['commute'];
    case 'exercise':
      return ['exercise'];
    case 'social':
      return ['social'];
    case 'shopping':
      return ['errands', 'social'];
    case 'leisure':
      return ['leisure'];
    case 'domestic':
      return ['domestic'];
    case 'errands':
      return ['errands'];
    case 'transition':
      return ['commute'];
    case 'rest':
      return ['rest'];
    default:
      return [];
  }
}

export function validateGeneratedWorldRhythm(draft: TimelineGeneratedDraft): WorldRhythmValidationResult {
  if (!draft.timestamp) {
    return { ok: true, matched_modes: [], issues: [] };
  }

  const slot = buildWorldRhythmSlot(draft.timestamp);
  if (!slot) {
    return { ok: true, matched_modes: [], issues: [] };
  }

  const semanticModes = draft.sceneSemantics
    ? worldModesFromActivityMode(draft.sceneSemantics.activityMode)
    : [];
  const matchedModes = semanticModes.length > 0
    ? semanticModes
    : classifyWorldRhythmModes({
        action: draft.action,
        location: draft.location,
        internalMonologue: draft.internalMonologue,
      });
  if (matchedModes.length === 0) {
    return { ok: true, matched_modes: [], issues: [] };
  }

  const hour = hourFromTimestamp(draft.timestamp);
  const issues: string[] = [];

  if (matchedModes.includes('breakfast') && (hour === null || hour < 5 || hour > 10)) {
    issues.push('Breakfast-like activity falls outside a plausible breakfast window.');
  }
  if (matchedModes.includes('lunch') && (hour === null || hour < 10 || hour > 15)) {
    issues.push('Lunch-like activity falls outside a plausible lunch window.');
  }
  if (matchedModes.includes('dinner') && (hour === null || hour < 16 || hour > 22)) {
    issues.push('Dinner-like activity falls outside a plausible dinner window.');
  }
  if (matchedModes.includes('sleep') && (hour === null || (hour >= 8 && hour < 21))) {
    issues.push('Sleeping activity falls outside a plausible main sleep window.');
  }
  if (matchedModes.includes('work_or_study') && hour !== null && hour <= 4) {
    issues.push('Work or study activity is implausibly late for a normal real-world routine.');
  }
  if (matchedModes.includes('nightlife') && hour !== null && hour < 18) {
    issues.push('Nightlife activity falls outside a plausible nightlife window.');
  }

  return {
    ok: issues.length === 0,
    matched_modes: matchedModes,
    issues,
  };
}
