import * as fs from 'fs';
import * as path from 'path';
import { runAuditTrace } from './audit_trace';
import { runSessionSnapshot } from './session_snapshot';
import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
  TimelineResolveOutput,
} from '../tools/timeline_resolve';

const tmpDir = path.join(__dirname, '__tmp__');
const auditLog = path.join(tmpDir, 'audit.log');
const snapshotLog = path.join(tmpDir, 'snapshot.log');

describe('timeline hook trace logging', () => {
  beforeEach(() => {
    resetTimelineResolveDependencies();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes audit trace records', () => {
    const result: TimelineResolveOutput = {
      ok: true,
      schema_version: '1.0',
      trace_id: 'trace-123',
      resolution_summary: {
        mode: 'read_only_hit',
        writes_attempted: 0,
        writes_succeeded: 0,
        sources: ['sessions_history', 'memory_get'],
        confidence_min: 1,
        confidence_max: 1,
      },
      notes: ['ok'],
    };

    runAuditTrace(result, auditLog);
    const content = fs.readFileSync(auditLog, 'utf8');
    expect(content).toContain('trace-123');
    expect(content).toContain('audit_trace');
  });

  it('writes session snapshot trace records after calling timelineResolve', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Snapshot run.'],
      memoryGet: async () => '',
    });

    const result = await runSessionSnapshot(snapshotLog);
    expect(result.ok).toBe(true);

    const content = fs.readFileSync(snapshotLog, 'utf8');
    expect(content).toContain('session_snapshot');
    expect(content).toContain(result.trace_id);
  });
});
