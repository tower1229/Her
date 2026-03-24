import { resolveWindow, TimelineQueryPlan } from './resolve_window';

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

  it('resolves past_point from a structured point_time without parsing natural language', () => {
    const window = resolveWindow(
      {
        target_time_range: 'past_point',
        point_time: '2026-03-21T20:00:00+08:00',
        mode: 'read_only',
        reason: 'past_recall',
      },
      now,
      timezone,
    );

    expect(window.query_range).toBe('past_point');
    expect(window.semantic_target).toBe('past_point');
    expect(window.collection_scope).toBe('point_day');
    expect(window.start).toBe('2026-03-21T00:00:00+08:00');
    expect(window.end).toBe('2026-03-21T23:59:59+08:00');
  });

  it('resolves past_range from structured start/end without parsing natural language', () => {
    const window = resolveWindow(
      {
        target_time_range: 'past_range',
        start: '2026-03-21T18:00:00+08:00',
        end: '2026-03-21T23:00:00+08:00',
        mode: 'read_only',
        reason: 'past_recall',
      },
      now,
      timezone,
    );

    expect(window.query_range).toBe('past_range');
    expect(window.semantic_target).toBe('past_range');
    expect(window.collection_scope).toBe('explicit_range');
    expect(window.calendar_date).toBe('2026-03-21');
  });

  it('can consume an LLM query plan for past_point', () => {
    const plan: TimelineQueryPlan = {
      schema_version: '1.0',
      target_time_range: 'past_point',
      normalized_point: '2026-03-21T20:00:00+08:00',
      summary: 'LLM 将“昨晚八点”归一化为昨天 20:00。',
    };

    const window = resolveWindow(
      { target_time_range: 'past_point', query: '昨晚八点你在做什么', mode: 'read_only', reason: 'past_recall' },
      now,
      timezone,
      plan,
    );

    expect(window.collection_scope).toBe('point_day');
    expect(window.normalization_notes).toEqual([plan.summary]);
  });

  it('can consume an LLM query plan for past_range', () => {
    const plan: TimelineQueryPlan = {
      schema_version: '1.0',
      target_time_range: 'past_range',
      normalized_start: '2026-03-21T18:00:00+08:00',
      normalized_end: '2026-03-21T23:00:00+08:00',
      summary: 'LLM 将“昨晚”归一化为昨天晚饭后到睡前。',
    };

    const window = resolveWindow(
      { target_time_range: 'past_range', query: '昨晚在做什么', mode: 'read_only', reason: 'past_recall' },
      now,
      timezone,
      plan,
    );

    expect(window.collection_scope).toBe('explicit_range');
    expect(window.start).toBe(plan.normalized_start);
    expect(window.end).toBe(plan.normalized_end);
  });
});
