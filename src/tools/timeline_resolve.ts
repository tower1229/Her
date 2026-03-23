import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectSources, TimelineSourceDependencies } from '../core/collect_sources';
import { buildReadOnlyResult } from '../core/map_window';
import { materializeGeneratedCandidate, TimelineGeneratedDraft } from '../core/materialize_generated_candidate';
import { buildTimelineGenerationPrompt, TimelineGenerationRequest } from '../core/generation_prompt';
import { buildTrace, TimelineTrace } from '../core/trace';
import { parseMemoryFile } from '../lib/parse-memory';
import { assertCanonicalDailyLogPath } from '../storage/daily_log';
import { FileLockError, withFileLock } from '../storage/lock';
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
  | 'GENERATION_UNAVAILABLE'
  | 'WRITE_BLOCKED'
  | 'WRITE_CONFLICT'
  | 'WRITE_FAILED'
  | 'PARSE_ERROR'
  | 'INTERNAL';

export type TimelineResolutionMode =
  | 'read_only_hit'
  | 'empty_window'
  | 'generated_new'
  | 'already_present'
  | 'write_blocked'
  | 'write_conflict'
  | 'write_failed'
  | 'error';

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
  mode: TimelineResolutionMode;
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
    semantic_target?: string;
    collection_scope?: string;
    start: string;
    end: string;
    idempotency_key: string;
  };
  resolution: {
    mode: TimelineResolutionMode;
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
  generateMemoryDraft?: (input: TimelineGenerationRequest) => Promise<TimelineGeneratedDraft | null>;
}

function readOptionalTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

const defaultDependencies: TimelineRuntimeDependencies = {
  currentTime: async () => ({
    now: '2026-03-22T14:30:00+08:00',
    timezone: 'Asia/Shanghai',
  }),
  sessionsHistory: async () => [],
  memoryGet: async () => '',
  memorySearch: async () => [],
  coreFiles: async () => ({
    soul: readOptionalTextFile(path.join(process.cwd(), 'SOUL.md')),
    memory: readOptionalTextFile(path.join(process.cwd(), 'MEMORY.md')),
    identity: readOptionalTextFile(path.join(process.cwd(), 'IDENTITY.md')) || readOptionalTextFile(path.join(process.cwd(), 'IDENTITY')),
  }),
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

  if (input.target_time_range === 'explicit' && (!input.start || !input.end)) {
    throw new Error('explicit range requires start and end');
  }
}

function classifyTimelineResolveError(error: Error): TimelineResolveErrorCode {
  const message = error.message || 'Unknown timeline_resolve failure';
  if (message.includes('natural_language range requires query')) return 'INVALID_INPUT';
  if (message.includes('Invalid explicit') || message.includes('explicit range')) return 'INVALID_RANGE';
  if (message.includes('LLM generation')) return 'GENERATION_UNAVAILABLE';
  if (message.includes('Generated draft')) return 'GENERATION_UNAVAILABLE';
  if (message.includes('Canonical daily logs')) return 'WRITE_BLOCKED';
  if (message.includes('Lock already held')) return 'WRITE_CONFLICT';
  if (message.includes('write dependency missing')) return 'WRITE_BLOCKED';
  if (message.includes('parse')) return 'PARSE_ERROR';
  if (message.includes('sessions_history') || message.includes('memory_get') || message.includes('memory_search')) {
    return 'SOURCE_FAILURE';
  }
  return 'INTERNAL';
}

