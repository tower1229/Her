import { addMinutesToTimestampString } from './time-utils';

describe('addMinutesToTimestampString', () => {
  it('adds minutes across day boundaries with fixed offset', () => {
    expect(addMinutesToTimestampString('2026-04-01T13:46:42+08:00', 2880)).toBe('2026-04-03T13:46:42+08:00');
  });

  it('handles Zulu offset', () => {
    expect(addMinutesToTimestampString('2026-04-01T05:00:00Z', 90)).toBe('2026-04-01T06:30:00Z');
  });
});
