import { LegacyPersonaContractExtractor } from '../persona/extract_legacy_persona_contract';

interface CreateLegacyPersonaExtractorRuntimeOptions {
  baseSessionKey: string;
  sessionPrefix: string;
  timeoutMs: number;
  modelId: string;
  extractorVersion: string;
  runJsonPrompt: (input: {
    sessionKey: string;
    requestId: string;
    message: string;
    extraSystemPrompt: string;
    timeoutMs: number;
    sourceLabel: string;
  }) => Promise<Record<string, unknown>>;
}

function makeExtractorRequestId(): string {
  return `timeline-persona-extract-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function buildLegacyPersonaExtractorSystemPrompt(): string {
  return [
    'You are the internal Timeline persona contract extractor.',
    'Your only task is to convert legacy persona prose into a PersonaContractV1-bounded JSON object.',
    'Do not call tools. Do not use the user query. Do not infer temporal facts. Output JSON only.',
    'schema_version is required.',
    'request_id is required and must exactly match legacy_files.request_id in the user message (subagent correlation).',
    'Include only schema_version, request_id, and the persona sections shown in the requested output shape. Omit optional sections you cannot ground in the files.',
    'Keep outputs minimal and stable. Prefer omission over overcommitting.',
    'Do not emit explanatory prose or markdown fences unless the whole answer is a single JSON object.',
  ].join('\n');
}

function buildLegacyPersonaExtractorMessage(
  input: {
    requestId: string;
    soul: string;
    memory: string;
    identity: string;
    contractVersion: string;
    validationFeedback?: string[];
  },
): string {
  return [
    'Extract a PersonaContractV1 from the legacy persona files below.',
    'Use only the file contents provided here. Do not use user-query context or timeline facts.',
    'Output a JSON object constrained to this shape. schema_version and request_id are required; request_id must equal the value under legacy_files below. Omit unsupported optional persona members instead of inventing them:',
    JSON.stringify({
      schema_version: input.contractVersion,
      request_id: input.requestId,
      identity: {
        home_city: 'optional string',
        home_country: 'optional string',
        home_timezone: 'optional string',
        living_style: 'optional string',
        base_environment: 'optional string',
        common_zones: ['string'],
        routine_context: ['string'],
      },
      soul: {
        temperament: 'optional string',
        emotional_style: 'optional string',
        social_style: 'optional string',
        cognitive_style: 'optional string',
        values: ['string'],
      },
      memory: {
        long_term_habits: ['string'],
        long_term_preferences: ['string'],
        durable_commitments: ['string'],
        recurring_patterns: ['string'],
        important_non_temporal_facts: ['string'],
      },
      rhythm: {
        weekday_bias: ['string'],
        weekend_bias: ['string'],
        morning_bias: ['string'],
        afternoon_bias: ['string'],
        evening_bias: ['string'],
        late_night_bias: ['string'],
      },
      appearance: {
        default_home_style: 'optional string',
        default_outing_style: 'optional string',
        default_exercise_style: 'optional string',
        change_triggers: ['string'],
        non_triggers: ['string'],
        style_constraints: ['string'],
      },
      scene: {
        plausible_locations: ['string'],
        plausible_activities: ['string'],
        rare_but_possible_scenes: ['string'],
        implausible_or_rare_locations: ['string'],
        implausible_or_rare_activities: ['string'],
      },
      constraints: {
        must: ['string'],
        should: ['string'],
        avoid: ['string'],
      },
    }, null, 2),
    '',
    'validation_feedback:',
    JSON.stringify(input.validationFeedback || [], null, 2),
    '',
    'legacy_files:',
    JSON.stringify({
      request_id: input.requestId,
      soul: input.soul,
      memory: input.memory,
      identity: input.identity,
    }, null, 2),
  ].join('\n');
}

export function createLegacyPersonaExtractorRuntime(
  options: CreateLegacyPersonaExtractorRuntimeOptions,
): LegacyPersonaContractExtractor {
  return {
    extractorVersion: options.extractorVersion,
    modelId: options.modelId,
    run: async (input) => {
      const requestId = makeExtractorRequestId();
      const sessionKey = `${options.baseSessionKey}:${options.sessionPrefix}:${requestId}`;
      const parsed = await options.runJsonPrompt({
        sessionKey,
        requestId,
        message: buildLegacyPersonaExtractorMessage({
          requestId,
          soul: input.soul,
          memory: input.memory,
          identity: input.identity,
          contractVersion: input.contractVersion,
          validationFeedback: input.validationFeedback,
        }),
        extraSystemPrompt: buildLegacyPersonaExtractorSystemPrompt(),
        timeoutMs: options.timeoutMs,
        sourceLabel: 'Timeline persona extractor',
      });
      return parsed;
    },
  };
}
