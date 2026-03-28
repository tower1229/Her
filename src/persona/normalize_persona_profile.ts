import {
  LegacyCoreFiles,
  NormalizedPersonaProfile,
  ParsedPersonaProfile,
  ParsedRetrievalUnit,
  PersonaProvenance,
} from './types';

interface NormalizePersonaProfileResult {
  normalized: NormalizedPersonaProfile;
  defaults_applied: string[];
  conflict_resolutions: string[];
}

function emptyNormalizedPersonaProfile(): NormalizedPersonaProfile {
  return {
    source_kind: 'defaults_only',
    source_detail: [],
    provenance: {
      meta: 'defaulted',
      identity: 'defaulted',
      soul: 'defaulted',
      memory: 'defaulted',
      rhythm: 'defaulted',
      appearance: 'defaulted',
      scene_anchors: 'defaulted',
      constraints: 'defaulted',
    },
    should_constrain_generation: false,
    meta: {},
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
      appearance_priority: [],
      change_triggers: [],
      non_triggers: [],
      style_constraints: [],
    },
    scene_anchors: {
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
    retrieval_units: [],
    raw_text: {},
  };
}

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

function hasAnyText(values: Array<string | undefined>): boolean {
  return values.some((value) => Boolean(value && value.trim()));
}

function hasAnyListValues(values: string[][]): boolean {
  return values.some((value) => value.length > 0);
}

function sectionHasMeaningfulValues(record: Record<string, unknown> | undefined): boolean {
  if (!record) return false;
  return Object.values(record).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(asString(value))));
}

function normalizeRetrievalUnit(unit: ParsedRetrievalUnit): NormalizedPersonaProfile['retrieval_units'][number] | null {
  if (!unit.id.trim() || !unit.summary?.trim()) return null;
  const validType = ['identity', 'soul', 'memory', 'rhythm', 'appearance', 'scene', 'constraint'].includes(String(unit.type))
    ? (unit.type as NormalizedPersonaProfile['retrieval_units'][number]['type'])
    : 'memory';
  const validPriority = ['high', 'medium', 'low'].includes(String(unit.priority))
    ? (unit.priority as NormalizedPersonaProfile['retrieval_units'][number]['priority'])
    : 'medium';

  return {
    id: unit.id.trim(),
    type: validType,
    priority: validPriority,
    summary: unit.summary.trim(),
  };
}

