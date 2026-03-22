export interface TimelineTrace {
  trace_id: string;
  requested_range: string;
  actual_range: string;
  source_order: string[];
  source_summary: {
    sessions_history_count: number;
    memory_chars: number;
    memory_search_count: number;
  };
  fingerprint: {
    checked: boolean;
    matched: boolean;
    idempotency_key?: string;
  };
  appearance: {
    inherited: boolean;
    reason: string;
  };
  write: {
    attempted: boolean;
    succeeded: boolean;
    file_path?: string;
    error?: string;
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
  notes: string[];
}

export function makeTraceId(): string {
  return `timeline-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function buildTrace(input: TimelineTraceInput): TimelineTrace {
  return {
    trace_id: makeTraceId(),
    requested_range: input.requested_range,
    actual_range: input.actual_range,
    source_order: input.source_order,
    source_summary: input.source_summary,
    fingerprint: input.fingerprint,
    appearance: input.appearance,
    write: input.write,
    notes: input.notes,
  };
}
