import { PersonaContractV1, emptyPersonaContract } from './persona_contract';
import { ParsedPersonaProfile } from './persona_source_types';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  const single = asString(value);
  return single ? [single] : [];
}

export function buildPersonaContractFromProfile(parsed: ParsedPersonaProfile): PersonaContractV1 {
  const contract = emptyPersonaContract();
  if (!parsed.found) return contract;

  const meta = parsed.sections.meta;
  contract.identity.home_city = asString(meta?.home_city);
  contract.identity.home_country = asString(meta?.home_country);
  contract.identity.home_timezone = asString(meta?.home_timezone);

  const identity = parsed.sections.identity;
  contract.identity.living_style = asString(identity?.living_style);
  contract.identity.base_environment = asString(identity?.base_environment);
  contract.identity.common_zones = asList(identity?.common_zones);
  contract.identity.routine_context = asList(identity?.routine_context);

  const soul = parsed.sections.soul;
  contract.soul.temperament = asString(soul?.temperament);
  contract.soul.emotional_style = asString(soul?.emotional_style);
  contract.soul.social_style = asString(soul?.social_style);
  contract.soul.cognitive_style = asString(soul?.cognitive_style);
  contract.soul.values = asList(soul?.values);

  const stableMemory = parsed.sections.stable_memory;
  contract.memory.long_term_habits = asList(stableMemory?.long_term_habits);
  contract.memory.long_term_preferences = asList(stableMemory?.long_term_preferences);
  contract.memory.durable_commitments = asList(stableMemory?.durable_commitments);
  contract.memory.recurring_patterns = asList(stableMemory?.recurring_patterns);
  contract.memory.important_non_temporal_facts = asList(stableMemory?.important_non_temporal_facts);

  const rhythm = parsed.sections.daily_rhythm_tendencies;
  contract.rhythm.weekday_bias = asList(rhythm?.weekday_bias);
  contract.rhythm.weekend_bias = asList(rhythm?.weekend_bias);
  contract.rhythm.morning_bias = asList(rhythm?.morning_bias);
  contract.rhythm.afternoon_bias = asList(rhythm?.afternoon_bias);
  contract.rhythm.evening_bias = asList(rhythm?.evening_bias);
  contract.rhythm.late_night_bias = asList(rhythm?.late_night_bias);

  const appearance = parsed.sections.appearance_tendencies;
  contract.appearance.default_home_style = asString(appearance?.default_home_style);
  contract.appearance.default_outing_style = asString(appearance?.default_outing_style);
  contract.appearance.default_exercise_style = asString(appearance?.default_exercise_style);
  contract.appearance.change_triggers = asList(appearance?.change_triggers);
  contract.appearance.non_triggers = asList(appearance?.non_triggers);
  contract.appearance.style_constraints = asList(appearance?.style_constraints);

  const scene = parsed.sections.scene_anchors;
  contract.scene.plausible_locations = asList(scene?.plausible_locations);
  contract.scene.plausible_activities = asList(scene?.plausible_activities);
  contract.scene.rare_but_possible_scenes = asList(scene?.rare_but_possible_scenes);
  contract.scene.implausible_or_rare_locations = asList(scene?.implausible_or_rare_locations);
  contract.scene.implausible_or_rare_activities = asList(scene?.implausible_or_rare_activities);

  const constraints = parsed.sections.constraint_rules;
  contract.constraints.must = asList(constraints?.must);
  contract.constraints.should = asList(constraints?.should);
  contract.constraints.avoid = asList(constraints?.avoid);

  return contract;
}
