import { TimelineCoreContext } from '../core/collect_sources';
import { NormalizedPersonaProfile } from './types';

function compactLines(lines: Array<string | undefined>): string {
  return lines.filter(Boolean).join('\n').trim();
}

function formatList(label: string, values: string[]): string | undefined {
  return values.length > 0 ? `${label}: ${values.join('; ')}` : undefined;
}

function projectIdentity(normalized: NormalizedPersonaProfile): string {
  const lines = compactLines([
    normalized.meta.home_city ? `Home city: ${normalized.meta.home_city}` : undefined,
    normalized.meta.home_country ? `Home country: ${normalized.meta.home_country}` : undefined,
    normalized.meta.home_timezone ? `Timezone: ${normalized.meta.home_timezone}` : undefined,
    normalized.identity.life_stage ? `Life stage: ${normalized.identity.life_stage}` : undefined,
    normalized.identity.living_style ? `Living style: ${normalized.identity.living_style}` : undefined,
    normalized.identity.base_environment ? `Base environment: ${normalized.identity.base_environment}` : undefined,
    formatList('Common zones', normalized.identity.common_zones),
    normalized.identity.mobility_radius ? `Mobility radius: ${normalized.identity.mobility_radius}` : undefined,
    normalized.identity.occupation_style ? `Occupation style: ${normalized.identity.occupation_style}` : undefined,
    formatList('Routine context', normalized.identity.routine_context),
  ]);
  return lines || normalized.raw_text.identity || '';
}

function projectSoul(normalized: NormalizedPersonaProfile): string {
  const lines = compactLines([
    normalized.soul.temperament ? `Temperament: ${normalized.soul.temperament}` : undefined,
    normalized.soul.emotional_style ? `Emotional style: ${normalized.soul.emotional_style}` : undefined,
    normalized.soul.social_style ? `Social style: ${normalized.soul.social_style}` : undefined,
    normalized.soul.cognitive_style ? `Cognitive style: ${normalized.soul.cognitive_style}` : undefined,
    formatList('Values', normalized.soul.values),
    normalized.soul.aesthetic_bias ? `Aesthetic bias: ${normalized.soul.aesthetic_bias}` : undefined,
  ]);
  return lines || normalized.raw_text.soul || '';
}

function projectMemory(normalized: NormalizedPersonaProfile): string {
  const lines = compactLines([
    formatList('Long-term habits', normalized.memory.long_term_habits),
    formatList('Long-term preferences', normalized.memory.long_term_preferences),
    formatList('Durable commitments', normalized.memory.durable_commitments),
    formatList('Recurring patterns', normalized.memory.recurring_patterns),
    formatList('Important non-temporal facts', normalized.memory.important_non_temporal_facts),
    formatList('Weekday bias', normalized.rhythm.weekday_bias),
    formatList('Weekend bias', normalized.rhythm.weekend_bias),
    formatList('Morning bias', normalized.rhythm.morning_bias),
    formatList('Afternoon bias', normalized.rhythm.afternoon_bias),
    formatList('Evening bias', normalized.rhythm.evening_bias),
    formatList('Late-night bias', normalized.rhythm.late_night_bias),
    normalized.appearance.default_home_style ? `Default home style: ${normalized.appearance.default_home_style}` : undefined,
    normalized.appearance.default_outing_style ? `Default outing style: ${normalized.appearance.default_outing_style}` : undefined,
    normalized.appearance.default_exercise_style ? `Default exercise style: ${normalized.appearance.default_exercise_style}` : undefined,
    formatList('Appearance priority', normalized.appearance.appearance_priority),
    formatList('Change triggers', normalized.appearance.change_triggers),
    formatList('Non-triggers', normalized.appearance.non_triggers),
    formatList('Style constraints', normalized.appearance.style_constraints),
    formatList('Plausible locations', normalized.scene_anchors.plausible_locations),
    formatList('Plausible activities', normalized.scene_anchors.plausible_activities),
    formatList('Rare but possible scenes', normalized.scene_anchors.rare_but_possible_scenes),
    formatList('Implausible or rare locations', normalized.scene_anchors.implausible_or_rare_locations),
    formatList('Implausible or rare activities', normalized.scene_anchors.implausible_or_rare_activities),
    formatList('Must', normalized.constraints.must),
    formatList('Should', normalized.constraints.should),
    formatList('Avoid', normalized.constraints.avoid),
  ]);
  return lines || normalized.raw_text.memory || '';
}

export function projectPersonaContext(normalized: NormalizedPersonaProfile): TimelineCoreContext {
  const identity = projectIdentity(normalized);
  const soul = projectSoul(normalized);
  const memory = projectMemory(normalized);

  return {
    soul,
    memory,
    identity,
    available_sources: [
      soul.trim() ? 'soul' : '',
      memory.trim() ? 'memory' : '',
      identity.trim() ? 'identity' : '',
    ].filter(Boolean),
    should_constrain_generation: normalized.should_constrain_generation,
  };
}
