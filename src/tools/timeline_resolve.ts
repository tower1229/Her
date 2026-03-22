export type TimelineResolveMode = 'read_only' | 'allow_generate';
export type TimelineResolveReason =
  | 'current_status'
  | 'past_recall'
  | 'compaction_flush'
  | 'heartbeat'
  | 'snapshot'
  | 'debug';

export interface TimelineResolveInput {
  target_time_range: 'now_today' | 'recent_3d' | 'explicit' | 'natural_language';
  start?: string;
  end?: string;
  query?: string;
  mode: TimelineResolveMode;
  reason: TimelineResolveReason;
  timezone?: string;
  trace?: boolean;
}

export interface TimelineResolveOutput {
  ok: boolean;
  schema_version: '1.0';
  trace_id: string;
  resolution_summary: {
    mode: 'read_only_hit' | 'generated_new' | 'not_implemented';
    writes_attempted: number;
    writes_succeeded: number;
    sources: string[];
    confidence_min: number;
    confidence_max: number;
  };
  notes: string[];
}

function makeTraceId(): string {
  return `timeline-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

/**
 * Milestone-1 stub only.
 * This intentionally returns a traceable placeholder until the deterministic
 * runtime pipeline is implemented.
 */
export async function timelineResolve(
  input: TimelineResolveInput,
): Promise<TimelineResolveOutput> {
  return {
    ok: true,
    schema_version: '1.0',
    trace_id: makeTraceId(),
    resolution_summary: {
      mode: 'not_implemented',
      writes_attempted: 0,
      writes_succeeded: 0,
      sources: [],
      confidence_min: 0,
      confidence_max: 0,
    },
    notes: [
      'Milestone-1 stub only.',
      `Received target_time_range=${input.target_time_range}`,
      `Received reason=${input.reason}`,
      'Next implementation step: resolve window, collect sources, parse memory, fingerprint, map window.',
    ],
  };
}

export const timelineResolveToolSpec = {
  name: 'timeline_resolve',
  description:
    'Canonical timeline entrypoint for temporal fact retrieval and optional append-only canon generation.',
  inputSchema: {
    type: 'object',
    properties: {
      target_time_range: {
        type: 'string',
        enum: ['now_today', 'recent_3d', 'explicit', 'natural_language'],
      },
      start: { type: 'string' },
      end: { type: 'string' },
      query: { type: 'string' },
      mode: { type: 'string', enum: ['read_only', 'allow_generate'] },
      reason: {
        type: 'string',
        enum: [
          'current_status',
          'past_recall',
          'compaction_flush',
          'heartbeat',
          'snapshot',
          'debug',
        ],
      },
      timezone: { type: 'string' },
      trace: { type: 'boolean' },
    },
    required: ['target_time_range', 'mode', 'reason'],
    additionalProperties: false,
  },
  run: timelineResolve,
};