function applyProfile(parsed: ParsedPersonaProfile, normalized: NormalizedPersonaProfile): void {
  const meta = parsed.sections.meta;
  if (sectionHasMeaningfulValues(meta)) {
    normalized.meta.schema_version = asString(meta?.schema_version);
    normalized.meta.persona_id = asString(meta?.persona_id);
    normalized.meta.home_city = asString(meta?.home_city);
    normalized.meta.home_country = asString(meta?.home_country);
    normalized.meta.home_timezone = asString(meta?.home_timezone);
    normalized.meta.primary_language = asString(meta?.primary_language);
    normalized.provenance.meta = 'explicit_profile';
  }

  const identity = parsed.sections.identity;
  if (sectionHasMeaningfulValues(identity)) {
    normalized.identity.life_stage = asString(identity?.life_stage);
    normalized.identity.living_style = asString(identity?.living_style);
    normalized.identity.base_environment = asString(identity?.base_environment);
    normalized.identity.common_zones = asList(identity?.common_zones);
    normalized.identity.mobility_radius = asString(identity?.mobility_radius);
    normalized.identity.occupation_style = asString(identity?.occupation_style);
    normalized.identity.routine_context = asList(identity?.routine_context);
    normalized.provenance.identity = 'explicit_profile';
  }

  const soul = parsed.sections.soul;
  if (sectionHasMeaningfulValues(soul)) {
    normalized.soul.temperament = asString(soul?.temperament);
    normalized.soul.emotional_style = asString(soul?.emotional_style);
    normalized.soul.social_style = asString(soul?.social_style);
    normalized.soul.cognitive_style = asString(soul?.cognitive_style);
    normalized.soul.values = asList(soul?.values);
    normalized.soul.aesthetic_bias = asString(soul?.aesthetic_bias);
    normalized.provenance.soul = 'explicit_profile';
  }

  const stableMemory = parsed.sections.stable_memory;
  if (sectionHasMeaningfulValues(stableMemory)) {
    normalized.memory.long_term_habits = asList(stableMemory?.long_term_habits);
    normalized.memory.long_term_preferences = asList(stableMemory?.long_term_preferences);
    normalized.memory.durable_commitments = asList(stableMemory?.durable_commitments);
    normalized.memory.recurring_patterns = asList(stableMemory?.recurring_patterns);
    normalized.memory.important_non_temporal_facts = asList(stableMemory?.important_non_temporal_facts);
    normalized.provenance.memory = 'explicit_profile';
  }

  const rhythm = parsed.sections.daily_rhythm_tendencies;
  if (sectionHasMeaningfulValues(rhythm)) {
    normalized.rhythm.weekday_bias = asList(rhythm?.weekday_bias);
    normalized.rhythm.weekend_bias = asList(rhythm?.weekend_bias);
    normalized.rhythm.morning_bias = asList(rhythm?.morning_bias);
    normalized.rhythm.afternoon_bias = asList(rhythm?.afternoon_bias);
    normalized.rhythm.evening_bias = asList(rhythm?.evening_bias);
    normalized.rhythm.late_night_bias = asList(rhythm?.late_night_bias);
    normalized.provenance.rhythm = 'explicit_profile';
  }

  const appearance = parsed.sections.appearance_tendencies;
  if (sectionHasMeaningfulValues(appearance)) {
    normalized.appearance.default_home_style = asString(appearance?.default_home_style);
    normalized.appearance.default_outing_style = asString(appearance?.default_outing_style);
    normalized.appearance.default_exercise_style = asString(appearance?.default_exercise_style);
    normalized.appearance.appearance_priority = asList(appearance?.appearance_priority);
    normalized.appearance.change_triggers = asList(appearance?.change_triggers);
    normalized.appearance.non_triggers = asList(appearance?.non_triggers);
    normalized.appearance.style_constraints = asList(appearance?.style_constraints);
    normalized.provenance.appearance = 'explicit_profile';
  }

  const sceneAnchors = parsed.sections.scene_anchors;
  if (sectionHasMeaningfulValues(sceneAnchors)) {
    normalized.scene_anchors.plausible_locations = asList(sceneAnchors?.plausible_locations);
    normalized.scene_anchors.plausible_activities = asList(sceneAnchors?.plausible_activities);
    normalized.scene_anchors.rare_but_possible_scenes = asList(sceneAnchors?.rare_but_possible_scenes);
    normalized.scene_anchors.implausible_or_rare_locations = asList(sceneAnchors?.implausible_or_rare_locations);
    normalized.scene_anchors.implausible_or_rare_activities = asList(sceneAnchors?.implausible_or_rare_activities);
    normalized.provenance.scene_anchors = 'explicit_profile';
  }

  const constraints = parsed.sections.constraint_rules;
  if (sectionHasMeaningfulValues(constraints)) {
    normalized.constraints.must = asList(constraints?.must);
    normalized.constraints.should = asList(constraints?.should);
    normalized.constraints.avoid = asList(constraints?.avoid);
    normalized.provenance.constraints = 'explicit_profile';
  }

  normalized.retrieval_units = parsed.retrieval_units
    .map(normalizeRetrievalUnit)
    .filter(Boolean) as NormalizedPersonaProfile['retrieval_units'];
}

function inferHomeCity(text: string): { home_city?: string; home_country?: string; home_timezone?: string } {
  if (!text.trim()) return {};
  if (/\bShanghai\b|上海/.test(text)) {
    return { home_city: 'Shanghai', home_country: 'China', home_timezone: 'Asia/Shanghai' };
  }
  if (/\bBeijing\b|北京/.test(text)) {
    return { home_city: 'Beijing', home_country: 'China', home_timezone: 'Asia/Shanghai' };
  }
  return {};
}

