import { computeFingerprint } from '../lib/fingerprint';
import { resolveAppearance } from '../lib/inherit-appearance';
import { mapToEpisode, parseMemoryFile } from '../lib/parse-memory';
import { ParsedEpisode } from '../lib/types';
import { dayOfWeek, formatDate, parseTimestampParts } from '../lib/time-utils';
import { getHoliday } from '../lib/holidays';
import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';

export interface GeneratedCandidateResult {
  parsed: ParsedEpisode;
  episode: ReturnType<typeof mapToEpisode>;
  idempotencyKey: string;
  notes: string[];
  confidenceReason: string;
  appearance: {
    inherited: boolean;
    reason: string;
    source_episode_timestamp?: string;
  };
}

interface PersonaProfile {
  summaryText: string;
  style: 'feminine' | 'masculine' | 'neutral';
  age?: number;
  role?: string;
  homeLabel: string;
  traits: {
    creative: boolean;
    introspective: boolean;
    social: boolean;
    sporty: boolean;
    fashionAware: boolean;
    foodie: boolean;
    photography: boolean;
    homebody: boolean;
  };
}

interface CandidateChoice {
  location: string;
  action: string;
  emotionTags: string[];
  internalMonologue: string;
  naturalText: string;
  appearanceDefault: string;
  confidence: number;
  reason: string;
}

function extractAge(text: string): number | undefined {
  const match = text.match(/\b(1[89]|[2-5]\d)\s*(岁|years? old)\b/i);
  return match ? Number(match[1]) : undefined;
}

function detectStyle(text: string): PersonaProfile['style'] {
  const lower = text.toLowerCase();
  if (/\b(she|her|woman|female|girl)\b/.test(lower) || /女生|女性|她\b/.test(text)) return 'feminine';
  if (/\b(he|him|man|male|boy)\b/.test(lower) || /男生|男性|他\b/.test(text)) return 'masculine';
  return 'neutral';
}

function detectRole(text: string): string | undefined {
  const patterns = [
    /\b(writer|designer|developer|engineer|student|photographer|artist|researcher|teacher)\b/i,
    /(作家|设计师|开发者|工程师|学生|摄影师|艺术家|研究员|老师)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}

function detectHomeLabel(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('shanghai') || text.includes('上海')) return 'home apartment in Shanghai';
  if (lower.includes('new york') || text.includes('纽约')) return 'apartment in New York';
  if (lower.includes('tokyo') || text.includes('东京')) return 'quiet apartment in Tokyo';
  if (lower.includes('beijing') || text.includes('北京')) return 'apartment in Beijing';
  if (lower.includes('study') || text.includes('书房')) return 'home study desk near the window';
  return 'home study desk near the window';
}

function hasAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()) || text.includes(keyword));
}

function buildProfile(sources: CollectedSources): PersonaProfile {
  const summaryText = [sources.coreContext.soul, sources.coreContext.memory, sources.coreContext.identity]
    .filter(Boolean)
    .join('\n');

  return {
    summaryText,
    style: detectStyle(summaryText),
    age: extractAge(summaryText),
    role: detectRole(summaryText),
    homeLabel: detectHomeLabel(summaryText),
    traits: {
      creative: hasAny(summaryText, ['creative', 'writer', 'designer', 'artist', 'obsidian', '写作', '设计', '灵感', '创作', '知识库']),
      introspective: hasAny(summaryText, ['introvert', 'quiet', 'reflective', 'calm', '内向', '安静', '独处', '沉静']),
      social: hasAny(summaryText, ['social', 'outgoing', 'friends', 'party', '外向', '社交', '朋友', '聚会']),
      sporty: hasAny(summaryText, ['gym', 'fitness', 'run', 'workout', 'yoga', '健身', '跑步', '运动', '瑜伽']),
      fashionAware: hasAny(summaryText, ['fashion', 'outfit', 'makeup', '穿搭', '时尚', '妆容']),
      foodie: hasAny(summaryText, ['coffee', 'cafe', 'dessert', 'food', '咖啡', '甜点', '美食']),
      photography: hasAny(summaryText, ['camera', 'photography', 'photo', '相机', '摄影', '自拍']),
      homebody: hasAny(summaryText, ['homebody', 'stay home', '宅', '居家', '家里']) || !hasAny(summaryText, ['travel', 'trip', '旅行', '到处跑']),
    },
  };
}

function inferCountryFromOffset(offset?: string): 'CN' | 'US' {
  return offset === '+08:00' ? 'CN' : 'US';
}

function usableAnchor(sources: CollectedSources): string | null {
  const candidate = [...sources.sessionsHistory, ...sources.memorySearch].find((entry) => entry && entry.trim());
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (/what are you doing|你在干嘛|你现在在做什么/i.test(trimmed)) return null;
  return trimmed;
}

