import { parseTimestampParts } from '../lib/time-utils';

export function enumerateCalendarDates(start: string, end: string): string[] {
  const startParts = parseTimestampParts(start);
  const endParts = parseTimestampParts(end);
  if (!startParts || !endParts) {
    const fallback = start.slice(0, 10);
    return fallback ? [fallback] : [];
  }

  const dates: string[] = [];
  const current = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const endFloor = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day));

  while (current.getTime() <= endFloor.getTime()) {
    const yyyy = current.getUTCFullYear();
    const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}
