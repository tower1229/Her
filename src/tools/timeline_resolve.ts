import * as path from 'path';
import { collectSources, TimelineSourceDependencies } from '../core/collect_sources';
import { buildTimelineCollectorOutput } from '../core/collect_timeline_request';
import { TimelineCollectorOutput, TimelineReasonerOutput } from '../core/timeline_reasoner_contract';
import { buildTrace, makeTraceId, TimelineTrace } from '../core/trace';
import {
  TimelineResolutionMode as TimelineResolutionModeContract,
  TimelineResolveSuccessContract,
} from '../core/timeline_output_contract';
import {
  buildEmptyOutput,
  buildForgetfulnessNotes,
  buildGeneratedOutput,
  buildReadOnlyHitOutput,
} from '../core/build_timeline_output';
import { executeGeneratedWrite, classifyWriteFailure } from '../core/execute_write';
import { reasonWithPolicy } from '../core/reason_with_policy';
import { formatDate, parseTimestampParts } from '../lib/time-utils';
import { appendTraceLog } from '../storage/trace_log';
import { writeEpisode, WriteEpisodeInput, WriteResult } from '../storage/write-episode';
import { resolveWindow, TimelineQueryPlan } from '../core/resolve_window';
import { loadTimelinePersonaContractFromWorkspace } from '../persona/load_persona_contract';
import { LegacyPersonaContractExtractor } from '../persona/extract_legacy_persona_contract';

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

export type TimelineResolutionMode = TimelineResolutionModeContract;

export interface TimelineResolveInput {
  query?: string;
  mode?: TimelineResolveMode;
  trace?: boolean;
}

export interface TimelineResolveSuccessOutput extends TimelineResolveSuccessContract {
  trace?: TimelineTrace;
}

export interface TimelineResolveFailureOutput {
  ok: false;
  schema_version: '1.0';
  trace_id: string;
  resolution_summary: TimelineResolveSuccessContract['resolution_summary'];
  result?: TimelineResolveSuccessContract['result'];
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
  extractLegacyPersonaContract?: LegacyPersonaContractExtractor;
  personaCacheDirName?: string;
  personaExtractionMaxAttempts?: number;
  planTimelineQuery?: (input: TimelineResolveInput, anchor: { now: string; timezone: string }) => Promise<TimelineQueryPlan>;
  reasonTimeline?: (collector: TimelineCollectorOutput) => Promise<TimelineReasonerOutput | null>;
}

function createDefaultDependencies(
  overrides: Partial<TimelineRuntimeDependencies> = {},
): TimelineRuntimeDependencies {
  const deps: TimelineRuntimeDependencies = {
    currentTime: async () => ({
      now: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }),
    sessionsHistory: async () => [],
    memoryGet: async () => '',
    memorySearch: async () => [],
    writeEpisode,
    memoryFilePath: (calendarDate: string) => `memory/${calendarDate}.md`,
    canonicalRootName: 'memory',
    traceLogPath: path.join(process.cwd(), '.timeline-cache', 'stella-timeline-plugin-trace.log'),
    personaCacheDirName: '.timeline-cache/persona-contract',
    personaExtractionMaxAttempts: 3,
  };

  const merged = { ...deps, ...overrides };
  if (!merged.personaContext) {
    merged.personaContext = async () => {
      const loaded = await loadTimelinePersonaContractFromWorkspace(process.cwd(), {
        extractLegacyPersonaContract: merged.extractLegacyPersonaContract,
        cacheDirName: merged.personaCacheDirName,
        maxAttempts: merged.personaExtractionMaxAttempts,
      });
      return {
        contract: loaded.contract,
        available_sources: loaded.available_sources,
        should_constrain_generation: loaded.should_constrain_generation,
      };
    };
  }
  return merged;
}

let runtimeDependencies: TimelineRuntimeDependencies = createDefaultDependencies();

export function setTimelineResolveDependencies(deps: Partial<TimelineRuntimeDependencies>): void {
  runtimeDependencies = createDefaultDependencies({ ...runtimeDependencies, ...deps });
}

export function resetTimelineResolveDependencies(): void {
  runtimeDependencies = createDefaultDependencies();
}