function inferTimeBand(parts: ReturnType<typeof parseTimestampParts>): 'late_night' | 'morning' | 'afternoon' | 'evening' {
  if (!parts) return 'afternoon';
  if (parts.hour <= 5) return 'late_night';
  if (parts.hour <= 11) return 'morning';
  if (parts.hour <= 17) return 'afternoon';
  return 'evening';
}

function styleAppearance(style: PersonaProfile['style'], base: 'home' | 'outdoor' | 'sport' | 'sleep' | 'cafe'): string {
  const map = {
    feminine: {
      home: 'soft knit homewear with loosely tied hair',
      outdoor: 'a neat casual outfit with a light outer layer',
      sport: 'light sportswear with comfortable sneakers',
      sleep: 'soft pajamas with slightly tousled hair',
      cafe: 'a tidy casual outfit with a relaxed, camera-ready look',
    },
    masculine: {
      home: 'an oversized T-shirt with relaxed lounge pants',
      outdoor: 'a clean casual outfit with a light jacket',
      sport: 'breathable sportswear with running shoes',
      sleep: 'comfortable sleepwear with a just-rested look',
      cafe: 'a casual layered outfit that still looks put together',
    },
    neutral: {
      home: 'comfortable home clothes with a relaxed look',
      outdoor: 'a simple casual outfit suited to being out for a while',
      sport: 'practical sportswear suited for movement',
      sleep: 'soft sleepwear and a sleepy, unguarded look',
      cafe: 'an easy casual outfit that still feels presentable',
    },
  } as const;

  return map[style][base];
}

function chooseTemplate(window: ResolvedWindow, sources: CollectedSources, profile: PersonaProfile): CandidateChoice {
  const dayEpisodes = parseMemoryFile(sources.memoryContent);
  const parts = parseTimestampParts(window.end);
  if (!parts) {
    throw new Error(`Cannot infer candidate without parseable window end: ${window.end}`);
  }

  const date = formatDate(parts);
  const holiday = getHoliday(date, inferCountryFromOffset(parts.offset));
  const weekend = [0, 6].includes(dayOfWeek(parts));
  const timeBand = inferTimeBand(parts);
  const anchor = usableAnchor(sources);
  const priorEpisode = dayEpisodes[dayEpisodes.length - 1];

  if (anchor) {
    const action = `following the thread of a real ongoing context: ${anchor.slice(0, 96)}`;
    return {
      location: priorEpisode?.location || profile.homeLabel,
      action,
      emotionTags: ['focused', 'present'],
      internalMonologue: 'The current thread already has enough context, so I should stay consistent with it instead of improvising wildly.',
      naturalText: 'The current state is being inferred from a hard conversational anchor and aligned with the persona memory context.',
      appearanceDefault: styleAppearance(profile.style, priorEpisode ? 'home' : 'cafe'),
      confidence: 0.74,
      reason: 'sessions_history or semantic recall provided a usable hard anchor',
    };
  }

  if (priorEpisode) {
    const continuing = timeBand === 'late_night'
      ? `winding down after ${priorEpisode.action}`
      : `continuing the thread of ${priorEpisode.action}`;
    return {
      location: priorEpisode.location,
      action: continuing,
      emotionTags: ['calm', 'focused'],
      internalMonologue: 'The day should feel continuous, so the safest move is to extend what was already happening rather than jump to a random new scene.',
      naturalText: 'The current moment is inferred as a continuation of the latest same-day canon state.',
      appearanceDefault: priorEpisode.appearance === 'unknown' ? styleAppearance(profile.style, 'home') : priorEpisode.appearance,
      confidence: 0.68,
      reason: 'same-day canon continuity anchor available',
    };
  }

  if (timeBand === 'late_night') {
    return {
      location: 'bedroom with dim warm lighting',
      action: 'sleeping lightly and shifting in bed after a long day',
      emotionTags: ['sleepy', 'calm'],
      internalMonologue: 'Nothing dramatic is happening right now; the body just wants rest and quiet.',
      naturalText: 'With no stronger factual anchor and the current time deep into the night, the most reasonable non-empty state is sleep.',
      appearanceDefault: styleAppearance(profile.style, 'sleep'),
      confidence: 0.7,
      reason: 'time-of-day strongly suggests sleep / night rest',
    };
  }

  if (profile.traits.sporty && (timeBand === 'morning' || (weekend && timeBand === 'afternoon'))) {
    return {
      location: weekend ? 'nearby park path with open space' : 'small neighborhood gym studio',
      action: 'doing a light workout routine and easing into a steady rhythm',
      emotionTags: ['energized', 'focused'],
      internalMonologue: 'A little movement clears my head and makes the rest of the day feel much more grounded.',
      naturalText: 'The generated memory follows the persona’s movement-oriented habits and the current real-world time window.',
      appearanceDefault: styleAppearance(profile.style, 'sport'),
      confidence: 0.67,
      reason: 'sport / routine signals from persona context matched the current time window',
    };
  }

  if ((profile.traits.creative || profile.traits.photography) && timeBand === 'afternoon') {
    return {
      location: profile.homeLabel,
      action: profile.traits.photography
        ? 'sorting visual ideas and checking how the current light would look in a selfie'
        : 'organizing notes, polishing ideas, and quietly moving through a creative work block',
      emotionTags: ['focused', 'inspired'],
      internalMonologue: 'This kind of quiet block is where scattered impressions finally begin to make sense.',
      naturalText: 'The generated memory aligns the persona’s creative tendencies with a realistic afternoon work rhythm.',
      appearanceDefault: styleAppearance(profile.style, 'home'),
      confidence: 0.65,
      reason: 'creative / photography signals from SOUL, MEMORY, or IDENTITY matched the current day phase',
    };
  }

  if ((profile.traits.social || profile.traits.foodie) && (weekend || holiday || timeBand === 'evening')) {
    const holidayLabel = holiday ? `because today is ${holiday}` : 'because the current time fits a social outing';
    return {
      location: 'a cozy neighborhood cafe with warm light and a low-key crowd',
      action: 'sitting with a drink, people-watching a little, and letting the conversation atmosphere settle in',
      emotionTags: ['relaxed', 'content'],
      internalMonologue: `This kind of place makes it easy to feel present and human, ${holidayLabel}.`,
      naturalText: 'The generated memory uses persona social cues together with weekend / holiday context to avoid a blank state.',
      appearanceDefault: styleAppearance(profile.style, 'cafe'),
      confidence: 0.63,
      reason: 'social / cafe-oriented persona cues combined with weekend, holiday, or evening timing',
    };
  }

  const homeAction = weekend || holiday
    ? 'moving slowly around the apartment, tidying small things, and enjoying a low-pressure day'
    : 'making progress on small personal tasks and checking in with the day in a quiet, self-directed way';

  return {
    location: profile.homeLabel,
    action: homeAction,
    emotionTags: profile.traits.introspective ? ['calm', 'self-contained'] : ['calm', 'steady'],
    internalMonologue: 'There is no strong external anchor right now, so the most believable state is a grounded, ordinary slice of life rather than a dramatic invention.',
    naturalText: 'The generated memory falls back to an ordinary persona-consistent daily moment instead of returning a blank response.',
    appearanceDefault: styleAppearance(profile.style, 'home'),
    confidence: 0.58,
    reason: 'persona-guided low-information fallback using SOUL / MEMORY / IDENTITY plus real-world time context',
  };
}

