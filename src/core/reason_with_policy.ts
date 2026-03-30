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

export async function reasonWithPolicy(input: ReasonWithPolicyInput): Promise<ReasonWithPolicyResult> {
  const { collector, mode, reasonTimeline } = input;

  const effectiveCollector =
    collector.candidate_facts.length === 0 && mode === 'allow_generate'
      ? withRecoveryHint(collector, 'no_reuse_allowed')
      : collector;

  let reasoned = await reasonTimeline(effectiveCollector);
  if (!reasoned) {
    throw new Error('Timeline reasoner returned no decision');
  }
  let guard = validateTimelineReasonerOutput(effectiveCollector, reasoned);

  if (
    !guard.ok
    && guard.block_reason === 'reasoner selected_fact_id not found in collector candidate_facts'
    && collector.candidate_facts.length === 0
    && mode === 'allow_generate'
  ) {
    const retryCollector = withRecoveryHint(collector, 'no_reuse_allowed');
    const retried = await reasonTimeline(retryCollector);
    if (!retried) {
      throw new Error('Timeline reasoner returned no decision during guard recovery');
    }
    const retriedGuard = validateTimelineReasonerOutput(retryCollector, retried);
    if (retriedGuard.ok) {
      reasoned = retried;
      guard = retriedGuard;
    } else {
      throw new Error(`Guard recovery failed: ${retriedGuard.block_reason}`);
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
