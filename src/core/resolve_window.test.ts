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

    expect(window.legacy_preset).toBe('now_today');
    expect(window.semantic_target).toBe('now');
    expect(window.collection_scope).toBe('today_so_far');
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

    expect(window.legacy_preset).toBe('now_today');
    expect(window.semantic_target).toBe('now');
    expect(window.collection_scope).toBe('today_so_far');
    expect(window.start).toBe('2026-03-22T00:00:00+08:00');
  });

  it('distinguishes current now semantics from today summary semantics', () => {
    const currentWindow = resolveWindow(
      { target_time_range: 'now_today', mode: 'read_only', reason: 'current_status' },
      now,
      timezone,
    );
    const summaryWindow = resolveWindow(
      { target_time_range: 'natural_language', query: '你今天都忙了什么', mode: 'read_only', reason: 'past_recall' },
      now,
      timezone,
    );

    expect(currentWindow.semantic_target).toBe('now');
    expect(summaryWindow.semantic_target).toBe('today_summary');
    expect(currentWindow.collection_scope).toBe('today_so_far');
    expect(summaryWindow.collection_scope).toBe('today_so_far');
  });
});
