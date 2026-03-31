import { classifyWriteFailure, executeGeneratedWrite } from './execute_write';

describe('executeGeneratedWrite', () => {
  it('threads parentEvent fields from sceneSemantics to writeEpisode', async () => {
    const capturedInput: Record<string, unknown>[] = [];
    const result = await executeGeneratedWrite({
      window: {
        query_range: 'now',
        semantic_target: 'now',
        collection_scope: 'today_so_far',
        start: '2026-03-31T08:00:00+08:00',
        end: '2026-03-31T14:30:00+08:00',
        calendar_date: '2026-03-31',
        calendar_dates: ['2026-03-31'],
        timezone: 'Asia/Shanghai',
        normalization_notes: [],
      },
      sources: {
        sourceOrder: ['memory_get'],
        sessionsHistory: [],
        dailyLogs: [],
        memorySearch: [],
        personaContext: {
          contract: { schema_version: '1.0', identity: { name: '', home_city: '' }, soul: { archetype: '', values: [], communication_style: '' }, rhythm: {}, scene: {} } as any,
          available_sources: [],
          should_constrain_generation: false,
        },
        conversationContext: {
          is_recently_active: false,
          minutes_since_last_turn: null,
          stickiness_window_minutes: 10,
          active_topic_summary: '',
          should_prefer_conversation_continuity_for_now: false,
        },
      },
      collector: {} as any,
      generatedFact: {
        location: '高铁上',
        action: '坐高铁前往大理',
        emotionTags: ['期待'],
        appearance: '休闲外套',
        internalMonologue: '离大理越来越近了',
        confidence: 0.8,
        sceneSemantics: {
          activityMode: 'commute',
          continuityRelation: 'same_day_continuation',
          rationale: 'refined phase of moving event',
          estimatedDurationMinutes: 90,
          parentEventTag: 'moving-to-dali-20260331',
          parentEventPhase: 'in-transit',
          parentEventProgress: 0.5,
        },
      },
      generationReason: 'macro event refinement',
      deps: {
        memoryFilePath: () => 'memory/2026-03-31.md',
        writeEpisode: async (input) => {
          capturedInput.push(input);
          return { success: true, written_at: '2026-03-31T14:30:00+08:00', outcome: 'appended' as const };
        },
      },
      calendarDateFromTimestamp: () => '2026-03-31',
    });

    expect(result.normalizedWriteResult.success).toBe(true);
    expect(capturedInput).toHaveLength(1);
    expect(capturedInput[0].parentEventTag).toBe('moving-to-dali-20260331');
    expect(capturedInput[0].parentEventPhase).toBe('in-transit');
    expect(capturedInput[0].parentEventProgress).toBe(0.5);
    expect(capturedInput[0].estimatedDurationMinutes).toBe(90);
  });

  it('passes undefined parentEvent fields when sceneSemantics has none', async () => {
    const capturedInput: Record<string, unknown>[] = [];
    await executeGeneratedWrite({
      window: {
        query_range: 'now',
        semantic_target: 'now',
        collection_scope: 'today_so_far',
        start: '2026-03-31T08:00:00+08:00',
        end: '2026-03-31T14:30:00+08:00',
        calendar_date: '2026-03-31',
        calendar_dates: ['2026-03-31'],
        timezone: 'Asia/Shanghai',
        normalization_notes: [],
      },
      sources: {
        sourceOrder: ['memory_get'],
        sessionsHistory: [],
        dailyLogs: [],
        memorySearch: [],
        personaContext: {
          contract: { schema_version: '1.0', identity: { name: '', home_city: '' }, soul: { archetype: '', values: [], communication_style: '' }, rhythm: {}, scene: {} } as any,
          available_sources: [],
          should_constrain_generation: false,
        },
        conversationContext: {
          is_recently_active: false,
          minutes_since_last_turn: null,
          stickiness_window_minutes: 10,
          active_topic_summary: '',
          should_prefer_conversation_continuity_for_now: false,
        },
      },
      collector: {} as any,
      generatedFact: {
        location: '书房',
        action: '整理笔记',
        emotionTags: ['专注'],
        appearance: '家居服',
        internalMonologue: '把结构梳理清楚',
        confidence: 0.77,
        sceneSemantics: {
          activityMode: 'work_or_study',
          continuityRelation: 'fresh_moment',
          rationale: 'normal scene, no parent event',
        },
      },
      generationReason: 'normal generation',
      deps: {
        memoryFilePath: () => 'memory/2026-03-31.md',
        writeEpisode: async (input) => {
          capturedInput.push(input);
          return { success: true, written_at: '2026-03-31T14:30:00+08:00', outcome: 'appended' as const };
        },
      },
      calendarDateFromTimestamp: () => '2026-03-31',
    });

    expect(capturedInput).toHaveLength(1);
    expect(capturedInput[0].parentEventTag).toBeUndefined();
    expect(capturedInput[0].parentEventPhase).toBeUndefined();
    expect(capturedInput[0].parentEventProgress).toBeUndefined();
  });
});

describe('classifyWriteFailure', () => {
  it('maps conflict write error', () => {
    const result = classifyWriteFailure({
      success: false,
      written_at: '',
      outcome: 'conflict',
      error_code: 'CONFLICT_EXISTS',
      error: 'conflict',
    });
    expect(result.mode).toBe('write_conflict');
    expect(result.errorCode).toBe('WRITE_CONFLICT');
    expect(result.guard).toBe('conflict');
  });

  it('maps canonical path error to blocked', () => {
    const result = classifyWriteFailure({
      success: false,
      written_at: '',
      outcome: 'failed',
      error: 'Canonical daily logs must live under memory/',
    });
    expect(result.mode).toBe('write_blocked');
    expect(result.errorCode).toBe('WRITE_BLOCKED');
    expect(result.guard).toBe('canonical_path');
  });

  it('maps unclassified write failures to write_dependency guard', () => {
    const result = classifyWriteFailure({
      success: false,
      written_at: '',
      outcome: 'failed',
      error: 'disk full',
    });
    expect(result.mode).toBe('write_failed');
    expect(result.errorCode).toBe('WRITE_FAILED');
    expect(result.guard).toBe('write_dependency');
  });
});

