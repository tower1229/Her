export interface TimelineTrace {
  trace_id: string;
  ts: string;
  requested_range: string;
  actual_range: string;
  source_order: string[];
  source_summary: {
    sessions_history_count: number;
    sessions_history_preview: string | null;
    memory_chars: number;
    memory_search_count: number;
    memory_search_preview: string[];
    parsed_episode_count: number;
    selected_episode_timestamp?: string;
  };
  fingerprint: {
    checked: boolean;
    matched: boolean;
    compared_episodes: number;
    idempotency_key?: string;
    matched_episode_timestamp?: string;
    fallback_reason?: string;
  };
  appearance: {
    inherited: boolean;
    reason: string;
    source_episode_timestamp?: string;
  };
  write: {
    attempted: boolean;
    succeeded: boolean;
    file_path?: string;
    lock_path?: string;
    outcome?: string;
    error_code?: string;
    error?: string;
    recovery_hint?: string;
    guard: 'not_attempted' | 'canonical_path' | 'range_policy' | 'lock' | 'conflict' | 'write_dependency';
    writer: 'openclaw-timeline-plugin';
  };
  decision: {
    resolution_mode: string;
    write_outcome?: string;
    fallback_category?: string;
    error_code?: string;
  };
  notes: string[];
}

export interface TimelineTraceInput {
  requested_range: string;
  actual_range: string;
  source_order: string[];
  source_summary: TimelineTrace['source_summary'];
  fingerprint: TimelineTrace['fingerprint'];
  appearance: TimelineTrace['appearance'];
  write: TimelineTrace['write'];
  decision: TimelineTrace['decision'];
  notes: string[];
}

export function makeTraceId(): string {
  return `timeline-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function buildTrace(input: TimelineTraceInput): TimelineTrace {
  return {
    trace_id: makeTraceId(),
    ts: new Date().toISOString(),
    requested_range: input.requested_range,
    actual_range: input.actual_range,
    source_order: input.source_order,
    source_summary: input.source_summary,
    fingerprint: input.fingerprint,
    appearance: input.appearance,
    write: input.write,
    decision: input.decision,
    notes: input.notes,
  };
}
