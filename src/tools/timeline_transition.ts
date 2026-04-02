import { TimelineTransitionInput, TimelineTransitionOutput, TransitionPlan } from '../core/transition_planner_contract';
import { collectActiveFacts } from '../core/collect_active_facts';
import { makeTraceId } from '../core/trace';
import { truncateEpisodeDuration } from '../storage/write-episode';
import { formatDate, parseTimestampParts, addMinutesToTimestampString } from '../lib/time-utils';
import { TimelineRuntimeDependencies } from './timeline_resolve';
import { buildTransitionTrace, TimelineTransitionTrace } from '../core/trace';
import { appendTraceLog } from '../storage/trace_log';
import { halfHourTimelineBucket } from '../lib/fingerprint';
import { parseMemoryFile } from '../lib/parse-memory';
import * as fs from 'fs';

export interface TimelineTransitionDependencies extends TimelineRuntimeDependencies {
  planTransition?: (
    input: TimelineTransitionInput,
    anchor: { now: string; timezone: string },
    persona: any,
    activeFacts: any[]
  ) => Promise<TransitionPlan>;
}

/** Finds all event IDs in the same 30-minute bucket as targetTimestamp on the target date. */
function getBucketMateIds(filePath: string, targetTimestamp: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const episodes = parseMemoryFile(content);
    const targetBucket = halfHourTimelineBucket(targetTimestamp);
    return episodes
      .filter((ep) => halfHourTimelineBucket(ep.timestamp) === targetBucket)
      .map((ep) => ep.eventId)
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
}

function persistTransitionTraceIfConfigured(
  output: TimelineTransitionOutput,
  input: TimelineTransitionInput,
  deps: TimelineTransitionDependencies,
): boolean {
  if (!deps.traceLogPath || !output.trace) return false;

  try {
    appendTraceLog(
      {
        trace_id: output.trace_id,
        event: 'timeline_transition',
        ts: new Date().toISOString(),
        payload: {
          ok: output.ok,
          directive: input.directive,
          notes: output.notes,
          trace: output.trace,
        },
      },
      deps.traceLogPath,
    );
  } catch {
    return false;
  }

  return true;
}

