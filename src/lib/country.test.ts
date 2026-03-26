import { inferCountryFromOffset } from './country';

describe('inferCountryFromOffset', () => {
  it('maps +08:00 to CN', () => {
    expect(inferCountryFromOffset('+08:00')).toBe('CN');
  });

  it('falls back to US for other offsets or missing values', () => {
    expect(inferCountryFromOffset('-05:00')).toBe('US');
    expect(inferCountryFromOffset()).toBe('US');
  });
});
