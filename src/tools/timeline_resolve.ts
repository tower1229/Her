import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectSources, TimelineSourceDependencies } from '../core/collect_sources';
import { buildTimelineCollectorOutput } from '../core/collect_timeline_request';
import { materializeGeneratedCandidate } from '../core/materialize_generated_candidate';
import { TimelineCollectorOutput, TimelineReasonerOutput } from '../core/timeline_reasoner_contract';
import { validateTimelineReasonerOutput } from '../core/runtime_guard';
import { buildTrace, TimelineTrace } from '../core/trace';
import { buildConsumptionView } from '../core/build_consumption_view';
import { TimelineConsumptionView } from '../lib/types';
import { mapToEpisode } from '../lib/parse-memory';
import { computeFingerprint } from '../lib/fingerprint';
import { dayOfWeek, formatDate, parseTimestampParts } from '../lib/time-utils';
import { getHoliday } from '../lib/holidays';
import { assertCanonicalDailyLogPath } from '../storage/daily_log';
import { FileLockError, withFileLock } from '../storage/lock';
import { appendTraceLog } from '../storage/trace_log';
import { writeEpisode, WriteEpisodeInput, WriteResult } from '../storage/write-episode';
import { resolveWindow, TimelineQueryPlan } from '../core/resolve_window';

export type TimelineResolveMode = 'read_only' | 'allow_generate';

export type TimelineResolveErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_RANGE'
  | 'SOURCE_FAILURE'
  | 'REASONER_UNAVAILABLE'
  | 'GENERATION_UNAVAILABLE'
  | 'INVALID_REASONER_OUTPUT'
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
  query?: string;
  mode?: TimelineResolveMode;
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
  consumption?: TimelineConsumptionView;
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
  canonicalRootName?: string;
  traceLogPath?: string;
  planTimelineQuery?: (input: TimelineResolveInput, anchor: { now: string; timezone: string }) => Promise<TimelineQueryPlan>;
  reasonTimeline?: (collector: TimelineCollectorOutput) => Promise<TimelineReasonerOutput | null>;
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
    now: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }),
  sessionsHistory: async () => [],
  memoryGet: async () => '',
  memorySearch: async () => [],
  coreFiles: async () => ({
    soul: readOptionalTextFile(path.join(process.cwd(), 'SOUL.md')),
    memory: readOptionalTextFile(path.join(process.cwd(), 'MEMORY.md')) || readOptionalTextFile(path.join(process.cwd(), 'memory.md')),
    identity: readOptionalTextFile(path.join(process.cwd(), 'IDENTITY.md')) || readOptionalTextFile(path.join(process.cwd(), 'IDENTITY')),
    available_sources: [
      readOptionalTextFile(path.join(process.cwd(), 'SOUL.md')).trim() ? 'soul' : '',
      (readOptionalTextFile(path.join(process.cwd(), 'MEMORY.md')) || readOptionalTextFile(path.join(process.cwd(), 'memory.md'))).trim() ? 'memory' : '',
      (readOptionalTextFile(path.join(process.cwd(), 'IDENTITY.md')) || readOptionalTextFile(path.join(process.cwd(), 'IDENTITY'))).trim() ? 'identity' : '',
    ].filter(Boolean),
    should_constrain_generation: Boolean(
      readOptionalTextFile(path.join(process.cwd(), 'SOUL.md')).trim()
      || (readOptionalTextFile(path.join(process.cwd(), 'MEMORY.md')) || readOptionalTextFile(path.join(process.cwd(), 'memory.md'))).trim()
      || (readOptionalTextFile(path.join(process.cwd(), 'IDENTITY.md')) || readOptionalTextFile(path.join(process.cwd(), 'IDENTITY'))).trim(),
    ),
  }),
  writeEpisode,
  memoryFilePath: (calendarDate: string) => `memory/${calendarDate}.md`,
  canonicalRootName: 'memory',
  traceLogPath: path.join(os.tmpdir(), 'stella-timeline-plugin-trace.log'),
};

let runtimeDependencies: TimelineRuntimeDependencies = defaultDependencies;

