import { collectSources, TimelineSourceDependencies } from '../core/collect_sources';
import { buildReadOnlyResult } from '../core/map_window';
import { buildTrace } from '../core/trace';
import { resolveWindow } from '../core/resolve_window';

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
  result?: {
    schema_version: '1.0';
    document_type: 'timeline.window';
    anchor: { now: string; timezone: string };
    window: {
      calendar_date: string;
      preset: string;
      start: string;
      end: string;
      idempotency_key: string;
    };
    resolution: {
      mode: 'read_only_hit' | 'generated_new';
      notes?: string;
    };
    episodes: unknown[];
  };
  notes: string[];
}

const defaultDependencies: TimelineSourceDependencies = {
  currentTime: async () => ({
    now: '2026-03-22T14:30:00+08:00',
    timezone: 'Asia/Shanghai',
  }),
  sessionsHistory: async () => [],
  memoryGet: async () => '',
  memorySearch: async () => [],
};

let runtimeDependencies: TimelineSourceDependencies = defaultDependencies;

export function setTimelineResolveDependencies(deps: Partial<TimelineSourceDependencies>): void {
  runtimeDependencies = { ...runtimeDependencies, ...deps };
}

export function resetTimelineResolveDependencies(): void {
  runtimeDependencies = defaultDependencies;
}

export async function timelineResolve(
  input: TimelineResolveInput,
): Promise<TimelineResolveOutput> {
  const currentTime = await runtimeDependencies.currentTime();
  const window = resolveWindow(input, currentTime.now, input.timezone || currentTime.timezone);
  const sources = await collectSources(runtimeDependencies, window, input);
  const output = buildReadOnlyResult(input, window, sources);

  const trace = buildTrace(input.target_time_range, window.preset, sources.sourceOrder, output.notes);
  output.trace_id = trace.trace_id;

  if (input.mode === 'allow_generate' && output.resolution_summary.mode === 'generated_new') {
    output.resolution_summary.mode = 'not_implemented';
    output.notes.push('Generation/write path is not implemented yet in Milestone 2.');
  }

  return output;
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
