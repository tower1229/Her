import * as os from 'os';
import * as path from 'path';
import { collectSources, TimelineSourceDependencies } from '../core/collect_sources';
import { buildReadOnlyResult } from '../core/map_window';
import { inferCandidate } from '../core/infer_candidate';
import { buildTrace, TimelineTrace } from '../core/trace';
import { parseMemoryFile } from '../lib/parse-memory';
import { assertCanonicalDailyLogPath } from '../storage/daily_log';
import { withFileLock } from '../storage/lock';
import { recordTimelineRuntimeStatus } from '../storage/runtime_status';
import { appendTraceLog } from '../storage/trace_log';
import { writeEpisode, WriteEpisodeInput, WriteResult } from '../storage/write-episode';
import { resolveWindow } from '../core/resolve_window';

export type TimelineResolveMode = 'read_only' | 'allow_generate';
export type TimelineResolveReason =
  | 'current_status'
  | 'past_recall'
  | 'compaction_flush'
  | 'heartbeat'
  | 'snapshot'
  | 'debug';

export type TimelineResolveErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_RANGE'
  | 'SOURCE_FAILURE'
  | 'WRITE_BLOCKED'
  | 'PARSE_ERROR'
  | 'INTERNAL';

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

export interface TimelineResolutionSummary {
  mode: 'read_only_hit' | 'generated_new' | 'not_implemented';
  writes_attempted: number;
  writes_succeeded: number;
  sources: string[];
  confidence_min: number;
  confidence_max: number;
}

export interface TimelineWindowResult {
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
}

export interface TimelineResolveSuccessOutput {
  ok: true;
  schema_version: '1.0';
  trace_id: string;
  resolution_summary: TimelineResolutionSummary;
  result?: TimelineWindowResult;
  notes: string[];
  trace?: TimelineTrace;
}

export interface TimelineResolveFailureOutput {
  ok: false;
  schema_version: '1.0';
  trace_id: string;
  resolution_summary: TimelineResolutionSummary;
  result?: TimelineWindowResult;
  notes: string[];
  error: {
    code: TimelineResolveErrorCode;
    message: string;
  };
  trace?: TimelineTrace;
}

export type TimelineResolveOutput = TimelineResolveSuccessOutput | TimelineResolveFailureOutput;

export interface TimelineRuntimeDependencies extends TimelineSourceDependencies {
  writeEpisode?: (input: WriteEpisodeInput) => Promise<WriteResult>;
  memoryFilePath?: (calendarDate: string) => string;
  traceLogPath?: string;
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
  traceLogPath: path.join(os.tmpdir(), 'openclaw-timeline-plugin-trace.log'),
};

let runtimeDependencies: TimelineRuntimeDependencies = defaultDependencies;

export function setTimelineResolveDependencies(deps: Partial<TimelineRuntimeDependencies>): void {
  runtimeDependencies = { ...runtimeDependencies, ...deps };
}

export function resetTimelineResolveDependencies(): void {
  runtimeDependencies = defaultDependencies;
}

function validateTimelineResolveInput(input: TimelineResolveInput): void {
  if (input.target_time_range === 'natural_language' && !(input.query || '').trim()) {
    throw new Error('natural_language range requires query');
  }

  if (input.target_time_range === 'explicit') {
    if (!input.start || !input.end) {
      throw new Error('explicit range requires start and end');
    }
  }
}

function classifyTimelineResolveError(error: Error): TimelineResolveErrorCode {
  const message = error.message || 'Unknown timeline_resolve failure';
  if (message.includes('natural_language range requires query')) return 'INVALID_INPUT';
  if (message.includes('Invalid explicit') || message.includes('explicit range')) return 'INVALID_RANGE';
  if (message.includes('Canonical daily logs')) return 'WRITE_BLOCKED';
  if (message.includes('parse')) return 'PARSE_ERROR';
  if (message.includes('sessions_history') || message.includes('memory_get') || message.includes('memory_search')) {
    return 'SOURCE_FAILURE';
  }
  return 'INTERNAL';
}

function persistTraceIfRequested(output: TimelineResolveOutput, input: TimelineResolveInput): boolean {
  if (!input.trace || !runtimeDependencies.traceLogPath) return false;

  appendTraceLog(
    {
      trace_id: output.trace_id,
      event: 'timeline_resolve',
      ts: new Date().toISOString(),
      payload: {
        ok: output.ok,
        requested_range: input.target_time_range,
        error: output.ok ? null : output.error,
        resolution_mode: output.ok ? output.resolution_summary.mode : null,
        notes: output.notes,
        trace: output.trace ?? null,
      },
    },
    runtimeDependencies.traceLogPath,
  );

  return true;
}

function recordRuntimeStatus(output: TimelineResolveOutput, input: TimelineResolveInput, tracePersisted: boolean): void {
  recordTimelineRuntimeStatus({
    updated_at: new Date().toISOString(),
    ok: output.ok,
    requested_range: input.target_time_range,
    resolution_mode: output.ok ? output.resolution_summary.mode : undefined,
    trace_id: output.trace_id,
    trace_persisted: tracePersisted,
    trace_log_path: runtimeDependencies.traceLogPath,
    writes_attempted: output.ok ? output.resolution_summary.writes_attempted : 0,
    writes_succeeded: output.ok ? output.resolution_summary.writes_succeeded : 0,
    write_path: output.trace?.write.file_path,
    error_code: output.ok ? undefined : output.error.code,
    error_message: output.ok ? undefined : output.error.message,
  });
}

function finalizeTimelineOutput(output: TimelineResolveOutput, input: TimelineResolveInput): TimelineResolveOutput {
  const tracePersisted = persistTraceIfRequested(output, input);
  recordRuntimeStatus(output, input, tracePersisted);
  if (!input.trace) {
    delete output.trace;
  }
  return output;
}

export async function timelineResolve(
  input: TimelineResolveInput,
): Promise<TimelineResolveOutput> {
  let sourceOrder: string[] = [];

  try {
    validateTimelineResolveInput(input);

    const currentTime = await runtimeDependencies.currentTime();
    const window = resolveWindow(input, currentTime.now, input.timezone || currentTime.timezone);
    const sources = await collectSources(runtimeDependencies, window, input);
    sourceOrder = sources.sourceOrder;
    const parsedEpisodes = parseMemoryFile(sources.memoryContent);

    let output = buildReadOnlyResult(input, window, sources) as TimelineResolveSuccessOutput;
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
    return finalizeTimelineOutput(output, input);
  } catch (error: any) {
    const timelineError = error instanceof Error ? error : new Error(String(error));
    const trace = buildTrace({
      requested_range: input.target_time_range,
      actual_range: 'error',
      source_order: sourceOrder,
      source_summary: {
        sessions_history_count: 0,
        memory_chars: 0,
        memory_search_count: 0,
      },
      fingerprint: { checked: false, matched: false },
      appearance: { inherited: false, reason: 'error' },
      write: { attempted: false, succeeded: false },
      notes: [timelineError.message],
    });

    const output: TimelineResolveFailureOutput = {
      ok: false,
      schema_version: '1.0',
      trace_id: trace.trace_id,
      resolution_summary: {
        mode: 'not_implemented',
        writes_attempted: 0,
        writes_succeeded: 0,
        sources: sourceOrder,
        confidence_min: 0,
        confidence_max: 0,
      },
      notes: [timelineError.message],
      error: {
        code: classifyTimelineResolveError(timelineError),
        message: timelineError.message,
      },
      trace,
    };

    return finalizeTimelineOutput(output, input);
  }
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
