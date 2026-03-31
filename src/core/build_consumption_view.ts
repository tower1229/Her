import { Episode, TimelineConsumptionView } from '../lib/types';
import { TimelineCollectorOutput } from './timeline_reasoner_contract';
import { TimelineReasonerOutput } from './timeline_reasoner_contract';

interface ConsumptionInput {
  preset: string;
  semanticTarget?: string;
  collectionScope?: string;
  resolutionMode: string;
  anchorTimezone: string;
  collector?: TimelineCollectorOutput;
  reasoned: TimelineReasonerOutput;
  episode?: Episode;
  sourceType: 'canon' | 'generated' | 'none';
}

function buildEmptyFactSummary(input: ConsumptionInput): string | undefined {
  if (input.episode || input.resolutionMode !== 'empty_window') return undefined;
  const summary = String(input.reasoned.rationale.summary || '').trim();
  if (!summary) {
    return '当前没有命中可复用事实，这段经历记不清了。';
  }
  if (/(记不清|模糊|想不起来|忘|forget)/i.test(summary)) {
    return summary;
  }
  return `${summary} 当前没有命中可复用事实，这段经历记不清了。`;
}

function deriveCalendarDate(timestamp?: string): string | undefined {
  const match = timestamp?.match(/^(\d{4}-\d{2}-\d{2})T/);
  return match?.[1];
}

function deriveContinuityRelation(input: ConsumptionInput): string | undefined {
  const explicit = input.reasoned.generated_fact?.sceneSemantics?.continuityRelation;
  if (explicit) return explicit;
  if (!input.reasoned.continuity.judged) return undefined;
  return input.reasoned.continuity.is_continuing ? 'same_scene_continuation' : 'fresh_moment';
}

function deriveActivityMode(input: ConsumptionInput): string | undefined {
  return input.reasoned.generated_fact?.sceneSemantics?.activityMode;
}

function deriveAppearanceChange(input: ConsumptionInput): { expected?: boolean; reason?: string } {
  const appearanceLogic = input.reasoned.generated_fact?.appearanceLogic;
  if (!appearanceLogic) return {};
  const expected = appearanceLogic.transition !== 'inherit';
  return {
    expected,
    reason: expected ? appearanceLogic.changeReason : undefined,
  };
}

function deriveEnvironmentMood(episode: Episode): string | undefined {
  const parts: string[] = [];
  const timeOfDay = episode.state_snapshot.scene.time_of_day;
  if (timeOfDay === 'morning') parts.push('morning calm');
  if (timeOfDay === 'afternoon') parts.push('soft daytime focus');
  if (timeOfDay === 'evening') parts.push('warm evening atmosphere');
  if (timeOfDay === 'night') parts.push('quiet night interior');

  if (episode.world_hooks.holiday_key) {
    parts.push('holiday rhythm');
  } else if (!episode.world_hooks.weekday) {
    parts.push('weekend ease');
  } else {
    parts.push('weekday cadence');
  }

  const combined = [
    episode.state_snapshot.scene.location_label,
    episode.state_snapshot.scene.activity,
    episode.state_snapshot.appearance.outfit_style,
  ].join(' ');
  if (/home|家|书房|desk|study|table|桌/.test(combined)) parts.push('grounded indoor routine');
  else if (/gym|健身|运动|run|basketball/.test(combined)) parts.push('active physical energy');
  else if (/cafe|咖啡|bookstore|书店/.test(combined)) parts.push('quiet urban outing');

  return parts.length > 0 ? parts.join(', ') : undefined;
}

function deriveSocialContext(input: ConsumptionInput, episode: Episode): string | undefined {
  if (input.collector?.conversation_context.should_prefer_conversation_continuity_for_now) {
    return 'in_conversation';
  }

  const combined = [
    episode.state_snapshot.scene.location_label,
    episode.state_snapshot.scene.activity,
    episode.narrative.summary,
  ].join(' ');
  if (/\bfriends?\b|朋友/.test(combined)) return 'with_friends';
  if (/\balone\b|\bsolo\b|by myself|独自|一个人/.test(combined)) return 'alone';
  return undefined;
}

function deriveLocationProps(episode: Episode): string[] | undefined {
  const text = [
    episode.state_snapshot.scene.location_label,
    episode.state_snapshot.scene.activity,
    episode.narrative.summary,
  ].join(' ').toLowerCase();
  const props: string[] = [];
  if (/desk|study|table|书桌|桌边|书房/.test(text)) props.push('desk');
  if (/window|窗/.test(text)) props.push('window');
  if (/coffee|咖啡/.test(text)) props.push('coffee');
  if (/bookshelf|bookcase|书架/.test(text)) props.push('bookshelf');
  if (/gym|健身|器械/.test(text)) props.push('gym equipment');
  return props.length > 0 ? props : undefined;
}

function deriveLightingHint(timeOfDay: string): string | undefined {
  if (timeOfDay === 'morning') return 'natural morning light';
  if (timeOfDay === 'afternoon') return 'soft daylight';
  if (timeOfDay === 'evening') return 'warm indoor or dusk light';
  if (timeOfDay === 'night') return 'low light or night interior light';
  return undefined;
}

export function defaultDurationForActivityMode(mode: string | undefined): number {
  switch (mode) {
    case 'sleep': return 420;
    case 'meal': return 45;
    case 'bath': return 30;
    case 'exercise': return 60;
    case 'work_or_study': return 120;
    case 'commute': return 40;
    case 'transition': return 15;
    case 'rest': return 30;
    case 'social': return 90;
    case 'shopping': return 60;
    case 'leisure': return 60;
    case 'domestic': return 60;
    case 'errands': return 45;
    default: return 60;
  }
}

