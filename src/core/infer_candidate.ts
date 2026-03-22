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
  appearance: {
    inherited: boolean;
    reason: string;
  };
}

function pickAction(sources: CollectedSources): string {
  const hardAnchor = sources.sessionsHistory[0]?.trim();
  if (hardAnchor) {
    return `following recent context: ${hardAnchor.slice(0, 80)}`;
  }
  return 'resting quietly and staying in a low-information state';
}

function pickLocation(dayEpisodes: ParsedEpisode[]): string {
  return dayEpisodes[dayEpisodes.length - 1]?.location || 'unknown';
}

export function inferCandidate(window: ResolvedWindow, sources: CollectedSources): GeneratedCandidateResult {
  const dayEpisodes = parseMemoryFile(sources.memoryContent);
  const timestampParts = parseTimestampParts(window.end);
  if (!timestampParts) {
    throw new Error(`Cannot infer candidate without parseable window end: ${window.end}`);
  }

  const timestamp = window.end;
  const action = pickAction(sources);
  const location = pickLocation(dayEpisodes);
  const appearanceResolution = resolveAppearance(dayEpisodes, action, 'same outfit as before');
  const parsed: ParsedEpisode = {
    timestamp,
    location,
    action,
    emotionTags: ['calm'],
    appearance: appearanceResolution.appearance,
    internalMonologue: 'Keeping things simple and factual until stronger evidence appears.',
    naturalText: 'A conservative generated timeline placeholder was used because no canon entry matched the requested window.',
    parseLevel: 'B',
    confidence: 0.5,
  };

  const date = formatDate(timestampParts);
  const idempotencyKey = computeFingerprint(date, parsed.location, parsed.action, parsed.timestamp);
  const worldHooks = {
    weekday: ![0, 6].includes(dayOfWeek(timestampParts)),
    holiday_key: getHoliday(date),
  };

  return {
    parsed,
    episode: mapToEpisode(parsed, worldHooks, idempotencyKey),
    idempotencyKey,
    notes: [
      'No reusable canon entry found; generated a conservative candidate.',
      `Appearance resolution: ${appearanceResolution.reason}`,
    ],
    appearance: {
      inherited: !appearanceResolution.overridden,
      reason: appearanceResolution.reason,
    },
  };
}
