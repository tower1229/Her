import { resolveWindow } from './resolve_window';

describe('resolveWindow', () => {
  const now = '2026-03-22T14:30:00+08:00';
  const timezone = 'Asia/Shanghai';

  it('resolves now deterministically', () => {
    const window = resolveWindow(
      { target_time_range: 'now', mode: 'read_only', reason: 'current_status' },
      now,
      timezone,
    );

    expect(window.query_range).toBe('now');
    expect(window.semantic_target).toBe('now');
    expect(window.collection_scope).toBe('today_so_far');
    expect(window.start).toBe('2026-03-22T00:00:00+08:00');
    expect(window.end).toBe(now);
    expect(window.calendar_date).toBe('2026-03-22');
  });

  it('maps natural language now-like queries to now', () => {
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

    expect(window.query_range).toBe('now');
    expect(window.semantic_target).toBe('now');
    expect(window.collection_scope).toBe('today_so_far');
    expect(window.start).toBe('2026-03-22T00:00:00+08:00');
  });

  it('distinguishes current now semantics from today summary semantics', () => {
    const currentWindow = resolveWindow(
      { target_time_range: 'now', mode: 'read_only', reason: 'current_status' },
      now,
      timezone,
    );
    const summaryWindow = resolveWindow(
      { target_time_range: 'natural_language', query: '你今天都忙了什么', mode: 'read_only', reason: 'past_recall' },
      now,
      timezone,
    );

    expect(currentWindow.semantic_target).toBe('now');
    expect(summaryWindow.semantic_target).toBe('past_range');
    expect(currentWindow.collection_scope).toBe('today_so_far');
    expect(summaryWindow.collection_scope).toBe('today_so_far');
  });

  it('maps a past point query like 昨晚八点 to past_point with explicit collection scope', () => {
    const window = resolveWindow(
      { target_time_range: 'natural_language', query: '昨晚八点你在做什么', mode: 'read_only', reason: 'past_recall' },
      now,
      timezone,
    );

    expect(window.query_range).toBe('explicit');
    expect(window.semantic_target).toBe('past_point');
    expect(window.collection_scope).toBe('explicit_range');
    expect(window.calendar_date).toBe('2026-03-21');
  });

  it('maps a past range query like 昨晚在做什么 to past_range with explicit collection scope', () => {
    const window = resolveWindow(
      { target_time_range: 'natural_language', query: '昨晚在做什么', mode: 'read_only', reason: 'past_recall' },
      now,
      timezone,
    );

    expect(window.query_range).toBe('explicit');
    expect(window.semantic_target).toBe('past_range');
    expect(window.collection_scope).toBe('explicit_range');
    expect(window.calendar_date).toBe('2026-03-21');
  });
});
