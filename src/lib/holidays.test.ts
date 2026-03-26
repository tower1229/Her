import { getHoliday } from './holidays';
import { GENERATED_HOLIDAYS } from './holidays.generated';

describe('getHoliday', () => {
  it('resolves an entry from generated data', () => {
    const [key, entries] = Object.entries(GENERATED_HOLIDAYS).find(([, value]) => value.length > 0) || [];
    expect(key).toBeTruthy();
    expect(entries).toBeTruthy();
    if (!key || !entries) throw new Error('generated holidays unexpectedly empty');
    const [year, countryCode] = key.split('-');
    const sample = entries[0];

    expect(sample).toBeTruthy();
    expect(getHoliday(sample.date, countryCode as 'CN' | 'US')).toBe(sample.name);
    expect(getHoliday(`${Number(year) + 99}-01-01`, countryCode as 'CN' | 'US')).toBeNull();
  });
});
