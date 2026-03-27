export type HolidayCountryCode = 'CN' | 'US';

export function inferCountryFromOffset(offset?: string): HolidayCountryCode {
  return offset === '+08:00' ? 'CN' : 'US';
}

/**
 * Known IANA-style offsets that strongly correlate with southern-hemisphere locales
 * (Australia, New Zealand, Pacific, southern South America). Ambiguous offsets
 * (e.g. +10:00 also used by Vladivostok) follow this product heuristic.
 */
const SOUTHERN_OFFSETS = new Set([
  '+10:00',
  '+10:30',
  '+11:00',
  '+12:00',
  '+12:45',
  '+13:00',
  '+14:00',
  '-03:00',
  '-03:30',
  '-04:00',
  '-04:30',
]);

/**
 * Hemisphere for seasonal clothing plausibility. Uses an offset allowlist for
 * southern zones; all other offsets (including {@link inferCountryFromOffset}
 * CN/US defaults) are treated as northern.
 */
export function inferHemisphere(offset?: string): 'northern' | 'southern' {
  if (!offset) {
    return 'northern';
  }
  const normalized = normalizeOffset(offset);
  if (normalized && SOUTHERN_OFFSETS.has(normalized)) {
    return 'southern';
  }
  return 'northern';
}

/** Normalizes offset strings like "+8:00" or "+08:00:00" to "+08:00" for lookup. */
function normalizeOffset(offset: string): string | null {
  const m = offset.trim().match(/^([+-])(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const sign = m[1];
  const hours = String(Number(m[2])).padStart(2, '0');
  const minutes = String(Number(m[3])).padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}
