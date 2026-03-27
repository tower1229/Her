import { inferCountryFromOffset, inferHemisphere } from './country';

describe('inferHemisphere', () => {
  it('returns northern for CN and US default offsets', () => {
    expect(inferHemisphere('+08:00')).toBe('northern');
    expect(inferHemisphere('-05:00')).toBe('northern');
    expect(inferHemisphere('-08:00')).toBe('northern');
    expect(inferHemisphere()).toBe('northern');
  });

  it('returns southern for Australia and New Zealand style offsets', () => {
    expect(inferHemisphere('+10:00')).toBe('southern');
    expect(inferHemisphere('+10:30')).toBe('southern');
    expect(inferHemisphere('+11:00')).toBe('southern');
    expect(inferHemisphere('+12:00')).toBe('southern');
    expect(inferHemisphere('+12:45')).toBe('southern');
    expect(inferHemisphere('+13:00')).toBe('southern');
  });

  it('returns southern for southern South America offsets', () => {
    expect(inferHemisphere('-03:00')).toBe('southern');
    expect(inferHemisphere('-04:00')).toBe('southern');
  });

  it('normalizes flexible offset formats', () => {
    expect(inferHemisphere('+8:00')).toBe('northern');
    expect(inferHemisphere('+10:00')).toBe('southern');
    expect(inferHemisphere('+10:00:00')).toBe('southern');
  });
});

describe('inferCountryFromOffset', () => {
  it('maps +08:00 to CN', () => {
    expect(inferCountryFromOffset('+08:00')).toBe('CN');
  });

  it('falls back to US for other offsets or missing values', () => {
    expect(inferCountryFromOffset('-05:00')).toBe('US');
    expect(inferCountryFromOffset()).toBe('US');
  });
});
