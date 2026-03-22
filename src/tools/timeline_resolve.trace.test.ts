import { resetTimelineResolveDependencies, setTimelineResolveDependencies, timelineResolve } from './timeline_resolve';

describe('timelineResolve trace schema', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
  });

  it('returns a richer trace for read-only hits', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Read-only trace run.'],
      memoryGet: async () => `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
      `,
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'read_only',
      reason: 'current_status',
      trace: true,
    });

    expect(result.trace?.source_order).toEqual(['sessions_history', 'memory_get']);
    expect(result.trace?.fingerprint.checked).toBe(true);
    expect(result.trace?.fingerprint.matched).toBe(true);
    expect(result.trace?.write.attempted).toBe(false);
    expect(result.trace?.source_summary.sessions_history_count).toBe(1);
  });

  it('returns write and appearance details for generated entries', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Generated trace run.'],
      memoryGet: async () => '',
      memoryFilePath: () => 'memory/2026-03-22.md',
      writeEpisode: async () => ({ success: true, written_at: '2026-03-22T14:30:01+08:00' }),
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
      trace: true,
    });

    expect(result.trace?.write.attempted).toBe(true);
    expect(result.trace?.write.succeeded).toBe(true);
    expect(result.trace?.write.file_path).toBe('memory/2026-03-22.md');
    expect(result.trace?.appearance.reason).toBeTruthy();
    expect(result.trace?.fingerprint.matched).toBe(false);
  });
});
