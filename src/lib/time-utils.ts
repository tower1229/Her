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

/** Convert an instant to civil time fields for a fixed numeric offset (e.g. +08:00) or UTC when offset omitted. */
function toPartsAtInstant(d: Date, offset?: string): TimestampParts {
  if (!offset || offset === 'Z') {
    const base = {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
    };
    return offset === 'Z' ? { ...base, offset: 'Z' } : base;
  }
  const m = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) {
    return toPartsAtInstant(d, undefined);
  }
  const sign = m[1] === '+' ? 1 : -1;
  const offsetMin = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  const shifted = new Date(d.getTime() + offsetMin * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    offset,
  };
}

/**
 * Add minutes to a canonical timeline timestamp.
 * Uses the offset embedded in the string (e.g. +08:00 or Z) as a fixed numeric offset, not an IANA timezone
 * (no DST rules). Returns null if the input is not parseable.
 */
export function addMinutesToTimestampString(timestamp: string, deltaMinutes: number): string | null {
  const parts = parseTimestampParts(timestamp);
  if (!parts) return null;
  const normOffset = parts.offset && parts.offset !== 'Z' ? parts.offset : undefined;
  const iso =
    normOffset != null
      ? `${formatDate(parts)}T${formatTime(parts)}${normOffset}`
      : `${formatDate(parts)}T${formatTime(parts)}Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  d.setTime(d.getTime() + deltaMinutes * 60_000);
  const out = toPartsAtInstant(d, parts.offset === 'Z' ? 'Z' : normOffset);
  return formatTimestamp(out, true);
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
