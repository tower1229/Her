import { reasonWithPolicy } from './reason_with_policy';
import { TimelineCollectorOutput } from './timeline_reasoner_contract';
import { emptyPersonaContract } from '../persona/persona_contract';

function makeCollector(): TimelineCollectorOutput {
  return {
    schema_version: '1.0',
    request_id: 'req-1',
    request: {
      user_query: '今天下午我在做什么',
      mode: 'allow_generate',
    },
    anchor: { now: '2026-03-26T23:59:59+08:00', timezone: 'Asia/Shanghai' },
    window: {
      query_range: 'past_range',
      semantic_target: 'past_range',
      collection_scope: 'explicit_range',
      start: '2026-03-26T12:00:00+08:00',
      end: '2026-03-26T18:00:00+08:00',
      calendar_dates: ['2026-03-26'],
    },
    source_order: ['sessions_history', 'memory_get', 'memory_search'],
    hard_facts: { sessions_history: [] },
    conversation_context: {
      is_recently_active: false,
      minutes_since_last_turn: null,
      stickiness_window_minutes: 10,
      active_topic_summary: '',
      should_prefer_conversation_continuity_for_now: false,
    },
    canon_memory: { daily_logs: [] },
    semantic_memory: { memory_search: [] },
    persona_context: {
      contract: emptyPersonaContract(),
      available_sources: [],
      should_constrain_generation: false,
    },
    world_context: { target: null, range_calendar: [] },
    candidate_facts: [],
  };
}

describe('reasonWithPolicy', () => {
  it('recovers invalid reuse when candidate list is empty', async () => {
    const collector = makeCollector();
    const reasonTimeline = jest.fn(async (incoming: TimelineCollectorOutput) => {
      if (!incoming.request.recovery_hint) {
        return {
          schema_version: '1.0' as const,
          request_id: incoming.request_id,
          request_type: 'past_range' as const,
          decision: {
            action: 'reuse_existing_fact' as const,
            selected_fact_id: 'canon:2099-01-01:0',
            should_write_canon: false,
          },
          continuity: { judged: true, is_continuing: false },
          rationale: {
            summary: 'attempted reuse',
            hard_fact_basis: [],
            canon_basis: [],
            persona_basis: [],
            constraint_basis: [],
          },
        };
      }
      return {
        schema_version: '1.0' as const,
        request_id: incoming.request_id,
        request_type: 'past_range' as const,
        decision: {
          action: 'return_empty' as const,
          should_write_canon: false,
        },
        continuity: { judged: true, is_continuing: false },
        rationale: {
          summary: 'no reusable facts',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: [],
          constraint_basis: [],
        },
      };
    });

    const result = await reasonWithPolicy({
      collector,
      mode: 'allow_generate',
      reasonTimeline,
    });

    expect(reasonTimeline).toHaveBeenCalled();
    expect(result.guard.ok).toBe(true);
    expect(result.guard.outcome).toBe('return_empty');
  });

  it('throws when guard-recovery retry still fails validation', async () => {
    const collector = makeCollector();
    const reasonTimeline = jest.fn(async (incoming: TimelineCollectorOutput) => {
      if (!incoming.request.recovery_hint) {
        return {
          schema_version: '1.0' as const,
          request_id: incoming.request_id,
          request_type: 'past_range' as const,
          decision: {
            action: 'reuse_existing_fact' as const,
            selected_fact_id: 'canon:2099-01-01:0',
            should_write_canon: false,
          },
          continuity: { judged: true, is_continuing: false },
          rationale: {
            summary: 'attempted reuse',
            hard_fact_basis: [],
            canon_basis: [],
            persona_basis: [],
            constraint_basis: [],
          },
        };
      }
      return {
        schema_version: '1.0' as const,
        request_id: incoming.request_id,
        request_type: 'past_range' as const,
        decision: {
          action: 'reuse_existing_fact' as const,
          selected_fact_id: 'canon:2099-01-01:0',
          should_write_canon: false,
        },
        continuity: { judged: true, is_continuing: false },
        rationale: {
          summary: 'still invalid',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: [],
          constraint_basis: [],
        },
      };
    });

    await expect(
      reasonWithPolicy({
        collector,
        mode: 'allow_generate',
        reasonTimeline,
      }),
    ).rejects.toThrow(/^Guard recovery failed:/);
  });

  it('throws when guard-recovery retry returns null', async () => {
    const collector = makeCollector();
    const reasonTimeline = jest.fn(async (incoming: TimelineCollectorOutput) => {
      if (!incoming.request.recovery_hint) {
        return {
          schema_version: '1.0' as const,
          request_id: incoming.request_id,
          request_type: 'past_range' as const,
          decision: {
            action: 'reuse_existing_fact' as const,
            selected_fact_id: 'canon:2099-01-01:0',
            should_write_canon: false,
          },
          continuity: { judged: true, is_continuing: false },
          rationale: {
            summary: 'attempted reuse',
            hard_fact_basis: [],
            canon_basis: [],
            persona_basis: [],
            constraint_basis: [],
          },
        };
      }
      return null;
    });

    await expect(
      reasonWithPolicy({
        collector,
        mode: 'allow_generate',
        reasonTimeline,
      }),
    ).rejects.toThrow('Timeline reasoner returned no decision during guard recovery');
  });
});

