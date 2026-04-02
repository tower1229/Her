export type PersonaSourceKind = 'persona_profile' | 'legacy_core_files' | 'defaults_only';
export type PersonaAvailableSource = 'persona_profile' | 'legacy_soul' | 'legacy_memory' | 'legacy_identity';

export interface PersonaContractV1 {
  schema_version: '1.0';
  identity: {
    home_city?: string;
    home_country?: string;
    home_timezone?: string;
    living_style?: string;
    base_environment?: string;
    common_zones: string[];
    routine_context: string[];
  };
  soul: {
    temperament?: string;
    emotional_style?: string;
    social_style?: string;
    cognitive_style?: string;
    values: string[];
  };
  memory: {
    long_term_habits: string[];
    long_term_preferences: string[];
    durable_commitments: string[];
    recurring_patterns: string[];
    important_non_temporal_facts: string[];
  };
  rhythm: {
    weekday_bias: string[];
    weekend_bias: string[];
    morning_bias: string[];
    afternoon_bias: string[];
    evening_bias: string[];
    late_night_bias: string[];
  };
  appearance: {
    default_home_style?: string;
    default_outing_style?: string;
    default_exercise_style?: string;
    change_triggers: string[];
    non_triggers: string[];
    style_constraints: string[];
  };
  scene: {
    plausible_locations: string[];
    plausible_activities: string[];
    rare_but_possible_scenes: string[];
    implausible_or_rare_locations: string[];
    implausible_or_rare_activities: string[];
  };
  constraints: {
    must: string[];
    should: string[];
    avoid: string[];
  };
  /** Custom worldly rhythm constraints that override the system defaults for this persona. */
  world_rhythm_constraints?: Record<string, { start: string; end: string } | { ranges: { start: string; end: string }[] }>;
}

export interface TimelinePersonaContext {
  contract: PersonaContractV1;
  available_sources: PersonaAvailableSource[];
  should_constrain_generation: boolean;
}

export interface LoadedPersonaContract {
  contract: PersonaContractV1;
  available_sources: PersonaAvailableSource[];
  should_constrain_generation: boolean;
  trace: {
    source_kind: PersonaSourceKind;
    files_found: string[];
    parse_warnings: string[];
    cache_status: 'not_applicable' | 'hit' | 'miss' | 'written';
    extraction_attempts: number;
    validation_failures: string[];
  };
}

export function emptyPersonaContract(): PersonaContractV1 {
  return {
    schema_version: '1.0',
    identity: {
      common_zones: [],
      routine_context: [],
    },
    soul: {
      values: [],
    },
    memory: {
      long_term_habits: [],
      long_term_preferences: [],
      durable_commitments: [],
      recurring_patterns: [],
      important_non_temporal_facts: [],
    },
    rhythm: {
      weekday_bias: [],
      weekend_bias: [],
      morning_bias: [],
      afternoon_bias: [],
      evening_bias: [],
      late_night_bias: [],
    },
    appearance: {
      change_triggers: [],
      non_triggers: [],
      style_constraints: [],
    },
    scene: {
      plausible_locations: [],
      plausible_activities: [],
      rare_but_possible_scenes: [],
      implausible_or_rare_locations: [],
      implausible_or_rare_activities: [],
    },
    constraints: {
      must: [],
      should: [],
      avoid: [],
    },
  };
}

function hasAnyText(values: Array<string | undefined>): boolean {
  return values.some((value) => Boolean(value && value.trim()));
}

function hasAnyLists(values: string[][]): boolean {
  return values.some((value) => value.length > 0);
}

export function hasPersonaConstraints(contract: PersonaContractV1): boolean {
  return Boolean(
    hasAnyText([
      contract.identity.home_city,
      contract.identity.home_country,
      contract.identity.home_timezone,
      contract.identity.living_style,
      contract.identity.base_environment,
      contract.soul.temperament,
      contract.soul.emotional_style,
      contract.soul.social_style,
      contract.soul.cognitive_style,
      contract.appearance.default_home_style,
      contract.appearance.default_outing_style,
      contract.appearance.default_exercise_style,
    ])
    || hasAnyLists([
      contract.identity.common_zones,
      contract.identity.routine_context,
      contract.soul.values,
      contract.memory.long_term_habits,
      contract.memory.long_term_preferences,
      contract.memory.durable_commitments,
      contract.memory.recurring_patterns,
      contract.memory.important_non_temporal_facts,
      contract.rhythm.weekday_bias,
      contract.rhythm.weekend_bias,
      contract.rhythm.morning_bias,
      contract.rhythm.afternoon_bias,
      contract.rhythm.evening_bias,
      contract.rhythm.late_night_bias,
      contract.appearance.change_triggers,
      contract.appearance.non_triggers,
      contract.appearance.style_constraints,
      contract.scene.plausible_locations,
      contract.scene.plausible_activities,
      contract.scene.rare_but_possible_scenes,
      contract.scene.implausible_or_rare_locations,
      contract.scene.implausible_or_rare_activities,
      contract.constraints.must,
      contract.constraints.should,
      contract.constraints.avoid,
    ])
  );
}
