/**
 * holidays.ts — Generated static public holiday lookup (CN + US).
 *
 * Data sourced from Nager.Date API by scripts/generate-holidays.mjs.
 * No network requests or file I/O at runtime.
 */
import { HolidayCountryCode } from './country';
import { GENERATED_HOLIDAYS } from './holidays.generated';

/**
 * Returns the public holiday name for a given date and country, or null if none.
 * Supported countries: CN, US (coverage generated at release time).
 * Falls back to null for unsupported years or countries.
 */
export function getHoliday(dateStr: string, countryCode: HolidayCountryCode = 'CN'): string | null {
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;

  const year = dateMatch[1];
  const targetDate = `${year}-${dateMatch[2]}-${dateMatch[3]}`;
  const key = `${year}-${countryCode}`;

  const entries = GENERATED_HOLIDAYS[key];
  if (!entries) return null;

  const found = entries.find(h => h.date === targetDate);
  return found ? found.name : null;
}
