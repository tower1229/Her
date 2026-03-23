import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
} from '../tools/timeline_resolve';
import { runPreCompactionFlush } from './pre_compaction_flush';

describe('runPreCompactionFlush', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
  });

  it('routes through timelineResolve using compaction_flush semantics', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Compaction boundary reached.'],
      memoryGet: async () => '',
      generateMemoryDraft: async () => ({
        location: '家里书房靠窗的桌子',
        action: '在压缩前补记当前稳定状态',
        emotionTags: ['平静', '专注'],
        appearance: '舒适的家居服，头发随意挽起',
        internalMonologue: '在上下文被压缩前，先把当前状态固化。',
        naturalText: '她在压缩前补记了当前的稳定状态。',
        confidence: 0.77,
      }),
      writeEpisode: async () => ({ success: true, written_at: '2026-03-22T14:30:01+08:00' }),
      memoryFilePath: () => 'memory/2026-03-22.md',
    });

    const result = await runPreCompactionFlush();
    expect(result.ok).toBe(true);
    expect(result.resolution_summary.mode).toBe('generated_new');
    expect(result.resolution_summary.writes_succeeded).toBe(1);
  });
});