export function setTimelineResolveDependencies(deps: Partial<TimelineRuntimeDependencies>): void {
  runtimeDependencies = { ...runtimeDependencies, ...deps };
}

export function resetTimelineResolveDependencies(): void {
  runtimeDependencies = defaultDependencies;
}

function getEffectiveTimelineDependencies(
  overrides?: Partial<TimelineRuntimeDependencies>,
): TimelineRuntimeDependencies {
  return {
    ...runtimeDependencies,
    ...overrides,
  };
}

function validateTimelineResolveInput(input: TimelineResolveInput): void {
  if (!String(input.query || '').trim()) {
    throw new Error('timeline_resolve requires query');
  }
}

function classifyTimelineResolveError(error: Error): TimelineResolveErrorCode {
  const message = error.message || 'Unknown timeline_resolve failure';
  if (message.includes('timeline_resolve requires query')) {
    return 'INVALID_INPUT';
  }
  if (
    message.includes('Invalid explicit range')
    || message.includes('normalized_point')
    || message.includes('normalized_start')
    || message.includes('normalized_end')
  ) {
    return 'INVALID_RANGE';
  }
  if (
    message.includes('Timeline reasoner dependency missing')
    || message.includes('Timeline reasoner returned no decision')
    || message.includes('Timeline query planner dependency missing')
    || message.includes('Timeline query planner returned no decision')
  ) {
    return 'REASONER_UNAVAILABLE';
  }
  if (message.includes('LLM generation')) return 'GENERATION_UNAVAILABLE';
  if (message.includes('Generated draft')) return 'GENERATION_UNAVAILABLE';
  if (message.includes('Invalid reasoner output')) return 'INVALID_REASONER_OUTPUT';
  if (message.includes('Canonical daily logs')) return 'WRITE_BLOCKED';
  if (message.includes('Lock already held')) return 'WRITE_CONFLICT';
  if (message.includes('write dependency missing')) return 'WRITE_BLOCKED';
  if (message.includes('parse')) return 'PARSE_ERROR';
  if (message.includes('sessions_history') || message.includes('memory_get') || message.includes('memory_search')) {
    return 'SOURCE_FAILURE';
  }
  return 'INTERNAL';
}

