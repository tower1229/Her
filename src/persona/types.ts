import { TimelineCoreContext } from '../core/collect_sources';

export type PersonaProvenance = 'explicit_profile' | 'legacy_explicit' | 'weak_inference' | 'defaulted';
export type PersonaSourceKind = 'persona_profile' | 'legacy_core_files' | 'mixed' | 'defaults_only';

export type PersonaStructuredValue = string | string[];
export type PersonaStructuredSection = Record<string, PersonaStructuredValue>;

export interface ParsedRetrievalUnit {
  id: string;
  type?: string;
  priority?: string;
  summary?: string;
}

export interface ParsedPersonaProfile {
  found: boolean;
  raw_text: string;
  sections: {
    meta?: PersonaStructuredSection;
    identity?: PersonaStructuredSection;
    soul?: PersonaStructuredSection;
    stable_memory?: PersonaStructuredSection;
    daily_rhythm_tendencies?: PersonaStructuredSection;
    appearance_tendencies?: PersonaStructuredSection;
    scene_anchors?: PersonaStructuredSection;
    constraint_rules?: PersonaStructuredSection;
  };
  retrieval_units: ParsedRetrievalUnit[];
  parse_warnings: string[];
}

export interface LegacyCoreFiles {
  soul: string;
  memory: string;
  identity: string;
  found: {
    soul: boolean;
    memory: boolean;
    identity: boolean;
  };
}

export interface NormalizedPersonaProfile {
  source_kind: PersonaSourceKind;
  source_detail: string[];
  provenance: {
    meta: PersonaProvenance;
    identity: PersonaProvenance;
    soul: PersonaProvenance;
    memory: PersonaProvenance;
    rhythm: PersonaProvenance;
    appearance: PersonaProvenance;
    scene_anchors: PersonaProvenance;
    constraints: PersonaProvenance;
  };
  should_constrain_generation: boolean;
  meta: {
    schema_version?: string;
    persona_id?: string;
    home_city?: string;
    home_country?: string;
    home_timezone?: string;
    primary_language?: string;
  };
  identity: {
    life_stage?: string;
    living_style?: string;
    base_environment?: string;
    common_zones: string[];
    mobility_radius?: string;
    occupation_style?: string;
    routine_context: string[];
  };
  soul: {
    temperament?: string;
    emotional_style?: string;
    social_style?: string;
    cognitive_style?: string;
    values: string[];
    aesthetic_bias?: string;
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
    appearance_priority: string[];
    change_triggers: string[];
    non_triggers: string[];
    style_constraints: string[];
  };
  scene_anchors: {
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
  retrieval_units: Array<{
    id: string;
    type: 'identity' | 'soul' | 'memory' | 'rhythm' | 'appearance' | 'scene' | 'constraint';
    priority: 'high' | 'medium' | 'low';
    summary: string;
  }>;
  raw_text: {
    persona_profile?: string;
    soul?: string;
    memory?: string;
    identity?: string;
  };
}

export interface LoadedPersonaContext {
  normalized: NormalizedPersonaProfile;
  projected: TimelineCoreContext;
  trace: {
    source_kind: PersonaSourceKind;
    files_found: string[];
    parse_warnings: string[];
    defaults_applied: string[];
    conflict_resolutions: string[];
  };
}
