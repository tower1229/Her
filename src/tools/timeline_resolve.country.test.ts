jest.mock('../lib/holidays', () => ({
  getHoliday: jest.fn(() => null),
}));

import { getHoliday } from '../lib/holidays';
import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
  timelineResolve,
} from './timeline_resolve';

describe('timelineResolve holiday country inference', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
    (getHoliday as jest.Mock).mockClear();
    setTimelineResolveDependencies({
      planTimelineQuery: async () => ({
        schema_version: '1.0',
        target_time_range: 'now',
        summary: 'Interpreted the request as a current-state query.',
      }),
    });
  });

  it('uses US holiday inference for -05:00 facts', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00-05:00', timezone: 'America/New_York' }),
      sessionsHistory: async () => [],
      memoryGet: async () => `
### [14:30:00]
- Timestamp: 2026-03-22 14:30:00-05:00
- Location: home office
- Action: writing notes
- Emotion_Tags: [focused]
- Appearance: hoodie
      `,
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        time_interpretation: {
          normalized_kind: 'now',
          match_strategy: 'continuation',
          summary: 'now query',
        },
        decision: {
          action: 'reuse_existing_fact',
          selected_fact_id: 'canon:2026-03-22:0',
          should_write_canon: false,
        },
        continuity: {
          judged: true,
          is_continuing: true,
          reason: 'fact covers current moment',
        },
        rationale: {
          summary: 'reuse existing fact',
          hard_fact_basis: [],
          canon_basis: ['canon:2026-03-22:0'],
          persona_basis: [],
          constraint_basis: [],
        },
      }),
    });

    const result = await timelineResolve({
      query: 'what are you doing now',
      mode: 'read_only',
      trace: true,
    });
    expect(result.ok).toBe(true);
    expect(getHoliday).toHaveBeenCalledWith('2026-03-22', 'US');
  });
});