export async function timelineTransition(
  input: TimelineTransitionInput,
  deps: TimelineTransitionDependencies
): Promise<TimelineTransitionOutput> {
  const traceId = makeTraceId();
  try {
    if (!input.directive) {
      throw new Error('timeline_transition requires a directive');
    }

    const { now, timezone } = await deps.currentTime!();
    const personaCtx = await deps.personaContext!();
    
    // Look up to 7 days back for any still active events
    const activeFacts = await collectActiveFacts(
      (calendarDate) => deps.memoryGet!(calendarDate, {} as any, {} as any),
      now,
      7
    );

    if (!deps.planTransition) {
      throw new Error('Timeline transition planner dependency missing');
    }

    const plan = await deps.planTransition(input, { now, timezone }, personaCtx.contract, activeFacts);

    if (plan.interruption_handling === 'reject') {
      return {
        ok: false,
        trace_id: traceId,
        notes: [`Transition rejected manually: ${plan.reject_reason || 'Incompatible physical state constraints.'}`]
      };
    }

    const eventId = `trans-${Date.now()}`;
    const generatedWriteInput = {
      timestamp: plan.started_at || now,
      location: plan.initial_phase.location,
      action: plan.initial_phase.action,
      emotionTags: plan.initial_phase.emotionTags,
      appearance: plan.initial_phase.appearance,
      internalMonologue: plan.initial_phase.internalMonologue,
      estimatedDurationMinutes: plan.estimated_duration_minutes,
      eventId,
    };

    let sameBucketExemptEventIds: string[] | undefined;
    let truncateTarget: { filePath: string; eventId: string; timestamp: string } | undefined;

    const writeParts = parseTimestampParts(generatedWriteInput.timestamp);
    const writeDate = writeParts ? formatDate(writeParts) : generatedWriteInput.timestamp.slice(0, 10);
    const writeFilePath = deps.memoryFilePath!(writeDate);

    // Identify all bucket-mates that could cause CONFLICT_EXISTS. 
    // timeline_transition is an explicit world-state override, so it should exempt its own neighbors.
    const bucketMateIds = getBucketMateIds(writeFilePath, generatedWriteInput.timestamp);
    const activeFactIds = activeFacts.map(f => f.event_id).filter((id): id is string => Boolean(id));

    if (plan.interruption_handling === 'interrupt' && activeFacts.length > 0) {
      const interruptedFact = activeFacts[0];
      const calendarDate = interruptedFact.calendar_date;
      const filePath = deps.memoryFilePath!(calendarDate);
      
      // Exempt ALL bucket-mates found in the target window
      sameBucketExemptEventIds = Array.from(new Set([...bucketMateIds, ...activeFactIds]));
      
      if (interruptedFact.event_id) {
        // Defer truncation until AFTER the new write succeeds (atomicity)
        truncateTarget = { filePath, eventId: interruptedFact.event_id, timestamp: generatedWriteInput.timestamp };
      }
    } else if (plan.interruption_handling === 'insert_micro_task' && activeFacts.length > 0) {
      const parentEvent = activeFacts[0];
      sameBucketExemptEventIds = Array.from(new Set([...bucketMateIds, ...activeFactIds]));
      Object.assign(generatedWriteInput, {
        parentEventTag: parentEvent.event_id,
        parentEventPhase: 'micro_task',
        parentEventProgress: Math.min(1.0, (parentEvent.elapsed_minutes || 0) / (parentEvent.estimated_duration_minutes || 1)),
      });
    } else {
      // Even for normal transitions without an active interrupt, we exempt existing bucket mates 
      // to allow multiple transitions in 30 minutes.
      sameBucketExemptEventIds = bucketMateIds;
    }

    // Write the new transition episode
    const writeResult = await deps.writeEpisode!({
      ...generatedWriteInput,
      filePath: writeFilePath,
      sameBucketExemptEventIds,
    });

    const computedEndAt = addMinutesToTimestampString(
      generatedWriteInput.timestamp,
      plan.estimated_duration_minutes,
    );
    const expectedEndAt = computedEndAt ?? generatedWriteInput.timestamp;

    let truncateOk = false;
    if (writeResult.success && truncateTarget) {
      // Perform truncation only after a successful new write
      truncateOk = await truncateEpisodeDuration(truncateTarget.filePath, truncateTarget.eventId, truncateTarget.timestamp);
    }
    
    const notes: string[] = [];
    if (!computedEndAt) {
      notes.push('expected_end_at could not be computed from started_at; falling back to started_at.');
    }
    if (plan.interruption_handling === 'interrupt' && activeFacts.length > 0) {
      if (!activeFacts[0].event_id) {
        notes.push('Interrupt: active episode has no Event_Id; prior duration was not truncated.');
      } else if (writeResult.success && !truncateOk) {
        notes.push('Interrupt: write succeeded but could not truncate the prior episode.');
      }
    }
    if (writeResult.success) {
      notes.push(
        plan.interruption_handling === 'interrupt'
          ? 'Event interrupt execution recorded.'
          : 'Event transition execution recorded.',
      );
    } else {
      const detail = [writeResult.error_code, writeResult.error].filter(Boolean).join(': ') || 'unknown error';
      notes.push(`Canon write failed: ${detail}`);
    }

    const result: TimelineTransitionOutput = {
      ok: writeResult.success,
      trace_id: traceId,
      transition: {
        event_id: eventId,
        summary: plan.summary,
        estimated_duration_minutes: plan.estimated_duration_minutes,
        started_at: generatedWriteInput.timestamp,
        expected_end_at: expectedEndAt,
        requires_persona_update: plan.requires_persona_update,
        persona_update_data: plan.persona_update_data,
      },
      canon_write: {
        success: writeResult.success,
        file_path: deps.memoryFilePath!(writeDate),
        ...(writeResult.error_code && { error_code: writeResult.error_code }),
        ...(writeResult.error && { error: writeResult.error }),
        ...(writeResult.recovery_hint && { recovery_hint: writeResult.recovery_hint }),
      },
      notes,
    };

    result.trace = buildTransitionTrace({
      directive: input.directive,
      active_facts_found: activeFacts.length,
      interruption_handling: plan.interruption_handling,
      interrupted_event_id: plan.interruption_handling === 'interrupt' ? activeFacts[0]?.event_id : undefined,
      truncate_ok: truncateOk,
      requires_persona_update: plan.requires_persona_update,
      write: {
        success: writeResult.success,
        file_path: writeResult.success ? deps.memoryFilePath!(writeDate) : undefined,
        error_code: writeResult.error_code,
        error: writeResult.error,
      },
      notes: result.notes,
    }, traceId);

    persistTransitionTraceIfConfigured(result, input, deps);
    return result;

  } catch (error: any) {
    const output: TimelineTransitionOutput = {
      ok: false,
      trace_id: traceId,
      notes: [`Transition failed: ${error.message}`]
    };
    persistTransitionTraceIfConfigured(output, input, deps);
    return output;
  }
}

export const timelineTransitionToolSpec = {
  name: 'timeline_transition',
  description: 'Plans and executes an arbitrary state transition or new task assignment (e.g. go take a shower, moving to another city, travel for 2 days). It handles interrupting current activities or inserting micro-tasks, updating the canon appropriately. Also signals if the persona profile should be updated for long-lasting effects.',
  inputSchema: {
    type: 'object',
    properties: {
      directive: { type: 'string', description: 'The natural language directive for the transition.' }
    },
    required: ['directive'],
    additionalProperties: false,
  },
  run: timelineTransition,
};
