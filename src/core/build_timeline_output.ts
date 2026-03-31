import { buildConsumptionView, defaultDurationForActivityMode } from './build_consumption_view';
import { CollectedTimelineFact, TimelineCollectorOutput, TimelineReasonerOutput } from './timeline_reasoner_contract';
import { mapToEpisode } from '../lib/parse-memory';
import { computeFingerprint } from '../lib/fingerprint';
import { TimelineTrace } from './trace';
import { ResolvedWindow } from './resolve_window';
import { dayOfWeek, formatDate, parseTimestampParts } from '../lib/time-utils';
import { getHoliday } from '../lib/holidays';
import { inferCountryFromOffset } from '../lib/country';
import { TimelineResolveSuccessContract, TimelineResolutionMode } from './timeline_output_contract';
import { WriteResult } from '../storage/write-episode';
import { Episode, ParsedEpisode } from '../lib/types';

type TimelineOutputWindowView = Pick<
  ResolvedWindow,
  'calendar_date' | 'query_range' | 'semantic_target' | 'collection_scope' | 'start' | 'end' | 'timezone'
>;

type GeneratedOutputPayload = {
  parsed: { confidence: number };
  episode: Episode;
  idempotencyKey: string;
  notes: string[];
};

function buildWorldHooks(timestamp: string): { weekday: boolean; holiday_key: string | null } {
  const parts = parseTimestampParts(timestamp);
  if (!parts) {
    return { weekday: true, holiday_key: null };
  }
  const date = formatDate(parts);
  return {
    weekday: ![0, 6].includes(dayOfWeek(parts)),
    holiday_key: getHoliday(date, inferCountryFromOffset(parts.offset)),
  };
}

export function buildReasonerNotes(reasoned: TimelineReasonerOutput): string[] {
  const notes = [reasoned.rationale.summary];
  const interpretation = reasoned.time_interpretation?.summary?.trim();
  if (interpretation) {
    notes.push(`Time interpretation: ${interpretation}`);
  }
  return notes;
}

export function buildForgetfulnessNotes(
  reasoned: TimelineReasonerOutput,
  window: { start: string; end: string },
): string[] {
  const notes = buildReasonerNotes(reasoned);
  return [
    ...notes,
    `目标时间窗 ${window.start} -> ${window.end} 缺少可复用事实；当前保持诚实表达：这段经历记不清了。`,
  ];
}

export function buildReadOnlyHitOutput(input: {
  traceId: string;
  selectedFact: CollectedTimelineFact;
  window: TimelineOutputWindowView;
  collector: TimelineCollectorOutput;
  reasoned: TimelineReasonerOutput;
}): TimelineResolveSuccessContract {
  const { traceId, selectedFact, window, collector } = input;
  let { reasoned } = input;
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

  if (selectedFact.has_parent_event && selectedFact.parent_event_tag && !reasoned.generated_fact) {
    reasoned = {
      ...reasoned,
      generated_fact: {
        location: selectedFact.location,
        action: selectedFact.action,
        emotionTags: selectedFact.emotion_tags,
        appearance: selectedFact.appearance,
        internalMonologue: selectedFact.internal_monologue || '',
        confidence: selectedFact.confidence,
        sceneSemantics: {
          activityMode: 'unknown' as const,
          continuityRelation: 'same_day_continuation' as const,
          rationale: 'read_only_hit stub for parent event passthrough',
          parentEventTag: selectedFact.parent_event_tag,
          parentEventPhase: selectedFact.parent_event_phase,
          parentEventProgress: selectedFact.parent_event_progress,
        },
      },
    };
  }

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
        anchorTimezone: window.timezone,
        collector,
        reasoned,
        episode,
        sourceType: 'canon',
        eventId: selectedFact.event_id,
      }),
      episodes: [episode],
    },
    notes: buildReasonerNotes(reasoned),
  };
}

export function buildEmptyOutput(input: {
  traceId: string;
  window: TimelineOutputWindowView;
  collector: TimelineCollectorOutput;
  reasoned: TimelineReasonerOutput;
  notesOverride?: string[];
}): TimelineResolveSuccessContract {
  const notes = input.notesOverride ?? buildReasonerNotes(input.reasoned);
  return {
    ok: true,
    schema_version: '1.0',
    trace_id: input.traceId,
    resolution_summary: {
      mode: 'empty_window',
      writes_attempted: 0,
      writes_succeeded: 0,
      sources: input.collector.source_order,
      confidence_min: 0,
      confidence_max: 0,
    },
    result: {
      schema_version: '1.0',
      document_type: 'timeline.window',
      anchor: { now: input.window.end, timezone: input.window.timezone },
      window: {
        calendar_date: input.window.calendar_date,
        preset: input.window.query_range,
        semantic_target: input.window.semantic_target,
        collection_scope: input.window.collection_scope,
        start: input.window.start,
        end: input.window.end,
        idempotency_key: 'none',
      },
      resolution: {
        mode: 'empty_window',
        notes: notes.join(' | '),
      },
      consumption: buildConsumptionView({
        preset: input.window.query_range,
        semanticTarget: input.window.semantic_target,
        collectionScope: input.window.collection_scope,
        resolutionMode: 'empty_window',
        anchorTimezone: input.window.timezone,
        collector: input.collector,
        reasoned: input.reasoned,
        sourceType: 'none',
      }),
      episodes: [],
    },
    notes,
  };
}

