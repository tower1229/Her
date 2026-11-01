import { timestampMillis, effectiveTimestamp } from './timeline-time';
import { collectActiveFacts } from '../core/collect_active_facts';
import { resolveReadOnlyFastSnapshot } from '../tools/timeline_resolve';

describe('explicit legacy time interpretation', () => {
  it('interprets old civil timestamps with the supplied zone, independent of process TZ', () => {
    expect(timestampMillis('2026-11-01 09:00:00', 'Asia/Shanghai')).toBe(Date.parse('2026-11-01T01:00:00Z'));
    expect(timestampMillis('2026-11-01T09:00:00+08:00', 'UTC')).toBe(Date.parse('2026-11-01T01:00:00Z'));
  });
  it('rejects invalid dates, DST gaps and folds', () => {
    for (const value of ['2026-02-30 09:00:00', '2026-03-08 02:30:00', '2026-11-01 01:30:00']) {
      expect(timestampMillis(value, 'America/New_York')).toBeNaN();
    }
  });
  it('ignores stale hidden timestamps after manual edits and diagnoses the mismatch', () => {
    const diagnostic = jest.fn();
    expect(effectiveTimestamp('2026-11-01 10:00:00', '<!-- timeline:timestamp=2026-11-01T09:00:00+08:00 -->', diagnostic)).toBe('2026-11-01 10:00:00');
    expect(diagnostic).toHaveBeenCalled();
  });
  it('does not admit even a slightly future event as active', async () => {
    const text = '### [09:00:01]\n- Timestamp: 2026-11-01 09:00:01\n- Estimated_Duration: 120\n';
    expect(await collectActiveFacts(async () => text, '2026-11-01T09:00:00+08:00', 1, 'Asia/Shanghai')).toEqual([]);
  });
  it('selects the latest instant even when a manually edited daily file is out of order', async () => {
    const text = [
      '### [09:30:00]\n- Timestamp: 2026-11-01 09:30:00\n- Action: latest\n- Estimated_Duration: 120\n',
      '### [09:00:00]\n- Timestamp: 2026-11-01 09:00:00\n- Action: earlier\n- Estimated_Duration: 120\n',
    ].join('\n');
    const result = await resolveReadOnlyFastSnapshot({ currentTime: async () => ({ now: '2026-11-01T10:00:00+08:00', timezone: 'Asia/Shanghai' }), memoryGet: async () => text, legacyLogTimezone: 'Asia/Shanghai' });
    expect(result.status === 'hit' && result.parsed.action).toBe('latest');
  });
  it('finds the legacy local-date file across a host timezone midnight boundary', async () => {
    const memoryGet = async (date: string) => date === '2026-11-02' ? '### [03:30:00]\n- Timestamp: 2026-11-02 03:30:00\n- Action: cross-midnight\n- Estimated_Duration: 120\n' : '';
    const snapshots = await Promise.all(['2026-11-01T20:00:00Z', '2026-11-02T04:00:00+08:00'].map(now => resolveReadOnlyFastSnapshot({ currentTime: async () => ({ now, timezone: 'UTC' }), memoryGet, legacyLogTimezone: 'Asia/Shanghai' })));
    for (const result of snapshots) {
      expect(result.status === 'hit' && result.parsed.action).toBe('cross-midnight');
      expect(result.calendarDate).toBe('2026-11-02');
    }
  });
});
