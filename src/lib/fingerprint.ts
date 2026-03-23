import { ParsedEpisode } from './types';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}]/gu, '');
}

function toTimeBucket(timestamp: string): string {
  // Try to parse timestamp e.g. "2026-03-22 14:35:00" or "2026-03-22T14:35:00+08:00"
  let dateObj = new Date(timestamp);
  if (isNaN(dateObj.getTime())) {
    // If invalid, try basic regex parsing for HH:mm
    const timeMatch = timestamp.match(/(\d{2}):(\d{2})/);
    if (timeMatch) {
      dateObj = new Date();
      dateObj.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
    } else {
      return 'unknown_time';
    }
  }

  const hours = dateObj.getHours().toString().padStart(2, '0');
  const minutes = dateObj.getMinutes() >= 30 ? '30' : '00';
  return `${hours}:${minutes}`;
}

export function computeFingerprint(date: string, location: string, action: string, timestamp: string): string {
  const bucket = toTimeBucket(timestamp);
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
