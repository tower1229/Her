import { TimelineGuardResult, validateTimelineReasonerOutput } from './runtime_guard';
import { TimelineCollectorOutput, TimelineReasonerOutput } from './timeline_reasoner_contract';

export interface ReasonWithPolicyInput {
  collector: TimelineCollectorOutput;
  mode: 'read_only' | 'allow_generate';
  reasonTimeline: (collector: TimelineCollectorOutput) => Promise<TimelineReasonerOutput | null>;
}

export interface ReasonWithPolicyResult {
  reasoned: TimelineReasonerOutput;
  guard: TimelineGuardResult;
}

function withRecoveryHint(
  collector: TimelineCollectorOutput,
  hint: NonNullable<TimelineCollectorOutput['request']['recovery_hint']>,
): TimelineCollectorOutput {
  return {
    ...collector,
    request: {
      ...collector.request,
      recovery_hint: hint,
    },
  };
}

function buildFallbackEmptyReasoner(
  collector: TimelineCollectorOutput,
  uncertainty?: string,
): TimelineReasonerOutput {
  return {
    schema_version: '1.0',
    request_id: collector.request_id,
    request_type: collector.window.query_range,
    decision: {
      action: 'return_empty',
      should_write_canon: false,
    },
    continuity: {
      judged: true,
      is_continuing: false,
      reason: 'candidate facts were empty, and recovery generation was not validated',
    },
    rationale: {
      summary: 'No reusable canon facts were available; this memory remains unrecoverable for now.',
      hard_fact_basis: collector.hard_facts.sessions_history.slice(0, 2),
      canon_basis: [],
      persona_basis: [],
      constraint_basis: [],
      uncertainty,
    },
  };
}

export async function reasonWithPolicy(input: ReasonWithPolicyInput): Promise<ReasonWithPolicyResult> {
  const { collector, mode, reasonTimeline } = input;
  let reasoned = await reasonTimeline(collector);
  if (!reasoned) {
    throw new Error('Timeline reasoner returned no decision');
  }
  let guard = validateTimelineReasonerOutput(collector, reasoned);

  if (
    !guard.ok
    && guard.block_reason === 'reasoner selected_fact_id not found in collector candidate_facts'
    && collector.candidate_facts.length === 0
    && mode === 'allow_generate'
  ) {
    const retryCollector = withRecoveryHint(collector, 'no_reuse_allowed');
    const retried = await reasonTimeline(retryCollector);
    if (!retried) {
      reasoned = buildFallbackEmptyReasoner(collector, 'reasoner returned no decision during guard recovery');
      guard = validateTimelineReasonerOutput(collector, reasoned);
    } else {
      const retriedGuard = validateTimelineReasonerOutput(retryCollector, retried);
      if (retriedGuard.ok) {
        reasoned = retried;
        guard = retriedGuard;
      } else {
        reasoned = buildFallbackEmptyReasoner(collector, retriedGuard.block_reason);
        guard = validateTimelineReasonerOutput(collector, reasoned);
      }
    }
  }

  if (!guard.ok) {
    throw new Error(`Invalid reasoner output: ${guard.block_reason}`);
  }

  if (mode === 'allow_generate' && guard.outcome === 'return_empty') {
    const retryCollector = withRecoveryHint(collector, 'prefer_generation');
    const retried = await reasonTimeline(retryCollector);
    if (retried) {
      const retriedGuard = validateTimelineReasonerOutput(retryCollector, retried);
      if (retriedGuard.ok && retriedGuard.outcome === 'generate_new_fact') {
        reasoned = retried;
        guard = retriedGuard;
      }
    }
  }

  return { reasoned, guard };
}

