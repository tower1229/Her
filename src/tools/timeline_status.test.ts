import * as fs from 'fs';
import * as path from 'path';
import { resetTimelineRuntimeStatus } from '../storage/runtime_status';
import { timelineStatus } from './timeline_status';
import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
  timelineResolve,
} from './timeline_resolve';

describe('timelineStatus', () => {
  const tmpDir = path.join(__dirname, '__status_tmp__');
  const tmpFile = path.join(tmpDir, 'memory', '2026-03-22.md');

  beforeEach(() => {
    resetTimelineResolveDependencies();
    resetTimelineRuntimeStatus();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports plugin registration and empty runtime state before any run', async () => {
    const result = await timelineStatus();

    expect(result.ok).toBe(true);
    expect(result.registration.tools).toEqual(['timeline_resolve', 'timeline_status', 'timeline_repair']);
    expect(result.runtime.last_run).toBeNull();
  });

  it('reports the last timeline run snapshot after timelineResolve executes', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked what are you doing right now?'],
      memoryGet: async () => '',
      memoryFilePath: () => tmpFile,
    });

    const resolveResult = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
      trace: true,
    });
    const statusResult = await timelineStatus();

    expect(statusResult.runtime.last_run?.trace_id).toBe(resolveResult.trace_id);
    expect(statusResult.runtime.last_run?.resolution_mode).toBe('generated_new');
    expect(statusResult.runtime.last_run?.writes_attempted).toBe(1);
    expect(statusResult.runtime.last_run?.trace_persisted).toBe(true);
  });
});
