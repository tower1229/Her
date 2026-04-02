import { ParsedEpisode } from '../lib/types';
import {
  CollectedTimelineFact,
  TimelineCollectorOutput,
  TimelineGeneratedDraft,
  TimelineReasonerOutput,
} from './timeline_reasoner_contract';
import {
  isActivityMode,
  isAppearanceTransition,
  isContinuityRelation,
  isOutfitMode,
} from '../lib/timeline_semantics';
import { validateGeneratedWorldRhythm } from './world_rhythm';
import { hasPersonaConstraints as contractHasPersonaConstraints } from '../persona/persona_contract';

export interface TimelineGuardResult {
  ok: boolean;
  outcome: 'reuse_existing_fact' | 'generate_new_fact' | 'return_empty' | 'blocked';
  selected_fact?: CollectedTimelineFact;
  selected_episode?: ParsedEpisode;
  generated_fact?: TimelineGeneratedDraft;
  write_allowed: boolean;
  block_reason?: string;
}

function factToParsedEpisode(fact: CollectedTimelineFact): ParsedEpisode {
  return {
    timestamp: fact.timestamp,
    location: fact.location,
    action: fact.action,
    emotionTags: fact.emotion_tags,
    appearance: fact.appearance,
    internalMonologue: fact.internal_monologue,
    parseLevel: fact.parse_level,
    confidence: fact.confidence,
  };
}

function isValidGeneratedDraft(draft: TimelineGeneratedDraft | undefined): draft is TimelineGeneratedDraft {
  if (!draft) return false;
  return Boolean(
    (draft.timestamp === undefined || String(draft.timestamp).trim())
    && String(draft.location || '').trim()
    && String(draft.action || '').trim()
    && Array.isArray(draft.emotionTags)
    && draft.emotionTags.length > 0
    && String(draft.appearance || '').trim()
    && String(draft.internalMonologue || '').trim()
    && Number.isFinite(Number(draft.confidence)),
  );
}

function hasStructuredSceneSemantics(draft: TimelineGeneratedDraft): boolean {
  return Boolean(
    draft.sceneSemantics
    && isActivityMode(draft.sceneSemantics.activityMode)
    && isContinuityRelation(draft.sceneSemantics.continuityRelation)
    && String(draft.sceneSemantics.rationale || '').trim(),
  );
}

function hasStructuredAppearanceLogic(draft: TimelineGeneratedDraft): boolean {
  return Boolean(
    draft.appearanceLogic
    && isAppearanceTransition(draft.appearanceLogic.transition)
    && isOutfitMode(draft.appearanceLogic.outfitMode)
    && String(draft.appearanceLogic.changeReason || '').trim(),
  );
}

function hasPersonaConstraints(collector: TimelineCollectorOutput): boolean {
  return collector.persona_context.should_constrain_generation
    || contractHasPersonaConstraints(collector.persona_context.contract);
}

export function validateTimelineReasonerOutput(
  collector: TimelineCollectorOutput,
  reasoner: TimelineReasonerOutput,
): TimelineGuardResult {
  if (reasoner.request_id !== collector.request_id) {
    return {
      ok: false,
      outcome: 'blocked',
      write_allowed: false,
      block_reason: 'reasoner request_id mismatch',
    };
  }

  if (reasoner.decision.action === 'reuse_existing_fact') {
    const selectedFact = collector.candidate_facts.find((fact) => fact.fact_id === reasoner.decision.selected_fact_id);
    if (!selectedFact) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner selected_fact_id not found in collector candidate_facts',
      };
    }
    return {
      ok: true,
      outcome: 'reuse_existing_fact',
      selected_fact: selectedFact,
      selected_episode: factToParsedEpisode(selectedFact),
      write_allowed: false,
    };
  }

  if (reasoner.decision.action === 'generate_new_fact') {
    if (collector.request.mode !== 'allow_generate') {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner requested generation during read_only mode',
      };
    }
    if (!reasoner.decision.should_write_canon) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner generated a new fact without canon write permission',
      };
    }
    if (!isValidGeneratedDraft(reasoner.generated_fact)) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner generated_fact payload is invalid',
      };
    }
    if (!hasStructuredSceneSemantics(reasoner.generated_fact)) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner generated a new fact without structured scene semantics',
      };
    }
    if (!hasStructuredAppearanceLogic(reasoner.generated_fact)) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner generated a new fact without structured appearance logic',
      };
    }
    if (hasPersonaConstraints(collector) && reasoner.rationale.persona_basis.length === 0) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner generated a new fact without persona grounding',
      };
    }
    if (hasPersonaConstraints(collector) && reasoner.rationale.constraint_basis.length === 0) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner generated a new fact without explicit persona constraints',
      };
    }
    if (hasPersonaConstraints(collector) && !String(reasoner.generated_fact.reason || '').trim()) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner generated a new fact without explaining persona-consistent generation',
      };
    }
    const worldRhythmCheck = validateGeneratedWorldRhythm(
      reasoner.generated_fact,
      collector.persona_context.contract.world_rhythm_constraints,
    );
    if (!worldRhythmCheck.ok) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: `reasoner generated_fact violates world rhythm: ${worldRhythmCheck.issues.join(' ')}`,
      };
    }
    if (
      reasoner.generated_fact.appearanceLogic?.transition === 'change_required'
      && reasoner.generated_fact.appearanceLogic.outfitMode === 'unknown'
    ) {
      return {
        ok: false,
        outcome: 'blocked',
        write_allowed: false,
        block_reason: 'reasoner generated a required outfit change without a concrete outfit mode',
      };
    }
    return {
      ok: true,
      outcome: 'generate_new_fact',
      generated_fact: reasoner.generated_fact,
      write_allowed: true,
    };
  }

  return {
    ok: true,
    outcome: 'return_empty',
    write_allowed: false,
  };
}
