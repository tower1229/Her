export interface TimelineTrace {
  trace_id: string;
  requested_range: string;
  actual_range: string;
  source_order: string[];
  notes: string[];
}

export function makeTraceId(): string {
  return `timeline-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function buildTrace(inputRange: string, actualRange: string, sourceOrder: string[], notes: string[]): TimelineTrace {
  return {
    trace_id: makeTraceId(),
    requested_range: inputRange,
    actual_range: actualRange,
    source_order: sourceOrder,
    notes,
  };
}