function deriveEventIdFromTimestamp(isoTimestamp: string): string {
  const match = isoTimestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return `evt-unknown-${Date.now()}`;
  return `evt-${match[1]}${match[2]}${match[3]}-${match[4]}${match[5]}${match[6]}`;
}

export function buildGeneratedOutput(input: {
  traceId: string;
  window: TimelineOutputWindowView;
  collector: TimelineCollectorOutput;
  reasoned: TimelineReasonerOutput;
  resolutionMode: TimelineResolutionMode;
  generated: GeneratedOutputPayload;
  generatedCalendarDate: string;
  filePath: string;
  normalizedWriteResult: WriteResult;
  sources: string[];
}): TimelineResolveSuccessContract {
  const resolutionNotes = input.normalizedWriteResult.success
    ? input.normalizedWriteResult.outcome === 'noop_existing'
      ? 'a matching canon entry already existed, so the append-only writer skipped the write'
      : 'generated candidate persisted via append-only writer'
    : input.normalizedWriteResult.error;

  return {
    ok: true,
    schema_version: '1.0',
    trace_id: input.traceId,
    resolution_summary: {
      mode: input.resolutionMode,
      writes_attempted: 1,
      writes_succeeded: input.normalizedWriteResult.success && input.normalizedWriteResult.outcome === 'appended' ? 1 : 0,
      sources: input.sources,
      confidence_min: input.generated.parsed.confidence,
      confidence_max: input.generated.parsed.confidence,
    },
    result: {
      schema_version: '1.0',
      document_type: 'timeline.window',
      anchor: { now: input.window.end, timezone: input.window.timezone },
      window: {
        calendar_date: input.generatedCalendarDate,
        preset: input.window.query_range,
        semantic_target: input.window.semantic_target,
        collection_scope: input.window.collection_scope,
        start: input.window.start,
        end: input.window.end,
        idempotency_key: input.normalizedWriteResult.idempotency_key || input.generated.idempotencyKey,
      },
      resolution: {
        mode: input.resolutionMode,
        notes: [...buildReasonerNotes(input.reasoned), resolutionNotes].join(' | '),
      },
      consumption: buildConsumptionView({
        preset: input.window.query_range,
        semanticTarget: input.window.semantic_target,
        collectionScope: input.window.collection_scope,
        resolutionMode: input.resolutionMode,
        anchorTimezone: input.window.timezone,
        collector: input.collector,
        reasoned: input.reasoned,
        episode: input.generated.episode,
        sourceType: 'generated',
        eventId: deriveEventIdFromTimestamp(input.generated.episode.temporal.start),
      }),
      episodes: [input.generated.episode],
    },
    notes: buildReasonerNotes(input.reasoned).concat(
      input.generated.notes,
      input.normalizedWriteResult.success
        ? input.normalizedWriteResult.outcome === 'noop_existing'
          ? [`A matching canon entry was already present at ${input.filePath}; append skipped.`]
          : [`Generated episode persisted to ${input.filePath}.`]
        : [
            `Generation attempted but write failed: ${input.normalizedWriteResult.error ?? 'unknown error'}.`,
            ...(input.normalizedWriteResult.recovery_hint ? [`Recovery hint: ${input.normalizedWriteResult.recovery_hint}`] : []),
          ],
    ),
  };
}

export function buildTraceDefaults(input: {
  collector: TimelineCollectorOutput;
  reasoned: TimelineReasonerOutput;
  mode: TimelineResolutionMode;
}): {
  appearance: TimelineTrace['appearance'];
  write: TimelineTrace['write'];
  fingerprint: TimelineTrace['fingerprint'];
  decision: TimelineTrace['decision'];
} {
  return {
    appearance: { inherited: false, reason: 'not-applicable' },
    write: {
      attempted: false,
      succeeded: false,
      guard: 'not_attempted',
      outcome: 'not_attempted',
      writer: 'stella-timeline-plugin',
    },
    fingerprint: {
      checked: input.collector.candidate_facts.length > 0,
      matched: false,
      compared_episodes: input.collector.candidate_facts.length,
      reason: input.reasoned.rationale.summary,
    },
    decision: {
      resolution_mode: input.mode,
      write_outcome: 'not_attempted',
      category: input.reasoned.request_type,
    },
  };
}

