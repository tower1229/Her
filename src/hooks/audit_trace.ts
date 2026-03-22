import { HookSpec } from '../plugin-spec';
import { appendTraceLog } from '../storage/trace_log';
import { TimelineResolveOutput } from '../tools/timeline_resolve';

export const auditTraceHook: HookSpec = {
  name: 'timeline_audit_trace',
  description:
    'Lifecycle hook placeholder for persisting timeline tool invocation trace summaries.',
  event: 'audit_trace',
};

export function runAuditTrace(result: TimelineResolveOutput, logPath: string): void {
  appendTraceLog(
    {
      trace_id: result.trace_id,
      event: 'audit_trace',
      ts: new Date().toISOString(),
      payload: {
        ok: result.ok,
        resolution_mode: result.resolution_summary.mode,
        sources: result.resolution_summary.sources,
        writes_attempted: result.resolution_summary.writes_attempted,
        writes_succeeded: result.resolution_summary.writes_succeeded,
        trace: result.trace ?? null,
      },
    },
    logPath,
  );
}
