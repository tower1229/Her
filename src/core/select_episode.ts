import { ParsedEpisode } from '../lib/types';
import { parseTimestampParts } from '../lib/time-utils';
import { TimelineResolveInput } from '../tools/timeline_resolve';
import { ResolvedWindow } from './resolve_window';

interface SelectedEpisodeResult {
  episode: ParsedEpisode | null;
  reason: string;
}

function getWindowOffset(window: ResolvedWindow): string {
  const match = window.end.match(/(Z|[+-]\d{2}:\d{2})$/);
  return match ? match[1] : '+00:00';
}

function toEpoch(timestamp: string, fallbackOffset: string): number | null {
  const parts = parseTimestampParts(timestamp);
  if (parts) {
    const iso = parts.offset
      ? `${timestamp.replace(' ', 'T')}`
      : `${timestamp.replace(' ', 'T')}${fallbackOffset}`;
    const epoch = new Date(iso).getTime();
    return Number.isNaN(epoch) ? null : epoch;
  }

  const epoch = new Date(timestamp).getTime();
  return Number.isNaN(epoch) ? null : epoch;
}

function inferContinuationMinutes(action: string, naturalText?: string): number {
  const text = `${action} ${naturalText || ''}`.toLowerCase();

  if (/sleep|睡|休息|躺|午睡/.test(text)) return 8 * 60;
  if (/basketball|football|badminton|tennis|swim|hike|run|gym|workout|打球|跑步|健身|运动|游泳|散步/.test(text)) return 2 * 60;
  if (/write|writing|study|reading|coding|work|organizing|整理|写|学习|读书|工作|编码|创作/.test(text)) return 3 * 60;
  if (/cafe|coffee|meal|lunch|dinner|早餐|午饭|晚饭|咖啡/.test(text)) return 90;
  if (/commute|transit|subway|bus|car|通勤|地铁|开车|公交/.test(text)) return 60;
  return 60;
}

function extractQueryTokens(query?: string): string[] {
  if (!query) return [];
  const matches = query.toLowerCase().match(/[\p{Script=Han}]{1,}|[a-z0-9]{2,}/gu) || [];
  const stopwords = new Set([
    'what', 'where', 'when', 'were', 'have', 'been', 'doing', 'right', 'now', 'lately',
    '最近', '现在', '什么', '不是', '还在', '刚才', '今天', '你', '吗', '呢',
  ]);
  const tokens = new Set<string>();

  for (const token of matches) {
    if (/[a-z0-9]/.test(token)) {
      if (!stopwords.has(token)) tokens.add(token);
      continue;
    }

    const normalized = token.trim();
    if (!normalized) continue;

    for (let size = 2; size <= Math.min(4, normalized.length); size += 1) {
      for (let start = 0; start <= normalized.length - size; start += 1) {
        const slice = normalized.slice(start, start + size);
        if (!stopwords.has(slice)) {
          tokens.add(slice);
        }
      }
    }
  }

  return Array.from(tokens);
}

function detectPreferredTimeBands(query?: string): Set<string> {
  const q = (query || '').toLowerCase();
  const bands = new Set<string>();
  if (/morning|上午|早上|清晨/.test(q)) bands.add('morning');
  if (/afternoon|下午/.test(q)) bands.add('afternoon');
  if (/evening|晚上|傍晚|今晚/.test(q)) bands.add('evening');
  if (/night|凌晨|半夜|深夜/.test(q)) bands.add('night');
  return bands;
}

function mapHourToBand(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour <= 5) return 'night';
  if (hour <= 11) return 'morning';
  if (hour <= 17) return 'afternoon';
  return 'evening';
}

function computeQueryScore(episode: ParsedEpisode, queryTokens: string[], preferredBands: Set<string>): number {
  const haystack = `${episode.location} ${episode.action} ${episode.naturalText || ''} ${episode.internalMonologue || ''}`.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += token.length >= 2 ? 25 : 10;
    }
  }

  const parts = parseTimestampParts(episode.timestamp);
  if (parts && preferredBands.size > 0 && preferredBands.has(mapHourToBand(parts.hour))) {
    score += 30;
  }

  return score;
}

export function selectEpisodeForWindow(
  episodes: ParsedEpisode[],
  window: ResolvedWindow,
  input: TimelineResolveInput,
): SelectedEpisodeResult {
  if (episodes.length === 0) {
    return { episode: null, reason: 'no parsed episodes found for the requested window' };
  }

  const fallbackOffset = getWindowOffset(window);
  const windowStart = toEpoch(window.start, fallbackOffset);
  const windowEnd = toEpoch(window.end, fallbackOffset);
  if (windowStart === null || windowEnd === null) {
    return { episode: episodes[episodes.length - 1], reason: 'window timestamps were not parseable; reused latest parsed episode' };
  }

  const queryTokens = extractQueryTokens(input.query);
  const preferredBands = detectPreferredTimeBands(input.query);

  const scored = episodes
    .map((episode) => {
      const startEpoch = toEpoch(episode.timestamp, fallbackOffset);
      if (startEpoch === null) return null;

      const durationMinutes = inferContinuationMinutes(episode.action, episode.naturalText);
      const endEpoch = startEpoch + durationMinutes * 60 * 1000;
      const overlapsWindow = startEpoch <= windowEnd && endEpoch >= windowStart;
      const containsWindowEnd = startEpoch <= windowEnd && endEpoch >= windowEnd;
      const queryScore = computeQueryScore(episode, queryTokens, preferredBands);
      return {
        episode,
        startEpoch,
        endEpoch,
        overlapsWindow,
        containsWindowEnd,
        queryScore,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const currentStatusLike = window.semantic_target === 'now';

  if (currentStatusLike) {
    const ongoing = scored
      .filter((entry) => entry.containsWindowEnd)
      .sort((a, b) => (b.startEpoch + b.queryScore) - (a.startEpoch + a.queryScore));

    if (ongoing.length > 0) {
      return {
        episode: ongoing[0].episode,
        reason: 'selected an ongoing episode whose inferred duration still covers the requested current moment',
      };
    }

    return {
      episode: null,
      reason: 'no parsed episode still covered the requested current moment',
    };
  }

  const overlapping = scored
    .filter((entry) => entry.overlapsWindow)
    .sort((a, b) => {
      if (b.queryScore !== a.queryScore) return b.queryScore - a.queryScore;
      return b.startEpoch - a.startEpoch;
    });

  if (overlapping.length > 0) {
    return {
      episode: overlapping[0].episode,
      reason: overlapping[0].queryScore > 0
        ? 'selected the overlapping episode that best matched the query semantics'
        : 'selected the most relevant parsed episode inside the requested window',
    };
  }

  const queryMatched = scored
    .filter((entry) => entry.queryScore > 0)
    .sort((a, b) => {
      if (b.queryScore !== a.queryScore) return b.queryScore - a.queryScore;
      return b.startEpoch - a.startEpoch;
    });

  if (queryMatched.length > 0) {
    return {
      episode: queryMatched[0].episode,
      reason: 'selected the parsed episode that best matched the temporal query semantics',
    };
  }

  return {
    episode: null,
    reason: 'no parsed episode matched the requested window or query semantics',
  };
}
