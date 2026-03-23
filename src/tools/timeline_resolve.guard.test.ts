import { resetTimelineResolveDependencies, setTimelineResolveDependencies, timelineResolve } from './timeline_resolve';

describe('timelineResolve canonical path guard', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
  });

  it('refuses generated writes to non-canonical paths', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Guard path run.'],
      memoryGet: async () => '',
      generateMemoryDraft: async () => ({
        location: '家里书房靠窗的桌子',
        action: '记录当前状态并准备写入时间线',
        emotionTags: ['专注', '平静'],
        appearance: '舒适的家居服，头发随意挽起',
        internalMonologue: '先验证写入路径，再决定是否落盘。',
        naturalText: '她正准备把当前状态写入时间线。',
        confidence: 0.72,
      }),
      memoryFilePath: () => 'notes/2026-03-22.md',
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.resolution_summary.mode).toBe('write_blocked');
    expect(result.resolution_summary.writes_succeeded).toBe(0);
    expect(result.notes.join(' ')).toContain('Canonical daily logs must live under a memory/ directory');
  });
});