export function buildReadOnlyFastOutput(input: {
  traceId: string;
  parsed: ParsedEpisode;
  calendarDate: string;
  now: string;
  timezone: string;
}): TimelineResolveSuccessContract {
  const { traceId, parsed, calendarDate, now, timezone } = input;
  const fp = computeFingerprint(calendarDate, parsed.location, parsed.action, parsed.timestamp);
  const worldHooks = buildWorldHooks(parsed.timestamp);
  const episode = mapToEpisode(parsed, worldHooks, fp);
  const durationFromParsed = parsed.estimatedDurationMinutes;
  const hasParentEvent = Boolean(parsed.parentEventTag);
  const stubGeneratedFact = hasParentEvent ? {
    location: parsed.location,
    action: parsed.action,
    emotionTags: parsed.emotionTags,
    appearance: parsed.appearance,
    internalMonologue: parsed.internalMonologue || '',
    confidence: parsed.confidence,
    sceneSemantics: {
      activityMode: 'unknown' as const,
      continuityRelation: 'same_day_continuation' as const,
      rationale: 'read_only_fast stub for parent event passthrough',
      estimatedDurationMinutes: durationFromParsed,
      parentEventTag: parsed.parentEventTag,
      parentEventPhase: parsed.parentEventPhase,
      parentEventProgress: parsed.parentEventProgress,
    },
  } : undefined;
  const stubReasoned: TimelineReasonerOutput = {
    schema_version: '1.0',
    request_id: `fast-${traceId}`,
    request_type: 'now',
    time_interpretation: {
      normalized_kind: 'now',
      match_strategy: 'continuation',
      summary: 'read_only_fast hit from canon daily log.',
    },
    decision: {
      action: 'reuse_existing_fact',
      selected_fact_id: `canon:${calendarDate}:fast`,
      should_write_canon: false,
    },
    continuity: {
      judged: true,
      is_continuing: true,
      reason: 'Fast-path reuse of unexpired canon fact.',
    },
    estimated_duration_minutes: durationFromParsed,
    rationale: {
      summary: 'read_only_fast: reused the latest unexpired canon fact without LLM reasoning.',
      hard_fact_basis: [],
      canon_basis: [`canon:${calendarDate}:fast`],
      persona_basis: [],
      constraint_basis: [],
    },
    generated_fact: stubGeneratedFact,
  };

  return {
    ok: true,
    schema_version: '1.0',
    trace_id: traceId,
    resolution_summary: {
      mode: 'read_only_fast_hit',
      writes_attempted: 0,
      writes_succeeded: 0,
      sources: ['memory_get'],
      confidence_min: parsed.confidence,
      confidence_max: parsed.confidence,
    },
    result: {
      schema_version: '1.0',
      document_type: 'timeline.window',
      anchor: { now, timezone },
      window: {
        calendar_date: calendarDate,
        preset: 'now',
        semantic_target: 'now',
        collection_scope: 'today_so_far',
        start: parsed.timestamp,
        end: now,
        idempotency_key: fp,
      },
      resolution: {
        mode: 'read_only_fast_hit',
        notes: 'read_only_fast hit from canon daily log.',
      },
      consumption: buildConsumptionView({
        preset: 'now',
        semanticTarget: 'now',
        collectionScope: 'today_so_far',
        resolutionMode: 'read_only_fast_hit',
        anchorTimezone: timezone,
        reasoned: stubReasoned,
        episode,
        sourceType: 'canon',
        eventId: parsed.eventId,
      }),
      episodes: [episode],
    },
    notes: ['read_only_fast: reused the latest unexpired canon fact.'],
  };
}

const FAST_EMPTY_DEBOUNCE_MINUTES = 30;

export function buildReadOnlyFastEmptyOutput(input: {
  traceId: string;
  now: string;
  timezone: string;
  calendarDate: string;
}): TimelineResolveSuccessContract {
  const { traceId, now, timezone, calendarDate } = input;
  return {
    ok: true,
    schema_version: '1.0',
    trace_id: traceId,
    resolution_summary: {
      mode: 'empty_window',
      writes_attempted: 0,
      writes_succeeded: 0,
      sources: ['memory_get'],
      confidence_min: 0,
      confidence_max: 0,
    },
    result: {
      schema_version: '1.0',
      document_type: 'timeline.window',
      anchor: { now, timezone },
      window: {
        calendar_date: calendarDate,
        preset: 'now',
        semantic_target: 'now',
        collection_scope: 'today_so_far',
        start: now,
        end: now,
        idempotency_key: 'none',
      },
      resolution: {
        mode: 'empty_window',
        notes: 'read_only_fast: no unexpired canon fact found.',
      },
      consumption: {
        schema_version: '1.0',
        document_type: 'timeline.consumption',
        query: {
          preset: 'now',
          semantic_target: 'now',
          collection_scope: 'today_so_far',
          resolution_mode: 'empty_window',
        },
        fact: {
          status: 'empty',
          source_type: 'none',
          summary: 'read_only_fast: no active scene.',
        },
        scene: {
          location: '',
          activity: '',
          emotion_primary: null,
          emotion_secondary: null,
          appearance: '',
          time_of_day: '',
          summary: '',
          estimated_duration_minutes: FAST_EMPTY_DEBOUNCE_MINUTES,
        },
      },
      episodes: [],
    },
    notes: ['read_only_fast: no unexpired canon fact found; debounce for 30 minutes.'],
  };
}

