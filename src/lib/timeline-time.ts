import { formatDate, formatTime, parseTimestampParts } from './time-utils';

export function hostTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function isValidTimezone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; }
}

function civilAt(ms: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(ms);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function timestampMillis(value: string, legacyTimezone = hostTimezone()): number {
  const p = parseTimestampParts(value);
  if (!p) return NaN;
  const civil = `${formatDate(p)}T${formatTime(p)}`;
  const naive = Date.parse(`${civil}Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 19) !== civil) return NaN;
  if (p.offset) return Date.parse(`${civil}${p.offset}`);
  if (!isValidTimezone(legacyTimezone)) return NaN;
  // Sample both sides of transitions; validate candidates against the requested civil time.
  // Multiple matches (fold) and zero matches (gap) are deliberately rejected.
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const sample = naive + h * 3600000;
    offsets.add(Date.parse(`${civilAt(sample, legacyTimezone)}Z`) - sample);
  }
  const candidates = [...offsets].map(o => naive - o).filter(t => civilAt(t, legacyTimezone) === civil);
  return candidates.length === 1 ? candidates[0] : NaN;
}

export function effectiveTimestamp(visible: string, block: string, diagnostic?: (message: string) => void): string {
  const metadata = [...block.matchAll(/<!-- timeline:timestamp=([^\s]+) -->/g)];
  if (metadata.length === 0) return visible;
  const stored = metadata[0][1];
  const vp = parseTimestampParts(visible);
  const sp = parseTimestampParts(stored);
  if (metadata.length === 1 && vp && sp?.offset && formatDate(vp) === formatDate(sp) && formatTime(vp) === formatTime(sp) && Number.isFinite(timestampMillis(stored)) && (!vp.offset || timestampMillis(visible) === timestampMillis(stored))) return stored;
  diagnostic?.('Timeline timestamp metadata differs from edited Timestamp; using legacyLogTimezone.');
  return visible;
}

export function timestampWithOffset(value: string, zone?: string): string {
  const ms = timestampMillis(value, zone);
  if (!Number.isFinite(ms)) throw new Error('Invalid or ambiguous timeline timestamp');
  const p = parseTimestampParts(value)!;
  if (p.offset) return value.replace(' ', 'T');
  const civil = `${formatDate(p)}T${formatTime(p)}`;
  const offset = Math.round((Date.parse(`${civil}Z`) - ms) / 60000);
  return `${civil}${offset < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
}

export function civilTimestampInZone(value: string, zone: string): string | undefined {
  const instant = timestampMillis(value, zone);
  return Number.isFinite(instant) && isValidTimezone(zone) ? civilAt(instant, zone) : undefined;
}
