import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
  timelineResolve,
} from './timeline_resolve';

describe('timelineResolve', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
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
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'read_only',
      reason: 'current_status',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.trace_id).toContain('timeline-');
    expect(result.resolution_summary.mode).toBe('read_only_hit');
    expect(result.resolution_summary.sources).toEqual(['sessions_history', 'memory_get']);
    expect(result.result?.window.calendar_date).toBe('2026-03-22');
    expect(result.result?.episodes).toHaveLength(1);
  });
});
