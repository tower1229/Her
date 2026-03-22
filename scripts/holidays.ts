/**
 * holidays.ts — Static public holiday lookup (CN + US, 2025–2027).
 *
 * Data sourced from Nager.Date API (global public holidays only).
 * No network requests or file I/O at runtime.
 */

type HolidayEntry = { date: string; name: string };
type HolidayMap = Record<string, HolidayEntry[]>; // key: "YYYY-CC"

const STATIC_HOLIDAYS: HolidayMap = {
  // ── China 2025 ──────────────────────────────────────────────────
  "2025-CN": [
    { date: "2025-01-01", name: "New Year's Day" },
    { date: "2025-01-29", name: "Chinese New Year (Spring Festival)" },
    { date: "2025-05-01", name: "Labour Day" },
    { date: "2025-05-31", name: "Dragon Boat Festival" },
    { date: "2025-10-01", name: "National Day" },
    { date: "2025-10-06", name: "Mid-Autumn Festival" },
  ],
  // ── China 2026 ──────────────────────────────────────────────────
  "2026-CN": [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-17", name: "Chinese New Year (Spring Festival)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-06-19", name: "Dragon Boat Festival" },
    { date: "2026-09-25", name: "Mid-Autumn Festival" },
    { date: "2026-10-01", name: "National Day" },
  ],
  // ── China 2027 ──────────────────────────────────────────────────
  "2027-CN": [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-02-06", name: "Chinese New Year (Spring Festival)" },
    { date: "2027-05-01", name: "Labour Day" },
    { date: "2027-06-09", name: "Dragon Boat Festival" },
    { date: "2027-09-15", name: "Mid-Autumn Festival" },
    { date: "2027-10-01", name: "National Day" },
  ],
  // ── United States 2025 ──────────────────────────────────────────
  "2025-US": [
    { date: "2025-01-01", name: "New Year's Day" },
    { date: "2025-01-20", name: "Martin Luther King, Jr. Day" },
    { date: "2025-02-17", name: "Presidents Day" },
    { date: "2025-05-26", name: "Memorial Day" },
    { date: "2025-06-19", name: "Juneteenth National Independence Day" },
    { date: "2025-07-04", name: "Independence Day" },
    { date: "2025-09-01", name: "Labour Day" },
    { date: "2025-11-11", name: "Veterans Day" },
    { date: "2025-11-27", name: "Thanksgiving Day" },
    { date: "2025-12-25", name: "Christmas Day" },
  ],
  // ── United States 2026 ──────────────────────────────────────────
  "2026-US": [
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-01-19", name: "Martin Luther King, Jr. Day" },
    { date: "2026-02-16", name: "Presidents Day" },
    { date: "2026-05-25", name: "Memorial Day" },
    { date: "2026-06-19", name: "Juneteenth National Independence Day" },
    { date: "2026-07-03", name: "Independence Day" },
    { date: "2026-09-07", name: "Labour Day" },
    { date: "2026-11-11", name: "Veterans Day" },
    { date: "2026-11-26", name: "Thanksgiving Day" },
    { date: "2026-12-25", name: "Christmas Day" },
  ],
  // ── United States 2027 ──────────────────────────────────────────
  "2027-US": [
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-18", name: "Martin Luther King, Jr. Day" },
    { date: "2027-02-15", name: "Presidents Day" },
    { date: "2027-05-31", name: "Memorial Day" },
    { date: "2027-06-18", name: "Juneteenth National Independence Day" },
    { date: "2027-07-05", name: "Independence Day" },
    { date: "2027-09-06", name: "Labour Day" },
    { date: "2027-11-11", name: "Veterans Day" },
    { date: "2027-11-25", name: "Thanksgiving Day" },
    { date: "2027-12-24", name: "Christmas Day" },
  ],
};

/**
 * Returns the public holiday name for a given date and country, or null if none.
 * Supported countries: CN, US (2025–2027).
 * Falls back to null for unsupported years or countries.
 */
export function getHoliday(dateStr: string, countryCode = 'CN'): string | null {
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;

  const year = dateMatch[1];
  const targetDate = `${year}-${dateMatch[2]}-${dateMatch[3]}`;
  const key = `${year}-${countryCode}`;

  const entries = STATIC_HOLIDAYS[key];
  if (!entries) return null;

  const found = entries.find(h => h.date === targetDate);
  return found ? found.name : null;
}
