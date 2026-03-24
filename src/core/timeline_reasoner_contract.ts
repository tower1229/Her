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
    target_time_range: 'now' | 'recent_3d' | 'explicit' | 'natural_language';
    reason: string;
    mode: 'read_only' | 'allow_generate';
  };
  anchor: {
    now: string;
    timezone: string;
  };
  window: {
    query_range: 'now' | 'recent_3d' | 'explicit';
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
    uncertainty?: string;
  };
  generated_fact?: TimelineGeneratedDraft;
}
