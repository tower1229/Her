import { HookSpec } from '../openclaw-sdk-compat';
import { appendTraceLog } from '../storage/trace_log';
import { timelineResolve, TimelineResolveOutput } from '../tools/timeline_resolve';

export const sessionSnapshotHook: HookSpec = {
  name: 'timeline_session_snapshot',
  description:
    'Lifecycle hook placeholder for recording timeline trace snapshots at stable session boundaries.',
  event: 'session_snapshot',
};

export async function runSessionSnapshot(logPath: string): Promise<TimelineResolveOutput> {
  const result = await timelineResolve({
    target_time_range: 'now_today',
    mode: 'read_only',
    reason: 'snapshot',
    trace: true,
  });

  appendTraceLog(
    {
      trace_id: result.trace_id,
      event: 'session_snapshot',
      ts: new Date().toISOString(),
      payload: {
        resolution_mode: result.resolution_summary.mode,
        writes_attempted: result.resolution_summary.writes_attempted,
        writes_succeeded: result.resolution_summary.writes_succeeded,
        trace: result.trace ?? null,
      },
    },
    logPath,
  );

  return result;
}
