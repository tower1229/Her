import { Episode, TimelineConsumptionView } from '../lib/types';
import { TimelineReasonerOutput } from './timeline_reasoner_contract';

interface ConsumptionInput {
  preset: string;
  semanticTarget?: string;
  collectionScope?: string;
  resolutionMode: string;
  reasoned: TimelineReasonerOutput;
  episode?: Episode;
  sourceType: 'canon' | 'generated' | 'none';
}

export function buildConsumptionView(input: ConsumptionInput): TimelineConsumptionView {
  const base: TimelineConsumptionView = {
    schema_version: '1.0',
    document_type: 'timeline.consumption',
    query: {
      preset: input.preset,
      semantic_target: input.semanticTarget,
      collection_scope: input.collectionScope,
      resolution_mode: input.resolutionMode,
      time_interpretation: input.reasoned.time_interpretation,
    },
    fact: {
      status: input.episode ? 'resolved' : 'empty',
      source_type: input.sourceType,
      timestamp: input.episode?.temporal.start,
      summary: input.episode?.narrative.summary,
      confidence: input.episode?.provenance.confidence,
      continuity: {
        judged: input.reasoned.continuity.judged,
        is_continuing: input.reasoned.continuity.is_continuing,
        reason: input.reasoned.continuity.reason,
      },
    },
  };

  if (!input.episode) {
    return base;
  }

  const scene = {
    location: input.episode.state_snapshot.scene.location_label,
    activity: input.episode.state_snapshot.scene.activity,
    emotion_primary: input.episode.state_snapshot.emotion.primary,
    emotion_secondary: input.episode.state_snapshot.emotion.secondary,
    appearance: input.episode.state_snapshot.appearance.outfit_style,
    time_of_day: input.episode.state_snapshot.scene.time_of_day,
    summary: input.episode.narrative.summary,
  };

  return {
    ...base,
    scene,
    selfie_ready: {
      location: scene.location,
      activity: scene.activity,
      emotion: scene.emotion_primary,
      appearance: scene.appearance,
      time_of_day: scene.time_of_day,
      summary: scene.summary,
    },
  };
}
