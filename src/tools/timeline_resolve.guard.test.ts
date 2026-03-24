import { resetTimelineResolveDependencies, setTimelineResolveDependencies, timelineResolve } from './timeline_resolve';

describe('timelineResolve canonical path guard', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
    setTimelineResolveDependencies({
      planTimelineQuery: async () => ({
        schema_version: '1.0',
        target_time_range: 'now',
        summary: '将请求解释为当前状态查询。',
      }),
    });
  });

  it('refuses generated writes to non-canonical paths', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Guard path run.'],
      memoryGet: async () => '',
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        decision: {
          action: 'generate_new_fact',
          should_write_canon: true,
        },
        continuity: {
          judged: true,
          reason: 'generation is required for the current state',
        },
        rationale: {
          summary: 'Generated a current-state fact before path validation.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: ['current home-working persona'],
          constraint_basis: ['keep generated state aligned with persona continuity'],
        },
        generated_fact: {
          location: '家里书房靠窗的桌子',
          action: '记录当前状态并准备写入时间线',
          emotionTags: ['专注', '平静'],
          appearance: '舒适的家居服，头发随意挽起',
          internalMonologue: '先验证写入路径，再决定是否落盘。',
          confidence: 0.72,
          reason: 'persona-consistent pre-write generation',
          sceneSemantics: {
            activityMode: 'work_or_study',
            continuityRelation: 'same_day_continuation',
            rationale: 'the generated scene continues a same-day desk session',
          },
          appearanceLogic: {
            transition: 'inherit',
            changeReason: 'same_day_continuation',
            outfitMode: 'casual_home',
          },
        },
      }),
      memoryFilePath: () => 'notes/2026-03-22.md',
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.resolution_summary.mode).toBe('write_blocked');
    expect(result.resolution_summary.writes_succeeded).toBe(0);
    expect(result.notes.join(' ')).toContain('Canonical daily logs must live under a memory/ directory');
  });
});