function normalizeMode(mode?: TimelineResolveMode): TimelineResolveMode {
  return mode || 'allow_generate';
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

function calendarDateFromTimestamp(timestamp: string): string {
  const parts = parseTimestampParts(timestamp);
  if (!parts) throw new Error(`Generated timestamp is not parseable: ${timestamp}`);
  return formatDate(parts);
}

function buildReasonerNotes(reasoned: TimelineReasonerOutput): string[] {
  const notes = [reasoned.rationale.summary];
  const interpretation = reasoned.time_interpretation?.summary?.trim();
  if (interpretation) {
    notes.push(`Time interpretation: ${interpretation}`);
  }
  return notes;
}

function persistTraceIfConfigured(
  output: TimelineResolveOutput,
  input: TimelineResolveInput,
  deps: TimelineRuntimeDependencies,
  requestedRange: string,
): boolean {
  if (!deps.traceLogPath) return false;

  appendTraceLog(
    {
      trace_id: output.trace_id,
      event: 'timeline_resolve',
      ts: new Date().toISOString(),
      payload: {
        ok: output.ok,
        requested_range: requestedRange,
        error: output.ok ? null : output.error,
        resolution_mode: output.resolution_summary.mode,
        notes: output.notes,
        trace: output.trace ?? null,
      },
    },
    deps.traceLogPath,
  );

  return true;
}

function finalizeTimelineOutput(
  output: TimelineResolveOutput,
  input: TimelineResolveInput,
  deps: TimelineRuntimeDependencies,
  requestedRange: string,
): TimelineResolveOutput {
  persistTraceIfConfigured(output, input, deps, requestedRange);
  if (!input.trace) {
    delete output.trace;
  }
  return output;
}

function makeRequestId(): string {
  return `timeline-request-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function maybePlanTimelineQuery(
  input: TimelineResolveInput,
  deps: TimelineRuntimeDependencies,
  anchor: { now: string; timezone: string },
): Promise<TimelineQueryPlan> {
  if (!deps.planTimelineQuery) {
    throw new Error('Timeline query planner dependency missing');
  }

  const plan = await deps.planTimelineQuery(input, anchor);
  if (!plan) {
    throw new Error('Timeline query planner returned no decision');
  }
  return plan;
}

function buildWorldHooks(timestamp: string): { weekday: boolean; holiday_key: string | null } {
  const parts = parseTimestampParts(timestamp);
  if (!parts) {
    return { weekday: true, holiday_key: null };
  }
  const date = formatDate(parts);
  return {
    weekday: ![0, 6].includes(dayOfWeek(parts)),
    holiday_key: getHoliday(date),
  };
}

function buildReadOnlyHitOutput(
  selectedFact: NonNullable<ReturnType<typeof validateTimelineReasonerOutput>['selected_fact']>,
  traceId: string,
  window: ReturnType<typeof resolveWindow>,
  collector: TimelineCollectorOutput,
  reasoned: TimelineReasonerOutput,
): TimelineResolveSuccessOutput {
  const date = selectedFact.calendar_date;
  const fp = computeFingerprint(date, selectedFact.location, selectedFact.action, selectedFact.timestamp);
  const episode = mapToEpisode(
    {
      timestamp: selectedFact.timestamp,
      location: selectedFact.location,
      action: selectedFact.action,
      emotionTags: selectedFact.emotion_tags,
      appearance: selectedFact.appearance,
      internalMonologue: selectedFact.internal_monologue,
      parseLevel: selectedFact.parse_level,
      confidence: selectedFact.confidence,
    },
    buildWorldHooks(selectedFact.timestamp),
    fp,
  );

  return {
    ok: true,
    schema_version: '1.0',
    trace_id: traceId,
    resolution_summary: {
      mode: 'read_only_hit',
      writes_attempted: 0,
      writes_succeeded: 0,
      sources: collector.source_order,
      confidence_min: selectedFact.confidence,
      confidence_max: selectedFact.confidence,
    },
    result: {
      schema_version: '1.0',
      document_type: 'timeline.window',
      anchor: { now: window.end, timezone: window.timezone },
      window: {
        calendar_date: window.calendar_date,
        preset: window.query_range,
        semantic_target: window.semantic_target,
        collection_scope: window.collection_scope,
        start: window.start,
        end: window.end,
        idempotency_key: fp,
      },
      resolution: {
        mode: 'read_only_hit',
        notes: buildReasonerNotes(reasoned).join(' | '),
      },
      consumption: buildConsumptionView({
        preset: window.query_range,
        semanticTarget: window.semantic_target,
        collectionScope: window.collection_scope,
        resolutionMode: 'read_only_hit',
        reasoned,
        episode,
        sourceType: 'canon',
      }),
      episodes: [episode],
    },
    notes: buildReasonerNotes(reasoned),
  };
}

function buildEmptyOutput(
  traceId: string,
  window: ReturnType<typeof resolveWindow>,
  collector: TimelineCollectorOutput,
  reasoned: TimelineReasonerOutput,
): TimelineResolveSuccessOutput {
  return {
    ok: true,
    schema_version: '1.0',
    trace_id: traceId,
    resolution_summary: {
      mode: 'empty_window',
      writes_attempted: 0,
      writes_succeeded: 0,
      sources: collector.source_order,
      confidence_min: 0,
      confidence_max: 0,
    },
    result: {
      schema_version: '1.0',
      document_type: 'timeline.window',
      anchor: { now: window.end, timezone: window.timezone },
      window: {
        calendar_date: window.calendar_date,
        preset: window.query_range,
        semantic_target: window.semantic_target,
        collection_scope: window.collection_scope,
        start: window.start,
        end: window.end,
        idempotency_key: 'none',
      },
      resolution: {
        mode: 'empty_window',
        notes: buildReasonerNotes(reasoned).join(' | '),
      },
      consumption: buildConsumptionView({
        preset: window.query_range,
        semanticTarget: window.semantic_target,
        collectionScope: window.collection_scope,
        resolutionMode: 'empty_window',
        reasoned,
        sourceType: 'none',
      }),
      episodes: [],
    },
    notes: buildReasonerNotes(reasoned),
  };
}

export async function timelineResolve(
  input: TimelineResolveInput,
  dependencyOverrides?: Partial<TimelineRuntimeDependencies>,
): Promise<TimelineResolveOutput> {
  const deps = getEffectiveTimelineDependencies(dependencyOverrides);
  let sourceOrder: string[] = [];
  let requestedRange = 'unknown';

  try {
    validateTimelineResolveInput(input);

    const currentTime = await deps.currentTime();
    const queryPlan = await maybePlanTimelineQuery(input, deps, {
      now: currentTime.now,
      timezone: currentTime.timezone,
    });
    requestedRange = queryPlan.target_time_range;
    const window = resolveWindow(queryPlan, currentTime.now, currentTime.timezone);
    const sources = await collectSources(deps, window, input);
    sourceOrder = sources.sourceOrder;
    const collector = buildTimelineCollectorOutput(makeRequestId(), input, window, sources);
    if (!deps.reasonTimeline) {
      throw new Error('Timeline reasoner dependency missing');
    }
    const reasoned = await deps.reasonTimeline(collector);
    if (!reasoned) {
      throw new Error('Timeline reasoner returned no decision');
    }
    const guard = validateTimelineReasonerOutput(collector, reasoned);
    if (!guard.ok) {
      throw new Error(`Invalid reasoner output: ${guard.block_reason}`);
    }

    let output: TimelineResolveSuccessOutput;
    let traceAppearance: TimelineTrace['appearance'] = { inherited: false, reason: 'not-applicable' };
    let traceWrite: TimelineTrace['write'] = {
      attempted: false,
      succeeded: false,
      guard: 'not_attempted',
      outcome: 'not_attempted',
      writer: 'stella-timeline-plugin',
    };
    let traceFingerprint: TimelineTrace['fingerprint'] = {
      checked: collector.candidate_facts.length > 0,
      matched: false,
      compared_episodes: collector.candidate_facts.length,
      reason: reasoned.rationale.summary,
    };
    let decision: TimelineTrace['decision'] = {
      resolution_mode: guard.outcome === 'reuse_existing_fact'
        ? 'read_only_hit'
        : guard.outcome === 'generate_new_fact'
          ? 'generated_new'
          : 'empty_window',
      write_outcome: traceWrite.outcome,
      category: reasoned.request_type,
    };

    if (guard.outcome === 'reuse_existing_fact' && guard.selected_fact) {
      output = buildReadOnlyHitOutput(guard.selected_fact, '', window, collector, reasoned);
      traceAppearance = {
        inherited: false,
        reason: 'existing canon reused after LLM reasoner selected a matching fact',
        source_episode_timestamp: guard.selected_fact.timestamp,
      };
      traceFingerprint = {
        checked: collector.candidate_facts.length > 0,
        matched: true,
        compared_episodes: collector.candidate_facts.length,
        idempotency_key: output.result?.window.idempotency_key,
        matched_episode_timestamp: guard.selected_fact.timestamp,
        reason: reasoned.rationale.summary,
      };
      decision = {
        resolution_mode: output.resolution_summary.mode,
        write_outcome: traceWrite.outcome,
        category: reasoned.request_type,
      };
    } else if (guard.outcome === 'generate_new_fact' && guard.generated_fact) {
        const generated = materializeGeneratedCandidate(
          window,
          sources,
          guard.generated_fact,
          guard.generated_fact.reason || reasoned.rationale.summary || 'llm-guided semantic timeline synthesis',
        );
        traceAppearance = generated.appearance;
        const generatedCalendarDate = calendarDateFromTimestamp(generated.parsed.timestamp);
        const requestedPath = deps.memoryFilePath
          ? deps.memoryFilePath(generatedCalendarDate)
          : `memory/${generatedCalendarDate}.md`;

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
          filePath = assertCanonicalDailyLogPath(
            requestedPath,
            generatedCalendarDate,
            deps.canonicalRootName || 'memory',
          );
          writeResult = deps.writeEpisode
            ? await withFileLock(filePath, async () =>
                deps.writeEpisode!({
                  timestamp: generated.parsed.timestamp,
                  location: generated.parsed.location,
                  action: generated.parsed.action,
                  emotionTags: generated.parsed.emotionTags,
                  appearance: generated.parsed.appearance,
                  internalMonologue: generated.parsed.internalMonologue,
                  filePath,
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
          writer: 'stella-timeline-plugin',
        };
        traceFingerprint = {
          checked: true,
          matched: false,
          compared_episodes: collector.candidate_facts.length,
          idempotency_key: normalizedWriteResult.idempotency_key || generated.idempotencyKey,
          reason: generated.generationReason,
        };
        decision = {
          resolution_mode: resolutionMode,
          write_outcome: normalizedWriteResult.outcome,
          category: normalizedWriteResult.success ? reasoned.request_type : 'write_failure',
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
              calendar_date: generatedCalendarDate,
              preset: window.query_range,
              semantic_target: window.semantic_target,
              collection_scope: window.collection_scope,
              start: window.start,
              end: window.end,
              idempotency_key: normalizedWriteResult.idempotency_key || generated.idempotencyKey,
            },
            resolution: {
              mode: resolutionMode,
              notes: [...buildReasonerNotes(reasoned), resolutionNotes].join(' | '),
            },
            consumption: buildConsumptionView({
              preset: window.query_range,
              semanticTarget: window.semantic_target,
              collectionScope: window.collection_scope,
              resolutionMode,
              reasoned,
              episode: generated.episode,
              sourceType: normalizedWriteResult.success ? 'generated' : 'generated',
            }),
            episodes: [generated.episode],
          },
          notes: buildReasonerNotes(reasoned).concat(
            generated.notes,
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
    } else {
      output = buildEmptyOutput('', window, collector, reasoned);
      traceAppearance = {
        inherited: false,
        reason: 'no-canon-hit',
      };
      traceWrite = {
        attempted: false,
        succeeded: false,
        guard: 'not_attempted',
        outcome: 'not_attempted',
        writer: 'stella-timeline-plugin',
      };
      traceFingerprint = {
        checked: false,
        matched: false,
        compared_episodes: collector.candidate_facts.length,
        reason: reasoned.rationale.summary,
      };
      decision = {
        resolution_mode: output.resolution_summary.mode,
        write_outcome: traceWrite.outcome,
        category: reasoned.request_type,
      };
    }

    const trace = buildTrace({
      requested_range: requestedRange,
      actual_range: window.semantic_target,
      source_order: sources.sourceOrder,
      source_summary: {
        sessions_history_count: sources.sessionsHistory.length,
        sessions_history_preview: sources.sessionsHistory[0] || null,
        memory_chars: sources.dailyLogs.reduce((total, entry) => total + entry.raw_content.length, 0),
        memory_search_count: sources.memorySearch.length,
        memory_search_preview: sources.memorySearch.slice(0, 3),
        parsed_episode_count: collector.candidate_facts.length,
        selected_episode_timestamp: guard.selected_fact?.timestamp,
      },
      fingerprint: traceFingerprint,
      appearance: traceAppearance,
      write: traceWrite,
      decision,
      notes: output.notes,
    });
    output.trace_id = trace.trace_id;
    output.trace = trace;
    return finalizeTimelineOutput(output, input, deps, requestedRange);
  } catch (error: any) {
    const timelineError = error instanceof Error ? error : new Error(String(error));
    const errorCode = classifyTimelineResolveError(timelineError);
    const trace = buildTrace({
      requested_range: requestedRange,
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
        writer: 'stella-timeline-plugin',
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

    return finalizeTimelineOutput(output, input, deps, requestedRange);
  }
}

export const timelineResolveToolSpec = {
  name: 'timeline_resolve',
  description:
    '处理“你在干嘛”“你现在在哪”“最近有什么有趣的事吗”“昨晚八点你在做什么”这类时间现实与回忆问题的统一入口；直接接收自然语言 query，内部会先理解时间语义，再检索或生成并 append-only 写入 canon。',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  run: timelineResolve,
};