export function inferCandidate(window: ResolvedWindow, sources: CollectedSources): GeneratedCandidateResult {
  const dayEpisodes = parseMemoryFile(sources.memoryContent);
  const timestampParts = parseTimestampParts(window.end);
  if (!timestampParts) {
    throw new Error(`Cannot infer candidate without parseable window end: ${window.end}`);
  }

  const profile = buildProfile(sources);
  const choice = chooseTemplate(window, sources, profile);
  const priorEpisode = dayEpisodes[dayEpisodes.length - 1];
  const appearanceResolution = resolveAppearance(dayEpisodes, choice.action, choice.appearanceDefault);
  const parsed: ParsedEpisode = {
    timestamp: window.end,
    location: choice.location,
    action: choice.action,
    emotionTags: choice.emotionTags,
    appearance: appearanceResolution.appearance,
    internalMonologue: choice.internalMonologue,
    naturalText: choice.naturalText,
    parseLevel: 'A',
    confidence: choice.confidence,
  };

  const date = formatDate(timestampParts);
  const idempotencyKey = computeFingerprint(date, parsed.location, parsed.action, parsed.timestamp);
  const worldHooks = {
    weekday: ![0, 6].includes(dayOfWeek(timestampParts)),
    holiday_key: getHoliday(date, inferCountryFromOffset(timestampParts.offset)),
  };

  return {
    parsed,
    episode: mapToEpisode(parsed, worldHooks, idempotencyKey),
    idempotencyKey,
    confidenceReason: choice.reason,
    notes: [
      'No reusable canon entry found; generated a persona-consistent timeline memory.',
      `Generation basis: ${choice.reason}`,
      `Persona context loaded: ${profile.summaryText ? 'SOUL / MEMORY / IDENTITY signals available' : 'no explicit profile files found; used generic world-aware fallback'}`,
      `Appearance resolution: ${appearanceResolution.reason}`,
    ],
    appearance: {
      inherited: !appearanceResolution.overridden,
      reason: appearanceResolution.reason,
      source_episode_timestamp: priorEpisode?.timestamp,
    },
  };
}
