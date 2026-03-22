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
      writeEpisode: async () => ({ success: true, written_at: '2026-03-22T14:30:01+08:00' }),
      memoryFilePath: () => 'memory/2026-03-22.md',
    });

    const result = await runPreCompactionFlush();
    expect(result.ok).toBe(true);
    expect(result.resolution_summary.mode).toBe('generated_new');
    expect(result.resolution_summary.writes_succeeded).toBe(1);
  });
});
