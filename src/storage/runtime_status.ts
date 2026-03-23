export interface TimelineRuntimeStatusSnapshot {
  updated_at: string;
  ok: boolean;
  requested_range?: string;
  resolution_mode?: string;
  write_outcome?: string;
  trace_id: string;
  trace_persisted: boolean;
  trace_log_path?: string;
  writes_attempted: number;
  writes_succeeded: number;
  write_path?: string;
  recovery_hint?: string;
  error_code?: string;
  error_message?: string;
}

let lastSnapshot: TimelineRuntimeStatusSnapshot | null = null;

export function recordTimelineRuntimeStatus(snapshot: TimelineRuntimeStatusSnapshot): void {
  lastSnapshot = snapshot;
}

export function getTimelineRuntimeStatus(): TimelineRuntimeStatusSnapshot | null {
  return lastSnapshot;
}

export function resetTimelineRuntimeStatus(): void {
  lastSnapshot = null;
}
