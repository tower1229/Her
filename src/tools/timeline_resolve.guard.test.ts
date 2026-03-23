import { resetTimelineResolveDependencies, setTimelineResolveDependencies, timelineResolve } from './timeline_resolve';

describe('timelineResolve canonical path guard', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
  });

  it('refuses generated writes to non-canonical paths', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Guard path run.'],
      memoryGet: async () => '',
      memoryFilePath: () => 'notes/2026-03-22.md',
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.resolution_summary.mode).toBe('write_blocked');
    expect(result.resolution_summary.writes_succeeded).toBe(0);
    expect(result.notes.join(' ')).toContain('Canonical daily logs must live under a memory/ directory');
  });
});
