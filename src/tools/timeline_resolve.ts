import { collectSources, TimelineSourceDependencies } from '../core/collect_sources';
import { buildReadOnlyResult } from '../core/map_window';
import { inferCandidate } from '../core/infer_candidate';
import { buildTrace, TimelineTrace } from '../core/trace';
import { parseMemoryFile } from '../../scripts/parse-memory';
import { writeEpisode, WriteEpisodeInput, WriteResult } from '../../scripts/write-episode';
import { assertCanonicalDailyLogPath } from '../storage/daily_log';
import { withFileLock } from '../storage/lock';
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
  trace?: TimelineTrace;
}

export interface TimelineRuntimeDependencies extends TimelineSourceDependencies {
  writeEpisode?: (input: WriteEpisodeInput) => Promise<WriteResult>;
  memoryFilePath?: (calendarDate: string) => string;
}

const defaultDependencies: TimelineRuntimeDependencies = {
  currentTime: async () => ({
    now: '2026-03-22T14:30:00+08:00',
    timezone: 'Asia/Shanghai',
  }),
  sessionsHistory: async () => [],
  memoryGet: async () => '',
  memorySearch: async () => [],
  writeEpisode,
  memoryFilePath: (calendarDate: string) => `memory/${calendarDate}.md`,
};

let runtimeDependencies: TimelineRuntimeDependencies = defaultDependencies;

export function setTimelineResolveDependencies(deps: Partial<TimelineRuntimeDependencies>): void {
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
  const parsedEpisodes = parseMemoryFile(sources.memoryContent);

  let output = buildReadOnlyResult(input, window, sources);
  let traceAppearance = { inherited: false, reason: 'not-applicable' };
  let traceWrite = { attempted: false, succeeded: false } as TimelineTrace['write'];
  let traceFingerprint = {
    checked: parsedEpisodes.length > 0,
    matched: output.resolution_summary.mode === 'read_only_hit' && parsedEpisodes.length > 0,
    idempotency_key: output.result?.window.idempotency_key,
  };

  if (input.mode === 'allow_generate' && parsedEpisodes.length === 0) {
    const generated = inferCandidate(window, sources);
    traceAppearance = generated.appearance;
    const requestedPath = runtimeDependencies.memoryFilePath
      ? runtimeDependencies.memoryFilePath(window.calendar_date)
      : `memory/${window.calendar_date}.md`;

    let filePath = requestedPath;
    let writeResult: WriteResult = { success: false, written_at: '', error: 'write dependency missing' };

    try {
      filePath = assertCanonicalDailyLogPath(requestedPath, window.calendar_date);
      writeResult = runtimeDependencies.writeEpisode
        ? await withFileLock(filePath, async () =>
            runtimeDependencies.writeEpisode!({
              timestamp: generated.parsed.timestamp,
              location: generated.parsed.location,
              action: generated.parsed.action,
              emotionTags: generated.parsed.emotionTags,
              appearance: generated.parsed.appearance,
              internalMonologue: generated.parsed.internalMonologue,
              naturalText: generated.parsed.naturalText,
              filePath,
              windowPreset: window.preset,
              confidence: generated.parsed.confidence,
            }),
          )
        : { success: false, written_at: '', error: 'write dependency missing' };
    } catch (error: any) {
      writeResult = { success: false, written_at: '', error: error.message };
    }

    traceWrite = {
      attempted: true,
      succeeded: writeResult.success,
      file_path: filePath,
      error: writeResult.success ? undefined : writeResult.error,
    };
    traceFingerprint = {
      checked: true,
      matched: false,
      idempotency_key: generated.idempotencyKey,
    };

    output = {
      ok: true,
      schema_version: '1.0',
      trace_id: '',
      resolution_summary: {
        mode: writeResult.success ? 'generated_new' : 'not_implemented',
        writes_attempted: 1,
        writes_succeeded: writeResult.success ? 1 : 0,
        sources: sources.sourceOrder,
        confidence_min: generated.parsed.confidence,
        confidence_max: generated.parsed.confidence,
      },
      result: {
        schema_version: '1.0',
        document_type: 'timeline.window',
        anchor: { now: window.end, timezone: window.timezone },
        window: {
          calendar_date: window.calendar_date,
          preset: window.preset,
          start: window.start,
          end: window.end,
          idempotency_key: generated.idempotencyKey,
        },
        resolution: {
          mode: 'generated_new',
          notes: writeResult.success ? 'generated candidate persisted via append-only writer' : writeResult.error,
        },
        episodes: [generated.episode],
      },
      notes: generated.notes.concat(
        writeResult.success
          ? [`Generated episode persisted to ${filePath}.`]
          : [`Generation attempted but write failed: ${writeResult.error ?? 'unknown error'}.`],
      ),
    };
  }

  if (parsedEpisodes.length > 0 && output.resolution_summary.mode === 'read_only_hit') {
    traceAppearance = { inherited: false, reason: 'existing canon reused' };
    traceWrite = { attempted: false, succeeded: false };
    traceFingerprint = {
      checked: true,
      matched: true,
      idempotency_key: output.result?.window.idempotency_key,
    };
  }

  const trace = buildTrace({
    requested_range: input.target_time_range,
    actual_range: window.preset,
    source_order: sources.sourceOrder,
    source_summary: {
      sessions_history_count: sources.sessionsHistory.length,
      memory_chars: sources.memoryContent.length,
      memory_search_count: sources.memorySearch.length,
    },
    fingerprint: traceFingerprint,
    appearance: traceAppearance,
    write: traceWrite,
    notes: output.notes,
  });
  output.trace_id = trace.trace_id;
  output.trace = trace;
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