function inferLegacySignals(
  legacy: LegacyCoreFiles,
  normalized: NormalizedPersonaProfile,
  allowLegacyByDimension: Record<'meta' | 'identity' | 'soul' | 'memory' | 'rhythm' | 'appearance' | 'scene_anchors' | 'constraints', boolean>,
): void {
  const combined = [legacy.soul, legacy.memory, legacy.identity].filter(Boolean).join('\n');

  if (
    allowLegacyByDimension.meta
    && !normalized.meta.home_city
    && !normalized.meta.home_country
    && !normalized.meta.home_timezone
  ) {
    const inferredHome = inferHomeCity(combined);
    if (inferredHome.home_city || inferredHome.home_country || inferredHome.home_timezone) {
      normalized.meta.home_city = inferredHome.home_city;
      normalized.meta.home_country = inferredHome.home_country;
      normalized.meta.home_timezone = inferredHome.home_timezone;
      normalized.provenance.meta = 'weak_inference';
    }
  }

  if (allowLegacyByDimension.identity && normalized.provenance.identity === 'defaulted' && legacy.identity.trim()) {
    normalized.provenance.identity = 'legacy_explicit';
  }
  if (allowLegacyByDimension.soul && normalized.provenance.soul === 'defaulted' && legacy.soul.trim()) {
    normalized.provenance.soul = 'legacy_explicit';
  }
  if (allowLegacyByDimension.memory && normalized.provenance.memory === 'defaulted' && legacy.memory.trim()) {
    normalized.provenance.memory = 'legacy_explicit';
  }

  if (
    allowLegacyByDimension.identity
    && !normalized.identity.routine_context.length
    && /home study|works? from home|working from home|家里书房|在家工作|居家/.test(combined)
  ) {
    normalized.identity.routine_context.push('Often spends ordinary work or focus time at home.');
    if (normalized.provenance.identity === 'defaulted') normalized.provenance.identity = 'weak_inference';
  }
  if (allowLegacyByDimension.scene_anchors && !normalized.scene_anchors.plausible_locations.length) {
    if (/cafe|咖啡馆/.test(combined)) normalized.scene_anchors.plausible_locations.push('Neighborhood cafe');
    if (/bookstore|书店/.test(combined)) normalized.scene_anchors.plausible_locations.push('Bookstore');
    if (/gym|健身|运动场|球场/.test(combined)) normalized.scene_anchors.plausible_locations.push('Gym or exercise space');
    if (/home|家里|在家|书房/.test(combined)) normalized.scene_anchors.plausible_locations.push('Home');
    if (normalized.scene_anchors.plausible_locations.length > 0 && normalized.provenance.scene_anchors === 'defaulted') {
      normalized.provenance.scene_anchors = 'weak_inference';
    }
  }
  if (
    allowLegacyByDimension.scene_anchors
    && !normalized.scene_anchors.plausible_activities.length
    && /exercise|gym|run|running|basketball|sport|运动|健身|跑步|打球/.test(combined)
  ) {
    normalized.scene_anchors.plausible_activities.push('Exercise');
    if (normalized.provenance.scene_anchors === 'defaulted') normalized.provenance.scene_anchors = 'weak_inference';
  }
  if (
    allowLegacyByDimension.memory
    && !normalized.memory.long_term_preferences.length
    && /exercise|gym|run|running|basketball|sport|运动|健身|跑步|打球/.test(combined)
  ) {
    normalized.memory.long_term_preferences.push('Exercise is a plausible recurring part of life.');
    if (normalized.provenance.memory === 'defaulted') normalized.provenance.memory = 'weak_inference';
  }
  if (
    allowLegacyByDimension.soul
    && !normalized.soul.temperament
    && /quiet|calm|reflective|安静|平静|内省|反思/.test(combined)
  ) {
    normalized.soul.temperament = /reflective|内省|反思/.test(combined) ? 'reflective' : 'quiet';
    if (normalized.provenance.soul === 'defaulted') normalized.provenance.soul = 'weak_inference';
  }
  if (
    allowLegacyByDimension.soul
    && !normalized.soul.social_style
    && /warm|friends|friend|social|朋友|社交/.test(combined)
  ) {
    normalized.soul.social_style = 'comfortable in familiar social settings';
    if (normalized.provenance.soul === 'defaulted') normalized.provenance.soul = 'weak_inference';
  }
  if (
    allowLegacyByDimension.appearance
    && !normalized.appearance.change_triggers.length
    && /exercise|gym|run|running|basketball|sport|运动|健身|跑步|打球/.test(combined)
  ) {
    normalized.appearance.change_triggers.push('exercise');
    if (normalized.provenance.appearance === 'defaulted') normalized.provenance.appearance = 'weak_inference';
  }
}

function supplementFromLegacy(legacy: LegacyCoreFiles, normalized: NormalizedPersonaProfile, conflicts: string[]): void {
  normalized.raw_text.soul = legacy.soul.trim() || undefined;
  normalized.raw_text.memory = legacy.memory.trim() || undefined;
  normalized.raw_text.identity = legacy.identity.trim() || undefined;

  const inferredHome = inferHomeCity(legacy.identity);
  if (
    normalized.meta.home_city
    && inferredHome.home_city
    && normalized.meta.home_city !== inferredHome.home_city
  ) {
    conflicts.push(`profile home_city "${normalized.meta.home_city}" kept over legacy "${inferredHome.home_city}"`);
  }
}

function determineSourceKind(profileFound: boolean, legacy: LegacyCoreFiles, normalized: NormalizedPersonaProfile): NormalizedPersonaProfile['source_kind'] {
  const legacyFound = legacy.found.soul || legacy.found.memory || legacy.found.identity;
  if (profileFound && legacyFound) return 'mixed';
  if (profileFound) return 'persona_profile';
  if (legacyFound) return 'legacy_core_files';
  return normalized.should_constrain_generation ? 'mixed' : 'defaults_only';
}

