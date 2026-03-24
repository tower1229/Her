import { buildTimelineCollectorOutput } from './collect_timeline_request';
import { ResolvedWindow } from './resolve_window';

describe('buildTimelineCollectorOutput', () => {
  it('collects candidate facts across multiple daily logs in the same window', () => {
    const window: ResolvedWindow = {
      legacy_preset: 'recent_3d',
      semantic_target: 'recent_recall',
      collection_scope: 'recent_3d',
      start: '2026-03-20T00:00:00+08:00',
      end: '2026-03-22T21:00:00+08:00',
      calendar_date: '2026-03-22',
      timezone: 'Asia/Shanghai',
    };

    const collector = buildTimelineCollectorOutput(
      'req-1',
      {
        target_time_range: 'recent_3d',
        mode: 'allow_generate',
        reason: 'past_recall',
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
        coreContext: {
          soul: '热爱运动，也喜欢和朋友聚会。',
          memory: '',
          identity: '',
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
  });
});
