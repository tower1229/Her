import { parseTimestampParts } from './time-utils';
import { ParsedEpisode } from './types';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}]/gu, '');
}

/**
 * Half-hour resolution clock bucket used by `computeFingerprint` and write conflict detection.
 * Call sites must not parse fingerprint strings; use this with the raw episode timestamp instead.
 */
export function halfHourTimelineBucket(timestamp: string): string {
  const parts = parseTimestampParts(timestamp);
  if (!parts) return 'unknown_time';
  const hours = String(parts.hour).padStart(2, '0');
  const minutes = parts.minute >= 30 ? '30' : '00';
  return `${hours}:${minutes}`;
}

export function computeFingerprint(date: string, location: string, action: string, timestamp: string): string {
  const bucket = halfHourTimelineBucket(timestamp);
  return `${normalize(date)}|${normalize(location)}|${normalize(action)}|${bucket}`;
}

export function checkReadOnlyHit(
  episodes: ParsedEpisode[],
  target: { location: string; action: string; timestamp: string; date: string }
): { hit: boolean; matchedEpisode?: ParsedEpisode } {
  
  const targetFingerprint = computeFingerprint(target.date, target.location, target.action, target.timestamp);

  for (const ep of episodes) {
    const epDateMatch = ep.timestamp.match(/^(\d{4}-\d{2}-\d{2})/);
    const epDate = epDateMatch ? epDateMatch[1] : target.date; // Use target date if unable to extract

    const epFingerprint = computeFingerprint(epDate, ep.location, ep.action, ep.timestamp);
    if (targetFingerprint === epFingerprint) {
      return { hit: true, matchedEpisode: ep };
    }
  }

  return { hit: false };
}