function getEffectiveTimelineDependencies(
  overrides?: Partial<TimelineRuntimeDependencies>,
): TimelineRuntimeDependencies {
  return createDefaultDependencies({
    ...runtimeDependencies,
    ...overrides,
  });
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
  if (
    message.includes('Timeline reasoner returned mismatched request_id')
    || message.includes('Timeline reasoner did not return a JSON object')
    || message.includes('Timeline reasoner did not return a parseable JSON object')
    || message.includes('Timeline query planner returned mismatched request_id')
    || message.includes('Timeline query planner did not return a JSON object')
    || message.includes('Timeline query planner did not return a parseable JSON object')
  ) {
    return 'INVALID_REASONER_OUTPUT';
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

function calendarDateFromTimestamp(timestamp: string): string {
  const parts = parseTimestampParts(timestamp);
  if (!parts) throw new Error(`Generated timestamp is not parseable: ${timestamp}`);
  return formatDate(parts);
}

function persistTraceIfConfigured(
  output: TimelineResolveOutput,
  input: TimelineResolveInput,
  deps: TimelineRuntimeDependencies,
  requestedRange: string,
): boolean {
  if (!deps.traceLogPath) return false;

  try {
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
  } catch {
    return false;
  }

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


function buildDegradedForgetfulnessOutput(opts: {
  requestedRange: string;
  sourceOrder: string[];
  timezone: string;
  errorCode: TimelineResolveErrorCode;
  errorMessage: string;
}): TimelineResolveSuccessOutput {
  const { requestedRange, sourceOrder, timezone, errorCode, errorMessage } = opts;
  const traceId = makeTraceId();
  const nowIso = new Date().toISOString();
  const forgetfulnessNote = '这段时间的事有些模糊，记不太清了。';
  // output.notes only contains the user-facing forgetfulness note.
  // The raw error message is kept in trace.notes only, to avoid polluting downstream prompts.
  const traceNotes = [forgetfulnessNote, errorMessage];
  const trace = buildTrace({
    requested_range: requestedRange,
    actual_range: 'error_degraded',
    source_order: sourceOrder,
    source_summary: {
      sessions_history_count: 0,
      sessions_history_preview: null,
      memory_chars: 0,
      memory_search_count: 0,
      memory_search_preview: [],
      parsed_episode_count: 0,
    },
    fingerprint: { checked: false, matched: false, compared_episodes: 0, reason: errorMessage },
    appearance: { inherited: false, reason: 'error-degraded' },
    write: { attempted: false, succeeded: false, guard: 'not_attempted', outcome: 'not_attempted', writer: 'stella-timeline-plugin' },
    decision: { resolution_mode: 'empty_window', write_outcome: 'not_attempted', category: 'error_degraded', error_code: errorCode },
    notes: traceNotes,
  }, traceId);
  const effectiveTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    ok: true,
    schema_version: '1.0',
    trace_id: traceId,
    resolution_summary: {
      mode: 'empty_window',
      writes_attempted: 0,
      writes_succeeded: 0,
      sources: sourceOrder,
      confidence_min: 0,
      confidence_max: 0,
    },
    result: {
      schema_version: '1.0',
      document_type: 'timeline.window',
      anchor: { now: nowIso, timezone: effectiveTimezone },
      window: {
        calendar_date: nowIso.slice(0, 10),
        preset: requestedRange,
        semantic_target: requestedRange,
        collection_scope: 'today_so_far',
        start: nowIso,
        end: nowIso,
        idempotency_key: 'none',
      },
      resolution: { mode: 'empty_window', notes: forgetfulnessNote },
      consumption: {
        schema_version: '1.0',
        document_type: 'timeline.consumption',
        query: {
          preset: requestedRange,
          semantic_target: requestedRange,
          collection_scope: 'today_so_far',
          resolution_mode: 'empty_window',
        },
        fact: {
          status: 'empty',
          source_type: 'none',
        },
      },
      episodes: [],
    },
    notes: [forgetfulnessNote],
    trace,
  };
}

export async function timelineResolve(
  input: TimelineResolveInput,
  dependencyOverrides?: Partial<TimelineRuntimeDependencies>,
): Promise<TimelineResolveOutput> {
  const deps = getEffectiveTimelineDependencies(dependencyOverrides);
  let sourceOrder: string[] = [];
  let requestedRange = 'unknown';
  let timezone = '';

  try {
    validateTimelineResolveInput(input);
    const traceId = makeTraceId();

    const currentTime = await deps.currentTime();
    timezone = currentTime.timezone;
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
    const reasonResult = await reasonWithPolicy({
      collector,
      mode: normalizeMode(input.mode),
      reasonTimeline: deps.reasonTimeline,
    });
    let reasoned = reasonResult.reasoned;
    let guard = reasonResult.guard;

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
      output = buildReadOnlyHitOutput({
        traceId,
        selectedFact: guard.selected_fact,
        window,
        collector,
        reasoned,
      });
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
        const writeExecution = await executeGeneratedWrite({
          window,
          sources,
          collector,
          generatedFact: guard.generated_fact,
          generationReason: guard.generated_fact.reason || reasoned.rationale.summary || 'llm-guided semantic timeline synthesis',
          deps: {
            memoryFilePath: deps.memoryFilePath,
            canonicalRootName: deps.canonicalRootName,
            writeEpisode: deps.writeEpisode,
          },
          calendarDateFromTimestamp,
        });
        const {
          generated,
          generatedCalendarDate,
          filePath,
          normalizedWriteResult,
          writeGuard,
        } = writeExecution;
        traceAppearance = generated.appearance;
        const failedWrite = !normalizedWriteResult.success ? classifyWriteFailure(normalizedWriteResult) : null;

        const resolutionMode: TimelineResolutionMode = normalizedWriteResult.success
          ? normalizedWriteResult.outcome === 'noop_existing'
            ? 'already_present'
            : 'generated_new'
          : failedWrite?.mode ?? 'write_failed';
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

        output = buildGeneratedOutput({
          traceId,
          window,
          collector,
          reasoned,
          resolutionMode,
          generated,
          generatedCalendarDate,
          filePath,
          normalizedWriteResult,
          sources: sources.sourceOrder,
        });
    } else {
      output = buildEmptyOutput({
        traceId,
        window,
        collector,
        reasoned,
        notesOverride: normalizeMode(input.mode) === 'allow_generate'
          ? buildForgetfulnessNotes(reasoned, window)
          : undefined,
      });
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
    }, traceId);
    output.trace = trace;
    return finalizeTimelineOutput(output, input, deps, requestedRange);
  } catch (error: any) {
    const timelineError = error instanceof Error ? error : new Error(String(error));
    const errorCode = classifyTimelineResolveError(timelineError);

    if (errorCode === 'INVALID_INPUT') {
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
        fingerprint: { checked: false, matched: false, compared_episodes: 0, reason: timelineError.message },
        appearance: { inherited: false, reason: 'error' },
        write: { attempted: false, succeeded: false, guard: 'not_attempted', outcome: 'not_attempted', writer: 'stella-timeline-plugin' },
        decision: { resolution_mode: 'error', write_outcome: 'not_attempted', category: 'error', error_code: errorCode },
        notes: [timelineError.message],
      });
      const output: TimelineResolveFailureOutput = {
        ok: false,
        schema_version: '1.0',
        trace_id: trace.trace_id,
        resolution_summary: { mode: 'error', writes_attempted: 0, writes_succeeded: 0, sources: sourceOrder, confidence_min: 0, confidence_max: 0 },
        notes: [timelineError.message],
        error: { code: errorCode, message: timelineError.message },
        trace,
      };
      return finalizeTimelineOutput(output, input, deps, requestedRange);
    }

    return finalizeTimelineOutput(
      buildDegradedForgetfulnessOutput({ requestedRange, sourceOrder, timezone, errorCode, errorMessage: timelineError.message }),
      input,
      deps,
      requestedRange,
    );
  }
}

export const timelineResolveToolSpec = {
  name: 'timeline_resolve',
  description:
    'Unified entry point for time-grounded reality and recall questions such as “你在干嘛”, “你现在在哪”, “最近有什么有趣的事吗”, “昨晚八点你在做什么”, or reflective autobiographical recall like “最近一次知道自己错了是什么场景”. Use it whenever answering requires locating the agent on a timeline, recalling what was happening at some time, selecting the most recent/previous occurrence of an event, or judging whether a prior state was still continuing. It accepts a natural-language query, interprets the time semantics internally, then retrieves or generates and append-only writes canon facts.',
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
