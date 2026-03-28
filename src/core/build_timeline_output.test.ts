import { buildEmptyOutput, buildForgetfulnessNotes, buildGeneratedOutput, buildReadOnlyHitOutput } from './build_timeline_output';
import { TimelineCollectorOutput, TimelineReasonerOutput } from './timeline_reasoner_contract';

function makeCollector(): TimelineCollectorOutput {
  return {
    schema_version: '1.0',
    request_id: 'req-1',
    request: { user_query: 'test', mode: 'allow_generate' },
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
      soul: '',
      memory: '',
      identity: '',
      available_sources: [],
      should_constrain_generation: false,
    },
    world_context: { target: null, range_calendar: [] },
    candidate_facts: [],
  };
}

describe('build_timeline_output', () => {
  const reasoned: TimelineReasonerOutput = {
    schema_version: '1.0',
    request_id: 'req-1',
    request_type: 'past_range',
    decision: { action: 'return_empty', should_write_canon: false },
    continuity: { judged: true, is_continuing: false },
    rationale: {
      summary: 'No reusable facts',
      hard_fact_basis: [],
      canon_basis: [],
      persona_basis: [],
      constraint_basis: [],
    },
  };

  it('adds forgetfulness reminder', () => {
    const notes = buildForgetfulnessNotes(reasoned, {
      start: '2026-03-26T12:00:00+08:00',
      end: '2026-03-26T18:00:00+08:00',
    });
    expect(notes.join(' ')).toContain('记不清');
  });

  it('builds empty output with stable contract fields', () => {
    const output = buildEmptyOutput({
      traceId: 'trace-test-empty',
      window: {
        calendar_date: '2026-03-26',
        query_range: 'past_range',
        semantic_target: 'past_range',
        collection_scope: 'explicit_range',
        start: '2026-03-26T12:00:00+08:00',
        end: '2026-03-26T18:00:00+08:00',
        timezone: 'Asia/Shanghai',
      },
      collector: makeCollector(),
      reasoned,
    });
    expect(output.ok).toBe(true);
    expect(output.trace_id).toBe('trace-test-empty');
    expect(output.resolution_summary.mode).toBe('empty_window');
    expect(output.result?.consumption?.fact.status).toBe('empty');
    expect(output.result?.consumption?.scene).toBeUndefined();
    expect(output.result?.consumption?.selfie_ready).toBeUndefined();
  });

  it('builds read-only output with resolved fact payload', () => {
    const collector = makeCollector();
    collector.persona_context.identity = 'Home city: Shanghai';
    const output = buildReadOnlyHitOutput({
      traceId: 'trace-test-readonly',
      selectedFact: {
        fact_id: 'canon:2026-03-26:0',
        source_type: 'canon_daily_log',
        calendar_date: '2026-03-26',
        timestamp: '2026-03-26T15:30:00+08:00',
        location: '书房',
        action: '整理笔记',
        emotion_tags: ['专注'],
        appearance: '家居服',
        internal_monologue: '把结构梳理清楚',
        parse_level: 'A',
        confidence: 0.88,
      },
      window: {
        calendar_date: '2026-03-26',
        query_range: 'past_range',
        semantic_target: 'past_range',
        collection_scope: 'explicit_range',
        start: '2026-03-26T12:00:00+08:00',
        end: '2026-03-26T18:00:00+08:00',
        timezone: 'Asia/Shanghai',
      },
      collector,
      reasoned: {
        ...reasoned,
        decision: {
          action: 'reuse_existing_fact',
          selected_fact_id: 'canon:2026-03-26:0',
          should_write_canon: false,
        },
      },
    });
    expect(output.trace_id).toBe('trace-test-readonly');
    expect(output.resolution_summary.mode).toBe('read_only_hit');
    expect(output.result?.consumption?.fact.status).toBe('resolved');
    expect(output.result?.consumption?.scene?.city).toBe('Shanghai');
    expect(output.result?.consumption?.scene?.calendar_date).toBe('2026-03-26');
    expect(output.result?.consumption?.scene?.local_timestamp).toBe('2026-03-26T15:30:00+08:00');
    expect(output.result?.consumption?.scene?.timezone).toBe('Asia/Shanghai');
    expect(output.result?.consumption?.scene?.activity_mode).toBeUndefined();
    expect(output.result?.consumption?.scene?.continuity_relation).toBe('fresh_moment');
    expect(output.result?.consumption?.scene?.social_context).toBeUndefined();
    expect(output.result?.consumption?.scene?.appearance_change_expected).toBeUndefined();
    expect(output.result?.consumption?.scene?.location_props).toEqual(['desk']);
    expect(output.result?.consumption?.scene?.lighting_hint).toBe('soft daylight');
    expect(output.result?.consumption?.scene?.framing_hint).toBe('half-body, seated, near-table framing');
    expect(output.result?.consumption?.selfie_ready?.location).toContain('Shanghai');
    expect(output.result?.episodes).toHaveLength(1);
  });

  it('builds generated output with consistent resolution and notes', () => {
    const output = buildGeneratedOutput({
      traceId: 'trace-test-generated',
      window: {
        calendar_date: '2026-03-26',
        query_range: 'past_range',
        semantic_target: 'past_range',
        collection_scope: 'explicit_range',
        start: '2026-03-26T12:00:00+08:00',
        end: '2026-03-26T18:00:00+08:00',
        timezone: 'Asia/Shanghai',
      },
      collector: {
        ...makeCollector(),
        persona_context: {
          soul: '',
          memory: '',
          identity: 'Home city: Shanghai',
          available_sources: ['identity'],
          should_constrain_generation: true,
        },
      },
      reasoned: {
        ...reasoned,
        decision: { action: 'generate_new_fact', should_write_canon: true },
        continuity: { judged: true, is_continuing: false, reason: 'new generated scene' },
        generated_fact: {
          location: '书房',
          action: '整理笔记',
          emotionTags: ['专注'],
          appearance: '家居服',
          internalMonologue: '把结构梳理清楚',
          confidence: 0.77,
          sceneSemantics: {
            activityMode: 'work_or_study',
            continuityRelation: 'fresh_moment',
            rationale: 'generated work scene',
          },
          appearanceLogic: {
            transition: 'change_required',
            changeReason: 'formal_outing',
            outfitMode: 'casual_outing',
          },
        },
      },
      resolutionMode: 'generated_new',
      generated: {
        parsed: { confidence: 0.77 },
        idempotencyKey: 'fp-1',
        notes: ['No reusable canon entry found; generated a timeline memory from the LLM draft.'],
        episode: {
          episode_id: 'ep-1',
          schema_version: '1.0',
          document_type: 'timeline.episode',
          temporal: {
            start: '2026-03-26T15:30:00+08:00',
            end: '2026-03-26T15:30:00+08:00',
            time_of_day: 'afternoon',
            granularity: 'minute',
          },
          narrative: {
            summary: '整理笔记',
          },
          state_snapshot: {
            scene: {
              location_kind: 'indoor',
              location_label: '书房',
              activity: '整理笔记',
              time_of_day: 'afternoon',
            },
            emotion: {
              primary: '专注',
              secondary: null,
              intensity: 0.7,
            },
            appearance: {
              outfit_style: '家居服',
              grooming: null,
              posture_energy: null,
            },
          },
          world_hooks: {
            weekday: true,
            holiday_key: null,
          },
          provenance: {
            writer: 'stella-timeline-plugin',
            written_at: '2026-03-26T15:31:00+08:00',
            idempotency_key: 'fp-1',
            confidence: 0.77,
          },
        },
      },
      generatedCalendarDate: '2026-03-26',
      filePath: 'memory/2026-03-26.md',
      normalizedWriteResult: {
        success: true,
        written_at: '2026-03-26T15:31:00+08:00',
        outcome: 'appended',
      },
      sources: makeCollector().source_order,
    });
    expect(output.ok).toBe(true);
    expect(output.trace_id).toBe('trace-test-generated');
    expect(output.resolution_summary.mode).toBe('generated_new');
    expect(output.result?.consumption?.fact.source_type).toBe('generated');
    expect(output.result?.consumption?.scene?.calendar_date).toBe('2026-03-26');
    expect(output.result?.consumption?.scene?.local_timestamp).toBe('2026-03-26T15:30:00+08:00');
    expect(output.result?.consumption?.scene?.timezone).toBe('Asia/Shanghai');
    expect(output.result?.consumption?.scene?.city).toBe('Shanghai');
    expect(output.result?.consumption?.scene?.activity_mode).toBe('work_or_study');
    expect(output.result?.consumption?.scene?.continuity_relation).toBe('fresh_moment');
    expect(output.result?.consumption?.scene?.social_context).toBeUndefined();
    expect(output.result?.consumption?.scene?.appearance_change_expected).toBe(true);
    expect(output.result?.consumption?.scene?.appearance_change_reason).toBe('formal_outing');
    expect(output.result?.consumption?.scene?.location_props).toEqual(['desk']);
    expect(output.result?.consumption?.scene?.lighting_hint).toBe('soft daylight');
    expect(output.result?.consumption?.scene?.framing_hint).toBe('half-body, seated, near-table framing');
    expect(output.result?.consumption?.selfie_ready).toEqual({
      location: expect.any(String),
      activity: expect.any(String),
      emotion: expect.any(String),
      appearance: expect.any(String),
      time_of_day: expect.any(String),
      summary: expect.any(String),
    });
    expect(output.result?.consumption?.selfie_ready?.emotion).toContain('专注');
    expect(output.notes.join(' ')).toContain('Generated episode persisted');
  });

  it('prefers in-conversation social context when collector requests continuity', () => {
    const collector = makeCollector();
    collector.conversation_context.should_prefer_conversation_continuity_for_now = true;
    collector.persona_context.identity = 'Home city: Shanghai';

    const output = buildGeneratedOutput({
      traceId: 'trace-test-generated-conversation',
      window: {
        calendar_date: '2026-03-26',
        query_range: 'past_range',
        semantic_target: 'past_range',
        collection_scope: 'explicit_range',
        start: '2026-03-26T12:00:00+08:00',
        end: '2026-03-26T18:00:00+08:00',
        timezone: 'Asia/Shanghai',
      },
      collector,
      reasoned: {
        ...reasoned,
        decision: { action: 'generate_new_fact', should_write_canon: true },
        continuity: { judged: true, is_continuing: true, reason: 'conversation should carry' },
        generated_fact: {
          location: '书房',
          action: '继续整理笔记',
          emotionTags: ['专注'],
          appearance: '家居服',
          internalMonologue: '把结构梳理清楚',
          confidence: 0.77,
          sceneSemantics: {
            activityMode: 'work_or_study',
            continuityRelation: 'same_scene_continuation',
            rationale: 'conversation continuity',
          },
          appearanceLogic: {
            transition: 'inherit',
            changeReason: 'same_scene_continuation',
            outfitMode: 'casual_home',
          },
        },
      },
      resolutionMode: 'generated_new',
      generated: {
        parsed: { confidence: 0.77 },
        idempotencyKey: 'fp-2',
        notes: ['Generated with conversation continuity.'],
        episode: {
          episode_id: 'ep-2',
          schema_version: '1.0',
          document_type: 'timeline.episode',
          temporal: {
            start: '2026-03-26T15:30:00+08:00',
            end: '2026-03-26T15:30:00+08:00',
            time_of_day: 'afternoon',
            granularity: 'minute',
          },
          narrative: {
            summary: '继续整理笔记',
          },
          state_snapshot: {
            scene: {
              location_kind: 'indoor',
              location_label: '书房',
              activity: '继续整理笔记',
              time_of_day: 'afternoon',
            },
            emotion: {
              primary: '专注',
              secondary: null,
              intensity: 0.7,
            },
            appearance: {
              outfit_style: '家居服',
              grooming: null,
              posture_energy: null,
            },
          },
          world_hooks: {
            weekday: true,
            holiday_key: null,
          },
          provenance: {
            writer: 'stella-timeline-plugin',
            written_at: '2026-03-26T15:31:00+08:00',
            idempotency_key: 'fp-2',
            confidence: 0.77,
          },
        },
      },
      generatedCalendarDate: '2026-03-26',
      filePath: 'memory/2026-03-26.md',
      normalizedWriteResult: {
        success: true,
        written_at: '2026-03-26T15:31:00+08:00',
        outcome: 'appended',
      },
      sources: collector.source_order,
    });

    expect(output.result?.consumption?.scene?.social_context).toBe('in_conversation');
  });
});

