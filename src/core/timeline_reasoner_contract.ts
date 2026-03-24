export interface TimelineGeneratedDraft {
  timestamp?: string;
  location: string;
  action: string;
  emotionTags: string[];
  appearance: string;
  internalMonologue: string;
  confidence: number;
  reason?: string;
}

export interface TimelineWorldRhythmSlot {
  timestamp_hint: string;
  calendar_date: string;
  weekday: boolean;
  holiday_key: string | null;
  day_kind: 'workday' | 'weekend' | 'holiday';
  time_band: string;
  encouraged_modes: string[];
  discouraged_modes: string[];
  notes: string[];
}

export interface CollectedTimelineFact {
  fact_id: string;
  source_type: 'canon_daily_log';
  calendar_date: string;
  timestamp: string;
  location: string;
  action: string;
  emotion_tags: string[];
  appearance: string;
  internal_monologue?: string;
  parse_level: 'A' | 'B';
  confidence: number;
}

export interface TimelineCollectorOutput {
  schema_version: '1.0';
  request_id: string;
  request: {
    user_query?: string;
    mode: 'read_only' | 'allow_generate';
  };
  anchor: {
    now: string;
    timezone: string;
  };
  window: {
    query_range: 'now' | 'past_point' | 'past_range';
    semantic_target: string;
    collection_scope: string;
    start: string;
    end: string;
    calendar_dates: string[];
    normalization_notes?: string[];
  };
  source_order: string[];
  hard_facts: {
    sessions_history: string[];
  };
  canon_memory: {
    daily_logs: Array<{
      calendar_date: string;
      raw_content: string;
      parsed_episode_count: number;
    }>;
  };
  semantic_memory: {
    memory_search: string[];
  };
  persona_context: {
    soul: string;
    memory: string;
    identity: string;
    available_sources: string[];
    should_constrain_generation: boolean;
  };
  world_context: {
    target: TimelineWorldRhythmSlot | null;
    range_calendar: TimelineWorldRhythmSlot[];
  };
  candidate_facts: CollectedTimelineFact[];
}

export interface TimelineReasonerOutput {
  schema_version: '1.0';
  request_id: string;
  request_type: 'now' | 'past_point' | 'past_range';
  time_interpretation?: {
    normalized_kind: 'now' | 'point' | 'range';
    normalized_point?: string;
    normalized_start?: string;
    normalized_end?: string;
    match_strategy?: 'exact_match' | 'continuation' | 'range_summary' | 'generated';
    summary: string;
  };
  decision: {
    action: 'reuse_existing_fact' | 'generate_new_fact' | 'return_empty';
    selected_fact_id?: string;
    should_write_canon: boolean;
  };
  continuity: {
    judged: boolean;
    is_continuing?: boolean;
    reason?: string;
  };
  rationale: {
    summary: string;
    hard_fact_basis: string[];
    canon_basis: string[];
    persona_basis: string[];
    constraint_basis: string[];
    uncertainty?: string;
  };
  generated_fact?: TimelineGeneratedDraft;
}
