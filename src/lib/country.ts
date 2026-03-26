export type HolidayCountryCode = 'CN' | 'US';

export function inferCountryFromOffset(offset?: string): HolidayCountryCode {
  return offset === '+08:00' ? 'CN' : 'US';
}