function deriveEstimatedDurationMinutes(input: ConsumptionInput): number | undefined {
  if (input.reasoned.estimated_duration_minutes != null) {
    return input.reasoned.estimated_duration_minutes;
  }
  const fromSemantics = input.reasoned.generated_fact?.sceneSemantics?.estimatedDurationMinutes;
  if (fromSemantics != null) {
    return fromSemantics;
  }
  const activityMode = deriveActivityMode(input);
  if (activityMode) {
    return defaultDurationForActivityMode(activityMode);
  }
  return undefined;
}

function deriveFramingHint(episode: Episode): string | undefined {
  const combined = [
    episode.state_snapshot.scene.location_label,
    episode.state_snapshot.scene.activity,
  ].join(' ').toLowerCase();
  if (/desk|study|table|书桌|书房|cafe|咖啡/.test(combined)) {
    return 'half-body, seated, near-table framing';
  }
  if (/exercise|gym|run|running|basketball|健身|跑步|打球/.test(combined)) {
    return 'mid-shot, standing or movement-ready framing';
  }
  return undefined;
}

function buildSelfieEmotion(primary: string | null, secondary: string | null): string | null {
  if (primary && secondary) return `${primary} with a ${secondary} undertone`;
  return primary;
}

function buildSelfieLocation(scene: NonNullable<TimelineConsumptionView['scene']>): string {
  const locationCore = scene.location;
  if (!scene.city || locationCore.toLowerCase().includes(scene.city.toLowerCase())) return locationCore;
  return `${scene.city} ${locationCore}`;
}

function buildSelfieActivity(scene: NonNullable<TimelineConsumptionView['scene']>): string {
  const propText = scene.location_props && scene.location_props.length > 0
    ? ` with ${scene.location_props.slice(0, 2).join(' and ')} nearby`
    : '';
  return `${scene.activity}${propText}`;
}

function buildSelfieAppearance(episode: Episode): string {
  const appearance = episode.state_snapshot.appearance.outfit_style;
  const grooming = episode.state_snapshot.appearance.grooming ? `, ${episode.state_snapshot.appearance.grooming}` : '';
  const posture = episode.state_snapshot.appearance.posture_energy ? `, ${episode.state_snapshot.appearance.posture_energy}` : '';
  return `${appearance}${grooming}${posture}`;
}

function buildSelfieTimeOfDay(scene: NonNullable<TimelineConsumptionView['scene']>, episode: Episode): string {
  const weekendFlavor = episode.world_hooks.holiday_key ? 'holiday' : episode.world_hooks.weekday ? '' : 'weekend ';
  const timePhrase = scene.time_of_day;
  if (scene.city) return `${scene.city} ${weekendFlavor}${timePhrase}`.trim();
  return `${weekendFlavor}${timePhrase}`.trim();
}

function buildSelfieSummary(scene: NonNullable<TimelineConsumptionView['scene']>, selfie: NonNullable<TimelineConsumptionView['selfie_ready']>): string {
  const appearanceTone = selfie.appearance ? ` in ${selfie.appearance}` : '';
  const emotionTone = selfie.emotion ? `, feeling ${selfie.emotion}` : '';
  return `${selfie.location}: ${scene.activity}${appearanceTone}${emotionTone}.`;
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
      summary: input.episode?.narrative.summary ?? buildEmptyFactSummary(input),
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

  const city = input.collector?.persona_context.contract.identity.home_city;
  const appearanceChange = deriveAppearanceChange(input);
  const scene: NonNullable<TimelineConsumptionView['scene']> = {
    location: input.episode.state_snapshot.scene.location_label,
    activity: input.episode.state_snapshot.scene.activity,
    emotion_primary: input.episode.state_snapshot.emotion.primary,
    emotion_secondary: input.episode.state_snapshot.emotion.secondary,
    appearance: input.episode.state_snapshot.appearance.outfit_style,
    time_of_day: input.episode.state_snapshot.scene.time_of_day,
    summary: input.episode.narrative.summary,
    city,
    calendar_date: deriveCalendarDate(input.episode.temporal.start),
    local_timestamp: input.episode.temporal.start,
    timezone: input.anchorTimezone,
    activity_mode: deriveActivityMode(input),
    continuity_relation: deriveContinuityRelation(input),
    environment_mood: deriveEnvironmentMood(input.episode),
    social_context: deriveSocialContext(input, input.episode),
    appearance_change_expected: appearanceChange.expected,
    appearance_change_reason: appearanceChange.reason,
    location_props: deriveLocationProps(input.episode),
    lighting_hint: deriveLightingHint(input.episode.state_snapshot.scene.time_of_day),
    framing_hint: deriveFramingHint(input.episode),
    estimated_duration_minutes: deriveEstimatedDurationMinutes(input),
  };

  const selfieReady: NonNullable<TimelineConsumptionView['selfie_ready']> = {
    location: buildSelfieLocation(scene),
    activity: buildSelfieActivity(scene),
    emotion: buildSelfieEmotion(scene.emotion_primary, scene.emotion_secondary),
    appearance: buildSelfieAppearance(input.episode),
    time_of_day: buildSelfieTimeOfDay(scene, input.episode),
    summary: '',
  };
  selfieReady.summary = buildSelfieSummary(scene, selfieReady);

  return {
    ...base,
    scene,
    selfie_ready: selfieReady,
  };
}