function determineConstraintFlag(normalized: NormalizedPersonaProfile): boolean {
  return Boolean(
    hasAnyText([
      normalized.meta.home_city,
      normalized.meta.home_country,
      normalized.meta.home_timezone,
      normalized.identity.life_stage,
      normalized.identity.living_style,
      normalized.identity.base_environment,
      normalized.identity.mobility_radius,
      normalized.identity.occupation_style,
      normalized.soul.temperament,
      normalized.soul.emotional_style,
      normalized.soul.social_style,
      normalized.soul.cognitive_style,
      normalized.soul.aesthetic_bias,
      normalized.appearance.default_home_style,
      normalized.appearance.default_outing_style,
      normalized.appearance.default_exercise_style,
    ])
    || hasAnyListValues([
      normalized.identity.common_zones,
      normalized.identity.routine_context,
      normalized.soul.values,
      normalized.memory.long_term_habits,
      normalized.memory.long_term_preferences,
      normalized.memory.durable_commitments,
      normalized.memory.recurring_patterns,
      normalized.memory.important_non_temporal_facts,
      normalized.rhythm.weekday_bias,
      normalized.rhythm.weekend_bias,
      normalized.rhythm.morning_bias,
      normalized.rhythm.afternoon_bias,
      normalized.rhythm.evening_bias,
      normalized.rhythm.late_night_bias,
      normalized.appearance.appearance_priority,
      normalized.appearance.change_triggers,
      normalized.appearance.non_triggers,
      normalized.appearance.style_constraints,
      normalized.scene_anchors.plausible_locations,
      normalized.scene_anchors.plausible_activities,
      normalized.scene_anchors.rare_but_possible_scenes,
      normalized.scene_anchors.implausible_or_rare_locations,
      normalized.scene_anchors.implausible_or_rare_activities,
      normalized.constraints.must,
      normalized.constraints.should,
      normalized.constraints.avoid,
      normalized.retrieval_units.map((unit) => unit.summary),
    ])
  );
}

function collectDefaultsApplied(normalized: NormalizedPersonaProfile): string[] {
  const defaults: string[] = [];
  if (!normalized.meta.home_city) defaults.push('meta.home_city');
  if (!normalized.meta.home_timezone) defaults.push('meta.home_timezone');
  if (!normalized.identity.common_zones.length) defaults.push('identity.common_zones');
  if (!normalized.memory.long_term_habits.length) defaults.push('memory.long_term_habits');
  if (!normalized.appearance.change_triggers.length) defaults.push('appearance.change_triggers');
  if (!normalized.constraints.must.length) defaults.push('constraints.must');
  return defaults;
}

export function normalizePersonaProfile(
  parsedProfile: ParsedPersonaProfile,
  legacy: LegacyCoreFiles,
): NormalizePersonaProfileResult {
  const normalized = emptyNormalizedPersonaProfile();
  const conflictResolutions: string[] = [];

  if (parsedProfile.found) {
    normalized.raw_text.persona_profile = parsedProfile.raw_text;
    applyProfile(parsedProfile, normalized);
  }

  supplementFromLegacy(legacy, normalized, conflictResolutions);
  inferLegacySignals(legacy, normalized, {
    meta: !parsedProfile.found || normalized.provenance.meta === 'defaulted',
    identity: !parsedProfile.found || normalized.provenance.identity === 'defaulted',
    soul: !parsedProfile.found || normalized.provenance.soul === 'defaulted',
    memory: !parsedProfile.found || normalized.provenance.memory === 'defaulted',
    rhythm: !parsedProfile.found || normalized.provenance.rhythm === 'defaulted',
    appearance: !parsedProfile.found || normalized.provenance.appearance === 'defaulted',
    scene_anchors: !parsedProfile.found || normalized.provenance.scene_anchors === 'defaulted',
    constraints: !parsedProfile.found || normalized.provenance.constraints === 'defaulted',
  });

  normalized.should_constrain_generation = determineConstraintFlag(normalized);
  normalized.source_kind = determineSourceKind(parsedProfile.found, legacy, normalized);
  normalized.source_detail = [
    parsedProfile.found ? 'persona/PERSONA_PROFILE.md' : '',
    legacy.found.soul ? 'SOUL.md' : '',
    legacy.found.memory ? 'MEMORY.md|memory.md' : '',
    legacy.found.identity ? 'IDENTITY.md|IDENTITY' : '',
  ].filter(Boolean);

  if (!normalized.raw_text.persona_profile) delete normalized.raw_text.persona_profile;
  if (!normalized.raw_text.soul) delete normalized.raw_text.soul;
  if (!normalized.raw_text.memory) delete normalized.raw_text.memory;
  if (!normalized.raw_text.identity) delete normalized.raw_text.identity;

  const defaultsApplied = collectDefaultsApplied(normalized);
  return {
    normalized,
    defaults_applied: defaultsApplied,
    conflict_resolutions: conflictResolutions,
  };
}
