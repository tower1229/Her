import { PersonaContractV1 } from '../persona/persona_contract';
import { TimelineTransitionInput, TransitionPlan } from './transition_planner_contract';
import { CollectedTimelineFact } from './timeline_reasoner_contract';

export function buildTransitionPlannerSystemPrompt(): string {
  return [
    'You are the internal Timeline plugin Scene Transition Planner.',
    'Your task is to analyze natural-language transition or action directives from the user.',
    'Decide if the action is a micro-task, a macro-task (long duration), or invalid in the current physical state.',
    'Output a JSON object that strictly matches the following TransitionPlan schema:',
    JSON.stringify({
      summary: 'Short summary of the transition',
      estimated_duration_minutes: 'integer (e.g., shower = 30, sleep = 480, travel = 2880)',
      started_at: 'ISO format timestamp, usually matching anchor.now',
      interruption_handling: 'interrupt | insert_micro_task | reject',
      reject_reason: 'If reject, explain why concisely',
      requires_persona_update: 'boolean, true if this causes a persistent persona change (e.g., moving, changing jobs)',
      persona_update_data: 'optional JSON data for persona updates if requires_persona_update is true',
      initial_phase: {
        location: 'string',
        action: 'string',
        emotionTags: ['string'],
        appearance: 'string',
        internalMonologue: 'string'
      }
    }, null, 2),
    '',
    'Rules:',
    '1. "interrupt": The user commands a conflicting action that stops the current ongoing event (e.g., from "watching TV" to "take a shower").',
    '2. "insert_micro_task": The user commands an action that fits cleanly inside the ongoing macro event (e.g., from "shopping" to "trying street food").',
    '3. "reject": The command physically conflicts with the macro state (e.g., "cook at home kitchen" while "traveling in another city"). Explain in reject_reason.',
    '4. requires_persona_update MUST be true ONLY for life-altering events (moving homes, changing careers). A short trip does NOT change the home_city.',
    '5. persona_update_data should carry actionable parameters (e.g. {"new_city": "Dali"}) for the persona subagent to execute later.'
  ].join('\n');
}

export function buildTransitionPlannerMessage(
  input: TimelineTransitionInput,
  anchor: { now: string; timezone: string },
  persona: PersonaContractV1,
  activeFacts: CollectedTimelineFact[],
  requestId: string
): string {
  return [
    'Plan the transition based on the directive.',
    'Input:',
    JSON.stringify({
      directive: input.directive,
      anchor,
      persona: {
        identity: persona.identity,
        scene: persona.scene
      },
      active_ongoing_events: activeFacts
    }, null, 2)
  ].join('\n');
}