function classifyWriteFailure(writeResult: WriteResult): {
  mode: TimelineResolutionMode;
  errorCode: TimelineResolveErrorCode;
  guard: TimelineTrace['write']['guard'];
  recoveryHint?: string;
} {
  if (writeResult.error_code === 'CONFLICT_EXISTS') {
    return {
      mode: 'write_conflict',
      errorCode: 'WRITE_CONFLICT',
      guard: 'conflict',
      recoveryHint: writeResult.recovery_hint,
    };
  }
  if (writeResult.error_code === 'LOCK_EXISTS') {
    return {
      mode: 'write_conflict',
      errorCode: 'WRITE_CONFLICT',
      guard: 'lock',
      recoveryHint: writeResult.recovery_hint ?? 'Retry once the current timeline writer releases the file lock.',
    };
  }
  if (writeResult.error === 'write dependency missing') {
    return {
      mode: 'write_blocked',
      errorCode: 'WRITE_BLOCKED',
      guard: 'write_dependency',
      recoveryHint: 'Configure the timeline writer dependencies before allowing generated writes.',
    };
  }
  if ((writeResult.error || '').includes('Canonical daily logs')) {
    return {
      mode: 'write_blocked',
      errorCode: 'WRITE_BLOCKED',
      guard: 'canonical_path',
      recoveryHint: writeResult.recovery_hint ?? 'Use the canonical memory/YYYY-MM-DD.md path before allowing generated writes.',
    };
  }
  return {
    mode: 'write_failed',
    errorCode: 'WRITE_FAILED',
    guard: 'canonical_path',
    recoveryHint: writeResult.recovery_hint,
  };
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
        resolution_mode: output.resolution_summary.mode,
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
    resolution_mode: output.resolution_summary.mode,
    write_outcome: output.trace?.write.outcome,
    trace_id: output.trace_id,
    trace_persisted: tracePersisted,
    trace_log_path: runtimeDependencies.traceLogPath,
    writes_attempted: output.resolution_summary.writes_attempted,
    writes_succeeded: output.resolution_summary.writes_succeeded,
    write_path: output.trace?.write.file_path,
    recovery_hint: output.trace?.write.recovery_hint,
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
    let traceAppearance: TimelineTrace['appearance'] = { inherited: false, reason: 'not-applicable' };
    let traceWrite: TimelineTrace['write'] = {
      attempted: false,
      succeeded: false,
      guard: 'not_attempted',
      outcome: 'not_attempted',
      writer: 'openclaw-timeline-plugin',
    };
    let traceFingerprint: TimelineTrace['fingerprint'] = {
      checked: parsedEpisodes.length > 0,
      matched: output.resolution_summary.mode === 'read_only_hit' && parsedEpisodes.length > 0,
      compared_episodes: parsedEpisodes.length,
      idempotency_key: output.result?.window.idempotency_key,
      matched_episode_timestamp: parsedEpisodes[parsedEpisodes.length - 1]?.timestamp,
      reason: parsedEpisodes.length === 0 ? 'no parsed episodes found in memory content' : undefined,
    };
    let decision: TimelineTrace['decision'] = {
      resolution_mode: output.resolution_summary.mode,
      write_outcome: traceWrite.outcome,
    };

    if (input.mode === 'allow_generate' && output.resolution_summary.mode === 'empty_window') {
        if (!runtimeDependencies.generateMemoryDraft) {
          throw new Error('LLM generation dependency missing');
        }
        const modelDraft = await runtimeDependencies.generateMemoryDraft({
          window,
          sources,
          prompt: buildTimelineGenerationPrompt(window, sources),
        });
        if (!modelDraft) {
          throw new Error('LLM generation returned no draft');
        }
        const generated = materializeGeneratedCandidate(window, sources, modelDraft, modelDraft.reason || 'llm-guided semantic timeline synthesis');
        traceAppearance = generated.appearance;
        const requestedPath = runtimeDependencies.memoryFilePath
          ? runtimeDependencies.memoryFilePath(window.calendar_date)
          : `memory/${window.calendar_date}.md`;

        let filePath = requestedPath;
        let writeResult: WriteResult = {
          success: false,
          written_at: '',
          outcome: 'failed',
          error: 'write dependency missing',
          recovery_hint: 'Configure the timeline writer dependencies before allowing generated writes.',
        };
        let writeGuard: TimelineTrace['write']['guard'] = 'canonical_path';

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
                  windowPreset: window.legacy_preset,
                  confidence: generated.parsed.confidence,
                }),
              )
            : writeResult;
        } catch (error: any) {
          if (error instanceof FileLockError) {
            writeGuard = 'lock';
            writeResult = {
              success: false,
              written_at: '',
              outcome: 'conflict',
              error_code: 'LOCK_EXISTS',
              error: error.message,
              recovery_hint: 'Retry once the current timeline writer releases the file lock.',
            };
          } else {
            writeResult = {
              success: false,
              written_at: '',
              outcome: 'failed',
              error_code: String(error.message || '').includes('Canonical daily logs') ? 'IO_ERROR' : undefined,
              error: error.message,
              recovery_hint: String(error.message || '').includes('Canonical daily logs')
                ? 'Use the canonical memory/YYYY-MM-DD.md path before allowing generated writes.'
                : undefined,
            };
          }
        }

        const normalizedWriteResult: WriteResult = writeResult.success && !writeResult.outcome
          ? { ...writeResult, outcome: 'appended' }
          : writeResult;
        const failedWrite = !normalizedWriteResult.success ? classifyWriteFailure(normalizedWriteResult) : null;
        if (failedWrite) {
          writeGuard = failedWrite.guard;
        }

        const resolutionMode: TimelineResolutionMode = normalizedWriteResult.success
          ? normalizedWriteResult.outcome === 'noop_existing'
            ? 'already_present'
            : 'generated_new'
          : failedWrite?.mode ?? 'write_failed';
        const resolutionNotes = normalizedWriteResult.success
          ? normalizedWriteResult.outcome === 'noop_existing'
            ? 'a matching canon entry already existed, so the append-only writer skipped the write'
            : 'generated candidate persisted via append-only writer'
          : normalizedWriteResult.error;

        traceWrite = {
          attempted: true,
          succeeded: normalizedWriteResult.success && normalizedWriteResult.outcome === 'appended',
          file_path: filePath,
          outcome: normalizedWriteResult.outcome,
          error_code: normalizedWriteResult.error_code,
          error: normalizedWriteResult.success ? undefined : normalizedWriteResult.error,
          recovery_hint: normalizedWriteResult.recovery_hint,
          guard: writeGuard,
          writer: 'openclaw-timeline-plugin',
        };
        traceFingerprint = {
          checked: true,
          matched: false,
          compared_episodes: 0,
          idempotency_key: normalizedWriteResult.idempotency_key || generated.idempotencyKey,
          reason: generated.generationReason,
        };
        decision = {
          resolution_mode: resolutionMode,
          write_outcome: normalizedWriteResult.outcome,
          category: normalizedWriteResult.success ? undefined : 'write_failure',
          error_code: failedWrite?.errorCode,
        };

        output = {
          ok: true,
          schema_version: '1.0',
          trace_id: '',
          resolution_summary: {
            mode: resolutionMode,
            writes_attempted: 1,
            writes_succeeded: normalizedWriteResult.success && normalizedWriteResult.outcome === 'appended' ? 1 : 0,
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
              preset: window.legacy_preset,
              semantic_target: window.semantic_target,
              collection_scope: window.collection_scope,
              start: window.start,
              end: window.end,
              idempotency_key: normalizedWriteResult.idempotency_key || generated.idempotencyKey,
            },
            resolution: {
              mode: resolutionMode,
              notes: resolutionNotes,
            },
            episodes: [generated.episode],
          },
          notes: generated.notes.concat(
            normalizedWriteResult.success
              ? normalizedWriteResult.outcome === 'noop_existing'
                ? [`A matching canon entry was already present at ${filePath}; append skipped.`]
                : [`Generated episode persisted to ${filePath}.`]
              : [
                  `Generation attempted but write failed: ${normalizedWriteResult.error ?? 'unknown error'}.`,
                  ...(normalizedWriteResult.recovery_hint ? [`Recovery hint: ${normalizedWriteResult.recovery_hint}`] : []),
                ],
          ),
        };
    }

    if (parsedEpisodes.length > 0 && output.resolution_summary.mode === 'read_only_hit') {
      traceAppearance = {
        inherited: false,
        reason: 'existing canon reused',
        source_episode_timestamp: parsedEpisodes[0]?.timestamp,
      };
      traceWrite = {
        attempted: false,
        succeeded: false,
        guard: 'not_attempted',
        outcome: 'not_attempted',
        writer: 'openclaw-timeline-plugin',
      };
      traceFingerprint = {
        checked: true,
        matched: true,
        compared_episodes: parsedEpisodes.length,
        idempotency_key: output.result?.window.idempotency_key,
        matched_episode_timestamp: parsedEpisodes[parsedEpisodes.length - 1]?.timestamp,
      };
      decision = {
        resolution_mode: output.resolution_summary.mode,
        write_outcome: traceWrite.outcome,
      };
    }

    if (output.resolution_summary.mode === 'empty_window') {
      traceAppearance = {
        inherited: false,
        reason: 'no-canon-hit',
      };
      traceWrite = {
        attempted: false,
        succeeded: false,
        guard: 'not_attempted',
        outcome: 'not_attempted',
        writer: 'openclaw-timeline-plugin',
      };
      traceFingerprint = {
        checked: false,
        matched: false,
        compared_episodes: 0,
        reason: 'no parsed episodes found in memory content',
      };
      decision = {
        resolution_mode: output.resolution_summary.mode,
        write_outcome: traceWrite.outcome,
      };
    }

    const trace = buildTrace({
      requested_range: input.target_time_range,
      actual_range: window.semantic_target,
      source_order: sources.sourceOrder,
      source_summary: {
        sessions_history_count: sources.sessionsHistory.length,
        sessions_history_preview: sources.sessionsHistory[0] || null,
        memory_chars: sources.memoryContent.length,
        memory_search_count: sources.memorySearch.length,
        memory_search_preview: sources.memorySearch.slice(0, 3),
        parsed_episode_count: parsedEpisodes.length,
        selected_episode_timestamp: output.result?.episodes.length ? parsedEpisodes[parsedEpisodes.length - 1]?.timestamp : undefined,
      },
      fingerprint: traceFingerprint,
      appearance: traceAppearance,
      write: traceWrite,
      decision,
      notes: output.notes,
    });
    output.trace_id = trace.trace_id;
    output.trace = trace;
    return finalizeTimelineOutput(output, input);
  } catch (error: any) {
    const timelineError = error instanceof Error ? error : new Error(String(error));
    const errorCode = classifyTimelineResolveError(timelineError);
    const trace = buildTrace({
      requested_range: input.target_time_range,
      actual_range: 'error',
      source_order: sourceOrder,
      source_summary: {
        sessions_history_count: 0,
        sessions_history_preview: null,
        memory_chars: 0,
        memory_search_count: 0,
        memory_search_preview: [],
        parsed_episode_count: 0,
      },
      fingerprint: {
        checked: false,
        matched: false,
        compared_episodes: 0,
        reason: timelineError.message,
      },
      appearance: { inherited: false, reason: 'error' },
      write: {
        attempted: false,
        succeeded: false,
        guard: 'not_attempted',
        outcome: 'not_attempted',
        writer: 'openclaw-timeline-plugin',
      },
      decision: {
        resolution_mode: 'error',
        write_outcome: 'not_attempted',
        category: 'error',
        error_code: errorCode,
      },
      notes: [timelineError.message],
    });

    const output: TimelineResolveFailureOutput = {
      ok: false,
      schema_version: '1.0',
      trace_id: trace.trace_id,
      resolution_summary: {
        mode: 'error',
        writes_attempted: 0,
        writes_succeeded: 0,
        sources: sourceOrder,
        confidence_min: 0,
        confidence_max: 0,
      },
      notes: [timelineError.message],
      error: {
        code: errorCode,
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
