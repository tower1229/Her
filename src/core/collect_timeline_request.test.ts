import { emptyPersonaContract } from '../persona/persona_contract';
import { buildTimelineCollectorOutput } from './collect_timeline_request';
import { ResolvedWindow } from './resolve_window';

describe('buildTimelineCollectorOutput', () => {
  it('collects candidate facts across multiple daily logs in the same window', () => {
    const window: ResolvedWindow = {
      query_range: 'past_range',
      semantic_target: 'past_range',
      collection_scope: 'explicit_range',
      start: '2026-03-20T00:00:00+08:00',
      end: '2026-03-22T21:00:00+08:00',
      calendar_date: '2026-03-22',
      calendar_dates: ['2026-03-20', '2026-03-21', '2026-03-22'],
      timezone: 'Asia/Shanghai',
      normalization_notes: ['Upstream already normalized the query into a structured time range.'],
    };

    const collector = buildTimelineCollectorOutput(
      'req-1',
      {
        query: '最近有什么有趣的事吗',
        mode: 'allow_generate',
      },
      window,
      {
        sourceOrder: ['sessions_history', 'memory_get', 'memory_search'],
        sessionsHistory: ['user: 最近有什么有趣的事吗'],
        dailyLogs: [
          {
            calendar_date: '2026-03-21',
            raw_content: `### [Episode]\n- Timestamp: 2026-03-21T11:00:00+08:00\n- Location: 城市公园篮球场\n- Action: 和朋友打球\n- Emotion_Tags: [兴奋, 投入]\n- Appearance: 运动背心和短裤\n- Internal_Monologue: 这场球打得很爽。\n她上午去了公园打球。`,
          },
          {
            calendar_date: '2026-03-22',
            raw_content: `### [Episode]\n- Timestamp: 2026-03-22T18:30:00+08:00\n- Location: 小区附近的烧烤店\n- Action: 和朋友边吃边聊今天的比赛\n- Emotion_Tags: [放松, 开心]\n- Appearance: 运动后换上的宽松卫衣\n- Internal_Monologue: 今天这顿很值。\n她傍晚在烧烤店和朋友复盘白天的比赛。`,
          },
        ],
        memorySearch: ['memory/2026-03-21.md#L1-L7'],
        personaContext: {
          contract: {
            ...emptyPersonaContract(),
            soul: {
              ...emptyPersonaContract().soul,
              values: ['sports', 'friends'],
            },
          },
          available_sources: ['legacy_soul'],
          should_constrain_generation: true,
        },
        conversationContext: {
          is_recently_active: false,
          minutes_since_last_turn: null,
          stickiness_window_minutes: 10,
          active_topic_summary: '',
          should_prefer_conversation_continuity_for_now: false,
        },
      },
    );

    expect(collector.canon_memory.daily_logs).toHaveLength(2);
    expect(collector.candidate_facts.map((fact) => fact.fact_id)).toEqual([
      'canon:2026-03-21:0',
      'canon:2026-03-22:0',
    ]);
    expect(collector.candidate_facts.map((fact) => fact.calendar_date)).toEqual([
      '2026-03-21',
      '2026-03-22',
    ]);
    expect(collector.request.user_query).toBe('最近有什么有趣的事吗');
    expect(collector.request.mode).toBe('allow_generate');
    expect(collector.conversation_context.should_prefer_conversation_continuity_for_now).toBe(false);
    expect(collector.world_context.target).toBeNull();
    expect(collector.world_context.range_calendar.map((slot) => slot.calendar_date)).toEqual([
      '2026-03-20',
      '2026-03-21',
    ]);
  });

  it('precomputes elapsed_minutes and is_within_duration_window on candidate facts', () => {
    const window: ResolvedWindow = {
      query_range: 'now',
      semantic_target: 'now',
      collection_scope: 'today_so_far',
      start: '2026-03-31T00:00:00+08:00',
      end: '2026-03-31T15:00:00+08:00',
      calendar_date: '2026-03-31',
      calendar_dates: ['2026-03-31'],
      timezone: 'Asia/Shanghai',
      normalization_notes: [],
    };

    const collector = buildTimelineCollectorOutput(
      'req-precompute',
      { query: 'now', mode: 'allow_generate' },
      window,
      {
        sourceOrder: ['memory_get'],
        sessionsHistory: [],
        dailyLogs: [
          {
            calendar_date: '2026-03-31',
            raw_content: `### [14:00:00]\n- Timestamp: 2026-03-31T14:00:00+08:00\n- Location: 书房\n- Action: 整理笔记\n- Emotion_Tags: [专注]\n- Appearance: 家居服\n- Estimated_Duration: 120\n`,
          },
        ],
        memorySearch: [],
        personaContext: {
          contract: emptyPersonaContract(),
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
    );

    expect(collector.candidate_facts).toHaveLength(1);
    const fact = collector.candidate_facts[0];
    expect(fact.elapsed_minutes).toBe(60);
    expect(fact.estimated_duration_minutes).toBe(120);
    expect(fact.is_within_duration_window).toBe(true);
    expect(fact.event_id).toBeUndefined();
    expect(fact.has_parent_event).toBe(false);
    expect(fact.parent_event_tag).toBeUndefined();
  });

  it('uses default duration when episode has no Estimated_Duration', () => {
    const window: ResolvedWindow = {
      query_range: 'now',
      semantic_target: 'now',
      collection_scope: 'today_so_far',
      start: '2026-03-31T00:00:00+08:00',
      end: '2026-03-31T10:30:00+08:00',
      calendar_date: '2026-03-31',
      calendar_dates: ['2026-03-31'],
      timezone: 'Asia/Shanghai',
      normalization_notes: [],
    };

    const collector = buildTimelineCollectorOutput(
      'req-default-dur',
      { query: 'now', mode: 'allow_generate' },
      window,
      {
        sourceOrder: ['memory_get'],
        sessionsHistory: [],
        dailyLogs: [
          {
            calendar_date: '2026-03-31',
            raw_content: `### [09:00:00]\n- Timestamp: 2026-03-31T09:00:00+08:00\n- Location: 书房\n- Action: 看书\n- Emotion_Tags: [平静]\n- Appearance: 睡衣\n`,
          },
        ],
        memorySearch: [],
        personaContext: {
          contract: emptyPersonaContract(),
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
    );

    const fact = collector.candidate_facts[0];
    expect(fact.estimated_duration_minutes).toBe(60);
    expect(fact.elapsed_minutes).toBe(90);
    expect(fact.is_within_duration_window).toBe(false);
  });

  it('populates parent event fields on candidate facts when present in canon', () => {
    const window: ResolvedWindow = {
      query_range: 'now',
      semantic_target: 'now',
      collection_scope: 'today_so_far',
      start: '2026-03-31T00:00:00+08:00',
      end: '2026-03-31T15:00:00+08:00',
      calendar_date: '2026-03-31',
      calendar_dates: ['2026-03-31'],
      timezone: 'Asia/Shanghai',
      normalization_notes: [],
    };

    const collector = buildTimelineCollectorOutput(
      'req-parent-event',
      { query: 'now', mode: 'allow_generate' },
      window,
      {
        sourceOrder: ['memory_get'],
        sessionsHistory: [],
        dailyLogs: [
          {
            calendar_date: '2026-03-31',
            raw_content: `### [14:00:00]\n- Timestamp: 2026-03-31T14:00:00+08:00\n- Location: 高铁上\n- Action: 坐高铁前往大理\n- Emotion_Tags: [期待]\n- Appearance: 休闲外套\n- Estimated_Duration: 90\n- Event_Id: evt-20260331-140000\n- Parent_Event: evt-20260331-080000\n- Parent_Event_Phase: in-transit\n- Parent_Event_Progress: 0.5\n`,
          },
        ],
        memorySearch: [],
        personaContext: {
          contract: emptyPersonaContract(),
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
    );

    const fact = collector.candidate_facts[0];
    expect(fact.event_id).toBe('evt-20260331-140000');
    expect(fact.has_parent_event).toBe(true);
    expect(fact.parent_event_tag).toBe('evt-20260331-080000');
    expect(fact.parent_event_phase).toBe('in-transit');
    expect(fact.parent_event_progress).toBe(0.5);
    expect(fact.estimated_duration_minutes).toBe(90);
    expect(fact.is_within_duration_window).toBe(true);
  });
});
