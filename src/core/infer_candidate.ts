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

function pickAction(window: ResolvedWindow, sources: CollectedSources, dayEpisodes: ParsedEpisode[]): { action: string; reason: string; confidence: number } {
  const hardAnchor = sources.sessionsHistory[0]?.trim();
  if (hardAnchor) {
    return {
      action: `continuing context implied by sessions_history: ${hardAnchor.slice(0, 80)}`,
      reason: 'sessions_history hard anchor available',
      confidence: 0.68,
    };
  }

  const priorEpisode = dayEpisodes[dayEpisodes.length - 1];
  if (window.preset === 'now_today' && priorEpisode) {
    return {
      action: `continuing ${priorEpisode.action}`,
      reason: 'same-day prior canon episode reused as ongoing activity anchor',
      confidence: 0.58,
    };
  }

  return {
    action: 'resting quietly and staying in a low-information state',
    reason: 'no hard anchor or same-day canon activity available',
    confidence: 0.42,
  };
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
  const actionChoice = pickAction(window, sources, dayEpisodes);
  const location = pickLocation(dayEpisodes);
  const priorEpisode = dayEpisodes[dayEpisodes.length - 1];
  const appearanceResolution = resolveAppearance(dayEpisodes, actionChoice.action, 'same outfit as before');
  const parsed: ParsedEpisode = {
    timestamp,
    location,
    action: actionChoice.action,
    emotionTags: ['calm'],
    appearance: appearanceResolution.appearance,
    internalMonologue: 'Keeping things simple and factual until stronger evidence appears.',
    naturalText: 'A conservative generated timeline placeholder was used because no canon entry matched the requested window.',
    parseLevel: 'B',
    confidence: actionChoice.confidence,
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
    confidenceReason: actionChoice.reason,
    notes: [
      'No reusable canon entry found; generated a conservative candidate.',
      `Generation basis: ${actionChoice.reason}`,
      `Appearance resolution: ${appearanceResolution.reason}`,
    ],
    appearance: {
      inherited: !appearanceResolution.overridden,
      reason: appearanceResolution.reason,
      source_episode_timestamp: priorEpisode?.timestamp,
    },
  };
}
