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
            summary: 'Normalized “昨晚八点” into 2026-03-21 20:00.',
          };
        }
        if (query.includes('最近')) {
          return {
            schema_version: '1.0',
            target_time_range: 'past_range',
            normalized_start: '2026-03-19T14:30:00+08:00',
            normalized_end: '2026-03-22T14:30:00+08:00',
            summary: 'Normalized “最近” into the past three days up to the current moment.',
          };
        }
        if (query.includes('上午')) {
          return {
            schema_version: '1.0',
            target_time_range: 'past_range',
            normalized_start: '2026-03-22T00:00:00+08:00',
            normalized_end: '2026-03-22T12:00:00+08:00',
            summary: 'Normalized “上午” into today from 00:00 to 12:00.',
          };
        }
        return {
          schema_version: '1.0',
          target_time_range: 'now',
          summary: 'Interpreted the request as a current-state query.',
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

  it('degrades to forgetfulness empty_window when no LLM is configured', async () => {
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

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected degraded forgetfulness envelope');
    expect(result.resolution_summary.mode).toBe('empty_window');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain('记不');
    expect(result.trace?.decision.error_code).toBe('REASONER_UNAVAILABLE');
    expect(result.trace?.notes).toHaveLength(2);
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

  it('keeps empty_window for allow_generate sleep-window gaps and uses reasoner-driven forgetfulness wording', async () => {
    const reasonTimeline = jest.fn(async (collector) => ({
      schema_version: '1.0' as const,
      request_id: collector.request_id,
      request_type: 'past_range' as const,
      decision: {
        action: 'return_empty' as const,
        should_write_canon: false,
      },
      continuity: {
        judged: true,
        is_continuing: false,
        reason: 'pre-dawn span is likely sleep and has no retrievable episode',
      },
      rationale: {
        summary: '这段睡眠窗口没有可复用事实，只能诚实地说明记不清细节。',
        hard_fact_basis: [],
        canon_basis: [],
        persona_basis: [],
        constraint_basis: ['avoid fabricating a specific awake scene in sleep window'],
      },
    }));

    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-23T06:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked what happened pre-dawn.'],
      planTimelineQuery: async () => ({
        schema_version: '1.0',
        target_time_range: 'past_range',
        normalized_start: '2026-03-23T02:00:00+08:00',
        normalized_end: '2026-03-23T04:00:00+08:00',
        summary: 'Normalized query into pre-dawn sleep window.',
      }),
      memoryGet: async () => '',
      reasonTimeline,
    });

    const result = await timelineResolve({
      query: '凌晨两点到四点你在做什么',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected empty-window success envelope');
    expect(result.resolution_summary.mode).toBe('empty_window');
    expect(result.notes.join(' ')).toContain('记不清');
    expect(reasonTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ recovery_hint: 'prefer_generation' }),
      }),
    );
  });

  it('appends forgetfulness reminder when allow_generate empty notes lack forgetfulness wording', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T23:00:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked about an empty breakfast window.'],
      planTimelineQuery: async () => ({
        schema_version: '1.0',
        target_time_range: 'past_range',
        normalized_start: '2026-03-22T06:00:00+08:00',
        normalized_end: '2026-03-22T09:00:00+08:00',
        summary: 'Normalized breakfast question into 06:00-09:00 range.',
      }),
      memoryGet: async () => '',
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'past_range',
        decision: {
          action: 'return_empty',
          should_write_canon: false,
        },
        continuity: {
          judged: true,
          is_continuing: false,
          reason: 'continuity cannot be established from available evidence',
        },
        rationale: {
          summary: 'details are not recoverable from available evidence in this window',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: [],
          constraint_basis: [],
        },
      }),
    });

    const result = await timelineResolve({
      query: '今天吃早饭了吗',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected empty-window success envelope');
    expect(result.resolution_summary.mode).toBe('empty_window');
    expect(result.notes.join(' ')).toContain('记不清');
    expect(result.notes.join(' ')).toContain('保持诚实表达');
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

  it('recovers from invalid selected_fact_id when candidate_facts are empty in allow_generate mode', async () => {
    const reasonTimeline = jest.fn(async (collector) => {
      if (collector.request.recovery_hint !== 'no_reuse_allowed') {
        return {
          schema_version: '1.0' as const,
          request_id: collector.request_id,
          request_type: 'past_range' as const,
          decision: {
            action: 'reuse_existing_fact' as const,
            selected_fact_id: 'canon:2099-01-01:0',
            should_write_canon: false,
          },
          continuity: {
            judged: true,
            is_continuing: false,
            reason: 'attempted reuse before checking candidate list',
          },
          rationale: {
            summary: 'Tried to reuse a canon fact.',
            hard_fact_basis: [],
            canon_basis: [],
            persona_basis: [],
            constraint_basis: [],
          },
        };
      }
      return {
        schema_version: '1.0' as const,
        request_id: collector.request_id,
        request_type: 'past_range' as const,
        decision: {
          action: 'return_empty' as const,
          should_write_canon: false,
        },
        continuity: {
          judged: true,
          is_continuing: false,
          reason: 'no candidate facts available for reuse and generation skipped',
        },
        rationale: {
          summary: 'No reusable canon facts were available for this window.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: [],
          constraint_basis: [],
        },
      };
    });

    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-26T23:59:59+08:00', timezone: 'Asia/Shanghai' }),
      planTimelineQuery: async () => ({
        schema_version: '1.0',
        target_time_range: 'past_range',
        normalized_start: '2026-03-26T12:00:00+08:00',
        normalized_end: '2026-03-26T18:00:00+08:00',
        summary: 'Normalized the query into an afternoon range.',
      }),
      sessionsHistory: async () => [],
      memoryGet: async () => '',
      memorySearch: async () => [],
      reasonTimeline,
    });

    const result = await timelineResolve({
      query: '今天下午除了跟你聊天之外的时间我在做什么',
      mode: 'allow_generate',
      trace: true,
    });

    expect(reasonTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ recovery_hint: 'no_reuse_allowed' }),
      }),
    );
    expect(reasonTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ recovery_hint: 'prefer_generation' }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected recovered empty-window success envelope');
    expect(result.resolution_summary.mode).toBe('empty_window');
  });

  describe('read_only_fast', () => {
    it('returns read_only_fast_hit when canon has an unexpired fact', async () => {
      setTimelineResolveDependencies({
        currentTime: async () => ({ now: '2026-03-22T15:00:00+08:00', timezone: 'Asia/Shanghai' }),
        sessionsHistory: async () => [],
        memoryGet: async () => `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
- Estimated_Duration: 120
        `,
      });

      const result = await timelineResolve({ query: 'now', mode: 'read_only_fast' });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.resolution_summary.mode).toBe('read_only_fast_hit');
      expect(result.result?.consumption?.fact.status).toBe('resolved');
      expect(result.result?.consumption?.scene?.location).toBe('家里书房靠窗的桌子');
      expect(result.result?.consumption?.scene?.estimated_duration_minutes).toBe(120);
    });

    it('returns empty_window when no canon exists for today', async () => {
      setTimelineResolveDependencies({
        currentTime: async () => ({ now: '2026-03-22T15:00:00+08:00', timezone: 'Asia/Shanghai' }),
        sessionsHistory: async () => [],
        memoryGet: async () => '',
      });

      const result = await timelineResolve({ query: 'now', mode: 'read_only_fast' });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.resolution_summary.mode).toBe('empty_window');
      expect(result.result?.consumption?.fact.status).toBe('empty');
      expect(result.result?.consumption?.scene?.estimated_duration_minutes).toBe(30);
    });

    it('returns empty_window when the latest fact is expired', async () => {
      setTimelineResolveDependencies({
        currentTime: async () => ({ now: '2026-03-22T18:00:00+08:00', timezone: 'Asia/Shanghai' }),
        sessionsHistory: async () => [],
        memoryGet: async () => `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 整理笔记
- Emotion_Tags: [专注]
- Appearance: 浅灰色的舒适家居服
- Estimated_Duration: 60
        `,
      });

      const result = await timelineResolve({ query: 'now', mode: 'read_only_fast' });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.resolution_summary.mode).toBe('empty_window');
      expect(result.result?.consumption?.scene?.estimated_duration_minutes).toBe(30);
    });

    it('uses defaultDurationForActivityMode when canon has no Estimated_Duration', async () => {
      setTimelineResolveDependencies({
        currentTime: async () => ({ now: '2026-03-22T15:00:00+08:00', timezone: 'Asia/Shanghai' }),
        sessionsHistory: async () => [],
        memoryGet: async () => `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 整理笔记
- Emotion_Tags: [专注]
- Appearance: 浅灰色的舒适家居服
        `,
      });

      const result = await timelineResolve({ query: 'now', mode: 'read_only_fast' });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected success');
      expect(result.resolution_summary.mode).toBe('read_only_fast_hit');
    });

    it('does not require a query for read_only_fast mode', async () => {
      setTimelineResolveDependencies({
        currentTime: async () => ({ now: '2026-03-22T15:00:00+08:00', timezone: 'Asia/Shanghai' }),
        sessionsHistory: async () => [],
        memoryGet: async () => '',
      });

      const result = await timelineResolve({ query: '', mode: 'read_only_fast' });
      expect(result.ok).toBe(true);
    });
  });
});
