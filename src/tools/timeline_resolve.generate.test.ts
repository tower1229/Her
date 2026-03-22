import * as fs from 'fs';
import * as path from 'path';
import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
  timelineResolve,
} from './timeline_resolve';

const tmpDir = path.join(__dirname, '__tmp__');
const tmpFile = path.join(tmpDir, 'memory', '2026-03-22.md');

beforeEach(() => {
  resetTimelineResolveDependencies();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('timelineResolve generation path', () => {
  it('generates and persists a conservative candidate when no memory entry exists', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User just asked what are you doing right now?'],
      memoryGet: async () => '',
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.resolution_summary.mode).toBe('generated_new');
    expect(result.resolution_summary.writes_attempted).toBe(1);
    expect(result.resolution_summary.writes_succeeded).toBe(1);
    expect(result.result?.episodes).toHaveLength(1);
    expect(fs.existsSync(tmpFile)).toBe(true);

    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).toContain('- Timestamp: 2026-03-22 14:30:00');
    expect(content).toContain('- Emotion_Tags: [calm]');
  });
});
