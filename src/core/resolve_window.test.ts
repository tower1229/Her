import { resolveWindow } from './resolve_window';

describe('resolveWindow', () => {
  const now = '2026-03-22T14:30:00+08:00';
  const timezone = 'Asia/Shanghai';

  it('resolves now_today deterministically', () => {
    const window = resolveWindow(
      { target_time_range: 'now_today', mode: 'read_only', reason: 'current_status' },
      now,
      timezone,
    );

    expect(window.preset).toBe('now_today');
    expect(window.start).toBe('2026-03-22T00:00:00+08:00');
    expect(window.end).toBe(now);
    expect(window.calendar_date).toBe('2026-03-22');
  });

  it('maps natural language now-like queries to now_today', () => {
    const window = resolveWindow(
      {
        target_time_range: 'natural_language',
        query: 'what are you doing right now',
        mode: 'read_only',
        reason: 'current_status',
      },
      now,
      timezone,
    );

    expect(window.preset).toBe('now_today');
    expect(window.start).toBe('2026-03-22T00:00:00+08:00');
  });
});
