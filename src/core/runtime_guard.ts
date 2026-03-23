import { ParsedEpisode } from '../lib/types';
import {
  CollectedTimelineFact,
  TimelineCollectorOutput,
  TimelineGeneratedDraft,
  TimelineReasonerOutput,
} from './timeline_reasoner_contract';

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
    naturalText: fact.natural_text,
    parseLevel: fact.parse_level,
    confidence: fact.confidence,
  };
}

function isValidGeneratedDraft(draft: TimelineGeneratedDraft | undefined): draft is TimelineGeneratedDraft {
  if (!draft) return false;
  return Boolean(
    String(draft.location || '').trim()
    && String(draft.action || '').trim()
    && Array.isArray(draft.emotionTags)
    && draft.emotionTags.length > 0
    && String(draft.appearance || '').trim()
    && String(draft.internalMonologue || '').trim()
    && String(draft.naturalText || '').trim()
    && Number.isFinite(Number(draft.confidence)),
  );
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
