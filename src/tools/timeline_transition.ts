import { TimelineTransitionInput, TimelineTransitionOutput, TransitionPlan } from '../core/transition_planner_contract';
import { collectActiveFacts } from '../core/collect_active_facts';
import { makeTraceId } from '../core/trace';
import { truncateEpisodeDuration } from '../storage/write-episode';
import { formatDate, parseTimestampParts, formatTimestamp } from '../lib/time-utils';
import { TimelineRuntimeDependencies } from './timeline_resolve';

export interface TimelineTransitionDependencies extends TimelineRuntimeDependencies {
  planTransition?: (
    input: TimelineTransitionInput,
    anchor: { now: string; timezone: string },
    persona: any,
    activeFacts: any[]
  ) => Promise<TransitionPlan>;
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

    if (plan.interruption_handling === 'interrupt' && activeFacts.length > 0) {
      // Find the most recently active fact
      const interruptedFact = activeFacts[0];
      const calendarDate = interruptedFact.calendar_date;
      const filePath = deps.memoryFilePath!(calendarDate);
      if (interruptedFact.event_id) {
         await truncateEpisodeDuration(filePath, interruptedFact.event_id, generatedWriteInput.timestamp);
      }
    }

    if (plan.interruption_handling === 'insert_micro_task' && activeFacts.length > 0) {
       // It continues the parent event
       const parentEvent = activeFacts[0];
       Object.assign(generatedWriteInput, {
         parentEventTag: parentEvent.event_id,
         parentEventPhase: 'micro_task',
         parentEventProgress: Math.min(1.0, (parentEvent.elapsed_minutes || 0) / (parentEvent.estimated_duration_minutes || 1))
       });
    }

    // Write the new transition episode
    const writeParts = parseTimestampParts(generatedWriteInput.timestamp);
    const writeDate = writeParts ? formatDate(writeParts) : generatedWriteInput.timestamp.slice(0, 10);
    const writeResult = await deps.writeEpisode!({
      ...generatedWriteInput,
      filePath: deps.memoryFilePath!(writeDate),
    });

    return {
      ok: writeResult.success,
      trace_id: traceId,
      transition: {
        event_id: eventId,
        summary: plan.summary,
        estimated_duration_minutes: plan.estimated_duration_minutes,
        started_at: generatedWriteInput.timestamp,
        expected_end_at: formatTimestamp({
           ...writeParts,
           minute: writeParts!.minute + plan.estimated_duration_minutes
        } as any),
        requires_persona_update: plan.requires_persona_update,
        persona_update_data: plan.persona_update_data
      },
      canon_write: {
        success: writeResult.success,
        file_path: deps.memoryFilePath!(writeDate),
      },
      notes: [plan.interruption_handling === 'interrupt' ? 'Event interrupt execution recorded.' : 'Event transition execution recorded.']
    };

  } catch (error: any) {
    return {
      ok: false,
      trace_id: traceId,
      notes: [`Transition failed: ${error.message}`]
    };
  }
}

export const timelineTransitionToolSpec = {
  name: 'timeline_transition',
  description: 'Plans and executes an arbitrary state transition or new task assignment (e.g. go take a shower, moving to another city, travel for 2 days). It handles interrupting current activities or inserting micro-tasks, updating the cannon appropriately. Also signals if the persona profile should be updated for long-lasting effects.',
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
