import { resolveWindow, TimelineQueryPlan } from './resolve_window';

describe('resolveWindow', () => {
  const now = '2026-03-22T14:30:00+08:00';
  const timezone = 'Asia/Shanghai';

  it('resolves now deterministically from a structured query plan', () => {
    const plan: TimelineQueryPlan = {
      schema_version: '1.0',
      target_time_range: 'now',
      summary: 'Interpreted the request as a current-state query.',
    };

    const window = resolveWindow(plan, now, timezone);

    expect(window.query_range).toBe('now');
    expect(window.semantic_target).toBe('now');
    expect(window.collection_scope).toBe('today_so_far');
    expect(window.start).toBe('2026-03-22T00:00:00+08:00');
    expect(window.end).toBe(now);
    expect(window.calendar_date).toBe('2026-03-22');
    expect(window.calendar_dates).toEqual(['2026-03-22']);
    expect(window.target_timestamp_hint).toBe(now);
  });

  it('resolves past_point from normalized_point', () => {
    const plan: TimelineQueryPlan = {
      schema_version: '1.0',
      target_time_range: 'past_point',
      normalized_point: '2026-03-21T20:00:00+08:00',
      summary: 'The LLM normalized “昨晚八点” into yesterday at 20:00.',
    };

    const window = resolveWindow(plan, now, timezone);

    expect(window.query_range).toBe('past_point');
    expect(window.semantic_target).toBe('past_point');
    expect(window.collection_scope).toBe('point_day');
    expect(window.start).toBe('2026-03-21T00:00:00+08:00');
    expect(window.end).toBe('2026-03-21T23:59:59+08:00');
    expect(window.calendar_dates).toEqual(['2026-03-21']);
    expect(window.target_timestamp_hint).toBe(plan.normalized_point);
    expect(window.normalization_notes).toEqual([plan.summary]);
  });

  it('resolves past_range from normalized_start and normalized_end', () => {
    const plan: TimelineQueryPlan = {
      schema_version: '1.0',
      target_time_range: 'past_range',
      normalized_start: '2026-03-21T18:00:00+08:00',
      normalized_end: '2026-03-21T23:00:00+08:00',
      summary: 'The LLM normalized “昨晚” into yesterday evening after dinner through bedtime.',
    };

    const window = resolveWindow(plan, now, timezone);

    expect(window.query_range).toBe('past_range');
    expect(window.semantic_target).toBe('past_range');
    expect(window.collection_scope).toBe('explicit_range');
    expect(window.start).toBe(plan.normalized_start);
    expect(window.end).toBe(plan.normalized_end);
    expect(window.calendar_date).toBe('2026-03-21');
    expect(window.calendar_dates).toEqual([]);
    expect(window.target_timestamp_hint).toBeUndefined();
  });
});
