import { assertCanonicalDailyLogPath } from './daily_log';

describe('assertCanonicalDailyLogPath', () => {
  it('accepts canonical memory daily log paths', () => {
    expect(assertCanonicalDailyLogPath('memory/2026-03-22.md', '2026-03-22')).toBe('memory/2026-03-22.md');
  });

  it('rejects non-memory parent directories', () => {
    expect(() => assertCanonicalDailyLogPath('notes/2026-03-22.md', '2026-03-22')).toThrow(/memory/);
  });

  it('rejects mismatched filenames', () => {
    expect(() => assertCanonicalDailyLogPath('memory/2026-03-21.md', '2026-03-22')).toThrow(/calendar date/);
  });
});
