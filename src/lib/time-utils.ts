export interface TimestampParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  offset?: string;
}

const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})?$/;

export function parseTimestampParts(timestamp: string): TimestampParts | null {
  const match = timestamp.trim().match(TIMESTAMP_RE);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
    offset: match[7],
  };
}

export function formatDate(parts: TimestampParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function formatTime(parts: TimestampParts): string {
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
}

export function formatTimestamp(parts: TimestampParts, includeOffset = true): string {
  const base = `${formatDate(parts)}T${formatTime(parts)}`;
  return includeOffset && parts.offset ? `${base}${parts.offset}` : base;
}

export function addHours(parts: TimestampParts, hoursToAdd: number): TimestampParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  date.setUTCHours(date.getUTCHours() + hoursToAdd);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
    offset: parts.offset,
  };
}

export function dayOfWeek(parts: TimestampParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}
