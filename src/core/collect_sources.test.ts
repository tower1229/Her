import { collectSources, TimelineSourceDependencies } from './collect_sources';
import { ResolvedWindow } from './resolve_window';
import { buildTimelineCollectorOutput } from './collect_timeline_request';

describe('internal search diagnostics', () => {
  const window: ResolvedWindow = { query_range: 'now', semantic_target: 'now', collection_scope: 'today_so_far', start: '2026-11-01T00:00:00Z', end: '2026-11-01T09:00:00Z', calendar_date: '2026-11-01', calendar_dates: ['2026-11-01'], timezone: 'UTC', normalization_notes: [] };
  const deps: TimelineSourceDependencies = { currentTime: async () => ({ now: window.end, timezone: 'UTC' }), sessionsHistory: async () => ['chat'], memoryGet: async () => 'daily note' };
  it('keeps unavailable search separate from empty results without inventing a source', async () => {
    const result = await collectSources(deps, window, { query: 'now' });
    expect(result.memorySearchStatus?.state).toBe('unavailable');
    expect(result.sourceOrder).toEqual(['sessions_history', 'memory_get']);
    expect(result.dailyLogs[0].raw_content).toBe('daily note');
  });
  it.each([['permission denied', 'denied'], ['index failure', 'failed']])('preserves other sources after %s', async (message, state) => {
    const result = await collectSources({ ...deps, memorySearch: async () => { throw new Error(message); } }, window, { query: 'now' });
    expect(result.memorySearchStatus?.state).toBe(state);
    expect(result.sessionsHistory).toEqual(['chat']);
    expect(result.sourceOrder).not.toContain('memory_search');
  });
  it('records a successful empty search as available', async () => {
    const result = await collectSources({ ...deps, memorySearch: async () => [] }, window, { query: 'now' });
    expect(result.memorySearchStatus?.state).toBe('available');
    expect(result.sourceOrder).toContain('memory_search');
  });
  it('does not offer invalid or future records to the current-state reasoner', async () => {
    const source = await collectSources({ ...deps, memoryGet: async () => '### [future]\n- Timestamp: 2026-11-01 09:00:01\n### [invalid]\n- Timestamp: 2026-02-30 08:00:00\n', legacyLogTimezone: 'UTC' }, window, { query: 'now' });
    expect(buildTimelineCollectorOutput('r1', { query: 'now' }, window, source).candidate_facts).toEqual([]);
  });
  it('carries a previous-day travel parent into current inference without duplicating today or rewriting the query window', async () => {
    const memoryGet = jest.fn(async (day: string) => day === '2026-10-31'
      ? '### [09:00:00]\n- Timestamp: 2026-10-31 09:00:00\n- Action: Traveling in Dali\n- Estimated_Duration: 4320\n- Event_Id: travel-macro\n\n### [08:00:00]\n- Timestamp: 2026-10-31 08:00:00\n- Action: Finished breakfast\n- Estimated_Duration: 30\n- Event_Id: old-breakfast\n'
      : day === '2026-11-01'
        ? '### [08:30:00]\n- Timestamp: 2026-11-01 08:30:00\n- Action: Drinking tea\n- Estimated_Duration: 60\n- Event_Id: current-tea\n'
        : '');
    const source = await collectSources({ ...deps, memoryGet, legacyLogTimezone: 'UTC', currentStateLookbackDays: 7 }, window, { query: 'now' });
    const collector = buildTimelineCollectorOutput('r1', { query: 'now' }, window, source);
    expect(collector.candidate_facts.map(f => f.event_id)).toEqual(['current-tea', 'travel-macro']);
    expect(collector.candidate_facts[1]).toMatchObject({ fact_id: 'canon:2026-10-31:0', calendar_date: '2026-10-31', is_within_duration_window: true });
    expect(collector.window.calendar_dates).toEqual(['2026-11-01']);
    expect(memoryGet.mock.calls.filter(([day]) => day === '2026-11-01')).toHaveLength(1);
  });
  it('keeps past queries scoped to their requested dates even with current-state lookback enabled', async () => {
    const memoryGet = jest.fn(async () => '');
    const source = await collectSources({ ...deps, memoryGet, currentStateLookbackDays: 7 }, { ...window, query_range: 'past_range' }, { query: 'earlier today' });
    expect(memoryGet.mock.calls).toHaveLength(1);
    expect(source.currentBackgroundFacts).toEqual([]);
  });
  it.each([0, 1])('respects the existing same-day-only setting %i', async currentStateLookbackDays => {
    const memoryGet = jest.fn(async () => '');
    const source = await collectSources({ ...deps, memoryGet, currentStateLookbackDays }, window, { query: 'now' });
    expect(memoryGet.mock.calls).toHaveLength(1);
    expect(source.currentBackgroundFacts).toEqual([]);
  });
});
