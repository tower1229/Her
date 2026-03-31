import { timelineTransition, TimelineTransitionDependencies } from './timeline_transition';

function makeBaseDeps(overrides?: Partial<TimelineTransitionDependencies>): TimelineTransitionDependencies {
  return {
    currentTime: async () => ({ now: '2026-03-24T10:00:00+08:00', timezone: 'Asia/Shanghai' }),
    personaContext: async () => ({ contract: {}, available_sources: [], should_constrain_generation: false } as any),
    sessionsHistory: async () => [],
    memoryGet: async () => '',
    writeEpisode: async () => ({ success: true, written_at: '2026-03-24T10:00:01+08:00', idempotency_key: 'foo', outcome: 'appended' }),
    memoryFilePath: () => 'memory/2026-03-24.md',
    planTransition: async () => ({
      summary: 'Take a shower',
      estimated_duration_minutes: 30,
      started_at: '2026-03-24T10:00:00+08:00',
      interruption_handling: 'interrupt' as const,
      requires_persona_update: false,
      initial_phase: {
        location: '家里的浴室',
        action: '洗澡',
        emotionTags: ['清爽'],
        appearance: '裸着',
        internalMonologue: '水温正好',
      },
    }),
    ...overrides,
  };
}

describe('timelineTransition', () => {
  it('executes an interrupt transition and writes canon', async () => {
    const deps = makeBaseDeps();
    const result = await timelineTransition({ directive: '去洗澡' }, deps);

    expect(result.ok).toBe(true);
    expect(result.transition?.summary).toBe('Take a shower');
    expect(result.transition?.estimated_duration_minutes).toBe(30);
    expect(result.canon_write?.success).toBe(true);
    expect(result.notes).toContain('Event interrupt execution recorded.');
  });

  it('rejects the transition if the planner returns reject', async () => {
    const deps = makeBaseDeps({
      planTransition: async () => ({
        summary: 'Cannot take a shower',
        estimated_duration_minutes: 0,
        started_at: '2026-03-24T10:00:00+08:00',
        interruption_handling: 'reject' as const,
        reject_reason: 'You are currently shopping in a mall.',
        requires_persona_update: false,
        initial_phase: { location: '', action: '', emotionTags: [], appearance: '', internalMonologue: '' },
      }),
    });

    const result = await timelineTransition({ directive: '去洗澡' }, deps);

    expect(result.ok).toBe(false);
    expect(result.notes[0]).toContain('rejected');
    expect(result.notes[0]).toContain('You are currently shopping in a mall.');
    expect(result.transition).toBeUndefined();
    expect(result.canon_write).toBeUndefined();
  });

  it('writes a micro-task with parent event tracking', async () => {
    const deps = makeBaseDeps({
      planTransition: async () => ({
        summary: 'Try street food',
        estimated_duration_minutes: 10,
        started_at: '2026-03-24T15:30:00+08:00',
        interruption_handling: 'insert_micro_task' as const,
        requires_persona_update: false,
        initial_phase: {
          location: '街边小摊',
          action: '尝尝烤串',
          emotionTags: ['开心', '好奇'],
          appearance: '休闲装搭配运动鞋',
          internalMonologue: '闻起来好香，先来一串试试',
        },
      }),
    });

    const writeEpisodeSpy = jest.fn(async () => ({
      success: true as const,
      written_at: '2026-03-24T15:30:01+08:00',
      idempotency_key: 'bar',
      outcome: 'appended' as const,
    }));
    deps.writeEpisode = writeEpisodeSpy;

    const result = await timelineTransition({ directive: '去尝尝路边烤串' }, deps);

    expect(result.ok).toBe(true);
    expect(result.notes).toContain('Event transition execution recorded.');
  });

  it('returns error when directive is empty', async () => {
    const deps = makeBaseDeps();
    const result = await timelineTransition({ directive: '' }, deps);

    expect(result.ok).toBe(false);
    expect(result.notes[0]).toContain('requires a directive');
  });

  it('returns error when planTransition dependency is missing', async () => {
    const deps = makeBaseDeps({ planTransition: undefined });
    const result = await timelineTransition({ directive: '去洗澡' }, deps);

    expect(result.ok).toBe(false);
    expect(result.notes[0]).toContain('planner dependency missing');
  });

  it('sets requires_persona_update when plan indicates a life change', async () => {
    const deps = makeBaseDeps({
      planTransition: async () => ({
        summary: 'Move to Dali',
        estimated_duration_minutes: 2880,
        started_at: '2026-03-24T08:00:00+08:00',
        interruption_handling: 'interrupt' as const,
        requires_persona_update: true,
        persona_update_data: { new_city: 'Dali' },
        initial_phase: {
          location: '高铁站',
          action: '带着行李出发前往大理',
          emotionTags: ['期待', '忐忑'],
          appearance: '休闲旅行装',
          internalMonologue: '新生活要开始了',
        },
      }),
    });

    const result = await timelineTransition({ directive: '搬去大理' }, deps);

    expect(result.ok).toBe(true);
    expect(result.transition?.requires_persona_update).toBe(true);
    expect(result.transition?.persona_update_data).toEqual({ new_city: 'Dali' });
  });
});
