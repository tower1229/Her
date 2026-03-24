import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
  timelineResolve,
} from './timeline_resolve';

describe('timelineResolve', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
    setTimelineResolveDependencies({
      planTimelineQuery: async (input) => {
        const query = String(input.query || '');
        if (query.includes('昨晚八点')) {
          return {
            schema_version: '1.0',
            target_time_range: 'past_point',
            normalized_point: '2026-03-21T20:00:00+08:00',
            summary: '将“昨晚八点”归一化为 2026-03-21 20:00。',
          };
        }
        if (query.includes('最近')) {
          return {
            schema_version: '1.0',
            target_time_range: 'past_range',
            normalized_start: '2026-03-19T14:30:00+08:00',
            normalized_end: '2026-03-22T14:30:00+08:00',
            summary: '将“最近”归一化为过去三天到当前时刻。',
          };
        }
        if (query.includes('上午')) {
          return {
            schema_version: '1.0',
            target_time_range: 'past_range',
            normalized_start: '2026-03-22T00:00:00+08:00',
            normalized_end: '2026-03-22T12:00:00+08:00',
            summary: '将“上午”归一化为当天 00:00 到 12:00。',
          };
        }
        return {
          schema_version: '1.0',
          target_time_range: 'now',
          summary: '将请求解释为当前状态查询。',
        };
      },
    });
  });

  it('returns a structured read-only hit from parsed memory content', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked what are you doing right now?'],
      memoryGet: async () => `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
- Internal_Monologue: 今天下午的思绪特别清晰，整理完心情也变好了。

下午花了一整段时间重新梳理知识库。
      `,
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        time_interpretation: {
          normalized_kind: 'now',
          match_strategy: 'continuation',
          summary: 'The user is asking about the current moment, so the request was normalized to now.',
        },
        decision: {
          action: 'reuse_existing_fact',
          selected_fact_id: 'canon:2026-03-22:0',
          should_write_canon: false,
        },
        continuity: {
          judged: true,
          is_continuing: true,
          reason: 'existing canon still covers the current moment',
        },
        rationale: {
          summary: 'Reused the existing canon fact for the current state.',
          hard_fact_basis: [],
          canon_basis: ['canon:2026-03-22:0'],
          persona_basis: [],
          constraint_basis: [],
        },
      }),
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'read_only',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected successful timeline resolve');
    expect(result.trace_id).toContain('timeline-');
    expect(result.resolution_summary.mode).toBe('read_only_hit');
    expect(result.resolution_summary.sources).toEqual(['sessions_history', 'memory_get', 'memory_search']);
    expect(result.result?.window.calendar_date).toBe('2026-03-22');
    expect(result.result?.episodes).toHaveLength(1);
    expect(result.notes.join(' ')).toContain('Time interpretation: The user is asking about the current moment');
    expect(result.result?.consumption?.fact.source_type).toBe('canon');
    expect(result.result?.consumption?.scene?.location).toContain('书房');
    expect(result.result?.consumption?.selfie_ready?.activity).toContain('整理');
  });

  it('returns a contract error for past_range requests without query or explicit range', async () => {
    const result = await timelineResolve({ mode: 'read_only', trace: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected contract error');
    expect(result.error.code).toBe('INVALID_INPUT');
    expect(result.error.message).toContain('requires query');
    expect(result.trace_id).toContain('timeline-');
  });

  it('omits the trace payload when trace=false', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked what are you doing right now?'],
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
          is_continuing: false,
          reason: 'no existing canon fact covered the current moment',
        },
        rationale: {
          summary: 'Generated a new current-state fact for the current moment.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: ['persona-context'],
          constraint_basis: ['stay aligned with loaded persona context'],
        },
        generated_fact: {
          location: '家里书房靠窗的桌子',
          action: '整理下午的工作内容',
          emotionTags: ['专注', '平静'],
          appearance: '舒适的家居服，头发随意挽起',
          internalMonologue: '先把眼前的工作整理完再说。',
          confidence: 0.74,
          reason: 'persona-consistent current-state synthesis',
          sceneSemantics: {
            activityMode: 'work_or_study',
            continuityRelation: 'same_day_continuation',
            rationale: 'the generated scene continues a same-day home working rhythm',
          },
          appearanceLogic: {
            transition: 'inherit',
            changeReason: 'same_day_continuation',
            outfitMode: 'casual_home',
          },
        },
      }),
      writeEpisode: async () => ({ success: true, written_at: '2026-03-22T14:30:01+08:00' }),
      memoryFilePath: () => 'memory/2026-03-22.md',
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: false,
    });

    expect(result.ok).toBe(true);
    expect(result.trace).toBeUndefined();
    expect(result.trace_id).toContain('timeline-');
  });

  it('returns an explicit generation_unavailable error when generation is allowed but no LLM is configured', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked what are you doing right now?'],
      memoryGet: async () => '',
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected generation-unavailable contract error');
    expect(result.error.code).toBe('REASONER_UNAVAILABLE');
  });

  it('returns an explicit empty_window contract when read-only canon is blank', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked for a timeline snapshot.'],
      memoryGet: async () => '',
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        decision: {
          action: 'return_empty',
          should_write_canon: false,
        },
        continuity: {
          judged: true,
          reason: 'no fact matched the requested current moment',
        },
        rationale: {
          summary: 'No existing fact matched the requested window.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: [],
          constraint_basis: [],
        },
      }),
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'read_only',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected empty-window success envelope');
    expect(result.resolution_summary.mode).toBe('empty_window');
    expect(result.result?.episodes).toEqual([]);
  });

  it('returns empty_window when the only parsed canon entry is stale for the current moment', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked what are you doing right now?'],
      memoryGet: async () => `
### [09:00:00] 早餐
- Timestamp: 2026-03-22 09:00:00
- Location: 家里餐桌
- Action: 慢慢吃早餐
- Emotion_Tags: [平静, 清醒]
- Appearance: 居家服
      `,
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        decision: {
          action: 'return_empty',
          should_write_canon: false,
        },
        continuity: {
          judged: true,
          is_continuing: false,
          reason: 'the breakfast fact no longer covers the current moment',
        },
        rationale: {
          summary: 'The only canon fact is stale for the current moment.',
          hard_fact_basis: [],
          canon_basis: ['canon:2026-03-22:0'],
          persona_basis: [],
          constraint_basis: [],
        },
      }),
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'read_only',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected empty-window success envelope');
    expect(result.resolution_summary.mode).toBe('empty_window');
  });

  it('selects a query-matching parsed episode instead of blindly reusing the latest one', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked about the morning gym visit.'],
      memoryGet: async () => `
### [09:00:00] 健身
- Timestamp: 2026-03-22 09:00:00
- Location: 小区健身房
- Action: 上午去健身房练腿
- Emotion_Tags: [投入, 累]
- Appearance: 运动装

### [11:30:00] 咖啡
- Timestamp: 2026-03-22 11:30:00
- Location: 街角咖啡馆
- Action: 在咖啡馆慢慢坐着发呆
- Emotion_Tags: [放松, 平静]
- Appearance: 休闲外套
      `,
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'past_range',
        decision: {
          action: 'reuse_existing_fact',
          selected_fact_id: 'canon:2026-03-22:0',
          should_write_canon: false,
        },
        continuity: {
          judged: true,
          reason: 'the morning gym fact best matches the query semantics',
        },
        rationale: {
          summary: 'Selected the morning gym fact as the best semantic match.',
          hard_fact_basis: [],
          canon_basis: ['canon:2026-03-22:0'],
          persona_basis: [],
          constraint_basis: [],
        },
      }),
    });

    const result = await timelineResolve({
      query: '你上午不是在健身吗',
      mode: 'read_only',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected query-matched read-only hit');
    expect(result.resolution_summary.mode).toBe('read_only_hit');
    const episode: any = result.result?.episodes[0];
    expect(String(episode?.state_snapshot?.scene?.activity || '')).toContain('健身房');
  });
});
