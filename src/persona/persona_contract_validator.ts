import { PersonaContractV1, emptyPersonaContract } from './persona_contract';

export interface PersonaContractValidationResult {
  ok: boolean;
  issues: string[];
}

const TEMPORAL_PATTERN = /(?:\bnow\b|\bcurrently\b|\btoday\b|\byesterday\b|\blast night\b|\brecently\b|\bright now\b|现在|当前|今天|昨天|昨晚|最近|刚刚|上周|本周)/i;
const STRONG_INFERENCE_PATTERN = /(?:always|never|必须|绝不|总是|永远)/i;
const TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'request_id',
  'identity',
  'soul',
  'memory',
  'rhythm',
  'appearance',
  'scene',
  'constraints',
]);
const SECTION_KEYS: Record<string, Set<string>> = {
  identity: new Set(['home_city', 'home_country', 'home_timezone', 'living_style', 'base_environment', 'common_zones', 'routine_context']),
  soul: new Set(['temperament', 'emotional_style', 'social_style', 'cognitive_style', 'values']),
  memory: new Set(['long_term_habits', 'long_term_preferences', 'durable_commitments', 'recurring_patterns', 'important_non_temporal_facts']),
  rhythm: new Set(['weekday_bias', 'weekend_bias', 'morning_bias', 'afternoon_bias', 'evening_bias', 'late_night_bias']),
  appearance: new Set(['default_home_style', 'default_outing_style', 'default_exercise_style', 'change_triggers', 'non_triggers', 'style_constraints']),
  scene: new Set(['plausible_locations', 'plausible_activities', 'rare_but_possible_scenes', 'implausible_or_rare_locations', 'implausible_or_rare_activities']),
  constraints: new Set(['must', 'should', 'avoid']),
};
const SECTION_ARRAY_FIELDS: Record<string, Set<string>> = {
  identity: new Set(['common_zones', 'routine_context']),
  soul: new Set(['values']),
  memory: new Set(['long_term_habits', 'long_term_preferences', 'durable_commitments', 'recurring_patterns', 'important_non_temporal_facts']),
  rhythm: new Set(['weekday_bias', 'weekend_bias', 'morning_bias', 'afternoon_bias', 'evening_bias', 'late_night_bias']),
  appearance: new Set(['change_triggers', 'non_triggers', 'style_constraints']),
  scene: new Set(['plausible_locations', 'plausible_activities', 'rare_but_possible_scenes', 'implausible_or_rare_locations', 'implausible_or_rare_activities']),
  constraints: new Set(['must', 'should', 'avoid']),
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function checkText(label: string, value: unknown, issues: string[]): void {
  if (value === undefined) return;
  if (typeof value !== 'string') {
    issues.push(`${label} must be a string when present.`);
    return;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    issues.push(`${label} must not be blank when present.`);
    return;
  }
  if (TEMPORAL_PATTERN.test(trimmed)) {
    issues.push(`${label} contains temporal wording that does not belong in persona contract.`);
  }
}

function checkList(label: string, value: unknown, issues: string[]): void {
  if (!Array.isArray(value)) {
    issues.push(`${label} must be an array.`);
    return;
  }
  const seen = new Set<string>();
  for (const entry of value) {
    const normalized = String(entry || '').trim();
    if (!normalized) {
      issues.push(`${label} must not contain blank items.`);
      continue;
    }
    if (TEMPORAL_PATTERN.test(normalized)) {
      issues.push(`${label} contains temporal wording that does not belong in persona contract.`);
    }
    if (normalized.length > 220) {
      issues.push(`${label} contains an item that is too long for a stable persona field.`);
    }
    if (seen.has(normalized.toLowerCase())) {
      issues.push(`${label} contains duplicate items.`);
    }
    seen.add(normalized.toLowerCase());
  }
}

function validateObjectShape(contract: PersonaContractV1, issues: string[]): void {
  checkText('identity.home_city', contract.identity.home_city, issues);
  checkText('identity.home_country', contract.identity.home_country, issues);
  checkText('identity.home_timezone', contract.identity.home_timezone, issues);
  checkText('identity.living_style', contract.identity.living_style, issues);
  checkText('identity.base_environment', contract.identity.base_environment, issues);
  checkList('identity.common_zones', contract.identity.common_zones, issues);
  checkList('identity.routine_context', contract.identity.routine_context, issues);

  checkText('soul.temperament', contract.soul.temperament, issues);
  checkText('soul.emotional_style', contract.soul.emotional_style, issues);
  checkText('soul.social_style', contract.soul.social_style, issues);
  checkText('soul.cognitive_style', contract.soul.cognitive_style, issues);
  checkList('soul.values', contract.soul.values, issues);

  checkList('memory.long_term_habits', contract.memory.long_term_habits, issues);
  checkList('memory.long_term_preferences', contract.memory.long_term_preferences, issues);
  checkList('memory.durable_commitments', contract.memory.durable_commitments, issues);
  checkList('memory.recurring_patterns', contract.memory.recurring_patterns, issues);
  checkList('memory.important_non_temporal_facts', contract.memory.important_non_temporal_facts, issues);

  checkList('rhythm.weekday_bias', contract.rhythm.weekday_bias, issues);
  checkList('rhythm.weekend_bias', contract.rhythm.weekend_bias, issues);
  checkList('rhythm.morning_bias', contract.rhythm.morning_bias, issues);
  checkList('rhythm.afternoon_bias', contract.rhythm.afternoon_bias, issues);
  checkList('rhythm.evening_bias', contract.rhythm.evening_bias, issues);
  checkList('rhythm.late_night_bias', contract.rhythm.late_night_bias, issues);

  checkText('appearance.default_home_style', contract.appearance.default_home_style, issues);
  checkText('appearance.default_outing_style', contract.appearance.default_outing_style, issues);
  checkText('appearance.default_exercise_style', contract.appearance.default_exercise_style, issues);
  checkList('appearance.change_triggers', contract.appearance.change_triggers, issues);
  checkList('appearance.non_triggers', contract.appearance.non_triggers, issues);
  checkList('appearance.style_constraints', contract.appearance.style_constraints, issues);

  checkList('scene.plausible_locations', contract.scene.plausible_locations, issues);
  checkList('scene.plausible_activities', contract.scene.plausible_activities, issues);
  checkList('scene.rare_but_possible_scenes', contract.scene.rare_but_possible_scenes, issues);
  checkList('scene.implausible_or_rare_locations', contract.scene.implausible_or_rare_locations, issues);
  checkList('scene.implausible_or_rare_activities', contract.scene.implausible_or_rare_activities, issues);

  checkList('constraints.must', contract.constraints.must, issues);
  checkList('constraints.should', contract.constraints.should, issues);
  checkList('constraints.avoid', contract.constraints.avoid, issues);
}

function validateOverStrongOutputs(contract: PersonaContractV1, issues: string[]): void {
  const strongFields = [
    ...contract.memory.long_term_habits,
    ...contract.memory.long_term_preferences,
    ...contract.memory.durable_commitments,
    ...contract.memory.recurring_patterns,
    ...contract.constraints.must,
    ...contract.constraints.avoid,
  ];
  if (strongFields.filter((entry) => STRONG_INFERENCE_PATTERN.test(entry)).length > 3) {
    issues.push('Contract contains too many absolute claims for an extracted fallback persona profile.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function validateCandidatePersonaContractPayload(
  value: unknown,
  contractVersion = '1.0',
): PersonaContractValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: ['Extractor output must be a JSON object.'],
    };
  }

  const topLevelKeys = Object.keys(value);
  for (const key of topLevelKeys) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      issues.push(`Extractor output contains unknown top-level field "${key}".`);
    }
  }

  if (value.schema_version !== contractVersion) {
    issues.push(`Extractor output must include schema_version "${contractVersion}".`);
  }

  if (Object.prototype.hasOwnProperty.call(value, 'request_id')) {
    if (typeof value.request_id !== 'string' || !value.request_id.trim()) {
      issues.push('Extractor output field "request_id" must be a non-empty string when present.');
    }
  }

  for (const [sectionName, allowedKeys] of Object.entries(SECTION_KEYS)) {
    const sectionValue = value[sectionName];
    if (sectionValue === undefined) continue;
    if (!isRecord(sectionValue)) {
      issues.push(`Extractor output field "${sectionName}" must be an object when present.`);
      continue;
    }
    for (const key of Object.keys(sectionValue)) {
      if (!allowedKeys.has(key)) {
        issues.push(`Extractor output contains unknown field "${sectionName}.${key}".`);
        continue;
      }
      const fieldValue = sectionValue[key];
      if (fieldValue === undefined) continue;
      if (SECTION_ARRAY_FIELDS[sectionName]?.has(key)) {
        if (!Array.isArray(fieldValue)) {
          issues.push(`Extractor output field "${sectionName}.${key}" must be an array.`);
          continue;
        }
        for (const entry of fieldValue) {
          if (typeof entry !== 'string') {
            issues.push(`Extractor output field "${sectionName}.${key}" must contain strings only.`);
            break;
          }
        }
      } else if (typeof fieldValue !== 'string') {
        issues.push(`Extractor output field "${sectionName}.${key}" must be a string.`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function normalizeCandidatePersonaContract(value: unknown): PersonaContractV1 {
  const empty = emptyPersonaContract();
  const candidate = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
  const identity = (candidate.identity && typeof candidate.identity === 'object') ? candidate.identity as Record<string, unknown> : {};
  const soul = (candidate.soul && typeof candidate.soul === 'object') ? candidate.soul as Record<string, unknown> : {};
  const memory = (candidate.memory && typeof candidate.memory === 'object') ? candidate.memory as Record<string, unknown> : {};
  const rhythm = (candidate.rhythm && typeof candidate.rhythm === 'object') ? candidate.rhythm as Record<string, unknown> : {};
  const appearance = (candidate.appearance && typeof candidate.appearance === 'object') ? candidate.appearance as Record<string, unknown> : {};
  const scene = (candidate.scene && typeof candidate.scene === 'object') ? candidate.scene as Record<string, unknown> : {};
  const constraints = (candidate.constraints && typeof candidate.constraints === 'object') ? candidate.constraints as Record<string, unknown> : {};

  return {
    schema_version: '1.0',
    identity: {
      home_city: typeof identity.home_city === 'string' ? identity.home_city.trim() : undefined,
      home_country: typeof identity.home_country === 'string' ? identity.home_country.trim() : undefined,
      home_timezone: typeof identity.home_timezone === 'string' ? identity.home_timezone.trim() : undefined,
      living_style: typeof identity.living_style === 'string' ? identity.living_style.trim() : undefined,
      base_environment: typeof identity.base_environment === 'string' ? identity.base_environment.trim() : undefined,
      common_zones: asStringList(identity.common_zones),
      routine_context: asStringList(identity.routine_context),
    },
    soul: {
      temperament: typeof soul.temperament === 'string' ? soul.temperament.trim() : undefined,
      emotional_style: typeof soul.emotional_style === 'string' ? soul.emotional_style.trim() : undefined,
      social_style: typeof soul.social_style === 'string' ? soul.social_style.trim() : undefined,
      cognitive_style: typeof soul.cognitive_style === 'string' ? soul.cognitive_style.trim() : undefined,
      values: asStringList(soul.values),
    },
    memory: {
      long_term_habits: asStringList(memory.long_term_habits),
      long_term_preferences: asStringList(memory.long_term_preferences),
      durable_commitments: asStringList(memory.durable_commitments),
      recurring_patterns: asStringList(memory.recurring_patterns),
      important_non_temporal_facts: asStringList(memory.important_non_temporal_facts),
    },
    rhythm: {
      weekday_bias: asStringList(rhythm.weekday_bias),
      weekend_bias: asStringList(rhythm.weekend_bias),
      morning_bias: asStringList(rhythm.morning_bias),
      afternoon_bias: asStringList(rhythm.afternoon_bias),
      evening_bias: asStringList(rhythm.evening_bias),
      late_night_bias: asStringList(rhythm.late_night_bias),
    },
    appearance: {
      default_home_style: typeof appearance.default_home_style === 'string' ? appearance.default_home_style.trim() : undefined,
      default_outing_style: typeof appearance.default_outing_style === 'string' ? appearance.default_outing_style.trim() : undefined,
      default_exercise_style: typeof appearance.default_exercise_style === 'string' ? appearance.default_exercise_style.trim() : undefined,
      change_triggers: asStringList(appearance.change_triggers),
      non_triggers: asStringList(appearance.non_triggers),
      style_constraints: asStringList(appearance.style_constraints),
    },
    scene: {
      plausible_locations: asStringList(scene.plausible_locations),
      plausible_activities: asStringList(scene.plausible_activities),
      rare_but_possible_scenes: asStringList(scene.rare_but_possible_scenes),
      implausible_or_rare_locations: asStringList(scene.implausible_or_rare_locations),
      implausible_or_rare_activities: asStringList(scene.implausible_or_rare_activities),
    },
    constraints: {
      must: asStringList(constraints.must),
      should: asStringList(constraints.should),
      avoid: asStringList(constraints.avoid),
    },
  };
}

export function validatePersonaContract(contract: PersonaContractV1): PersonaContractValidationResult {
  const issues: string[] = [];
  validateObjectShape(contract, issues);
  validateOverStrongOutputs(contract, issues);
  return {
    ok: issues.length === 0,
    issues,
  };
}
