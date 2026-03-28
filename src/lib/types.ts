export interface ParsedEpisode {
  timestamp: string;
  location: string;
  action: string;
  emotionTags: string[];
  appearance: string; // "unknown" when Level B
  internalMonologue?: string;
  // Legacy prose tolerated during parsing; canonical timeline writes no longer emit it.
  naturalText?: string;
  parseLevel: 'A' | 'B';
  confidence: number;
}

export interface TimelineWindow {
  schema_version: string;
  document_type: string;
  anchor: {
    now: string;
    timezone: string;
  };
  window: {
    calendar_date: string;
    preset: string; // "now" | "past_point" | "past_range"
    semantic_target?: string;
    collection_scope?: string;
    start: string;
    end: string;
    idempotency_key: string;
  };
  resolution: {
    mode: 'read_only_hit' | 'empty_window' | 'generated_new' | 'already_present' | 'write_blocked' | 'write_conflict' | 'write_failed' | 'error';
    notes?: string;
  };
  consumption?: TimelineConsumptionView;
  episodes: Episode[];
}

export interface Episode {
  episode_id: string;
  schema_version: string;
  document_type: string;
  temporal: {
    start: string;
    end: string;
    time_of_day: string; // "morning" | "afternoon" | "evening" | "night"
    granularity: string;
  };
  narrative: {
    summary: string;
    detail?: string;
  };
  state_snapshot: {
    scene: {
      location_kind: string;
      location_label: string;
      activity: string;
      time_of_day: string;
    };
    emotion: {
      primary: string | null;
      secondary: string | null;
      intensity: number;
    };
    appearance: {
      outfit_style: string;
      grooming?: string | null;
      posture_energy?: string | null;
    };
  };
  world_hooks: WorldHooks;
  provenance: {
    writer: string;
    written_at: string;
    idempotency_key: string;
    confidence: number;
  };
}

export interface WorldHooks {
  weekday: boolean;
  holiday_key: string | null;
}

export interface TimelineConsumptionView {
  schema_version: '1.0';
  document_type: 'timeline.consumption';
  query: {
    preset: string;
    semantic_target?: string;
    collection_scope?: string;
    resolution_mode: string;
    time_interpretation?: {
      normalized_kind?: 'now' | 'point' | 'range';
      normalized_point?: string;
      normalized_start?: string;
      normalized_end?: string;
      match_strategy?: 'exact_match' | 'continuation' | 'range_summary' | 'generated';
      summary?: string;
    };
  };
  fact: {
    status: 'resolved' | 'empty';
    source_type: 'canon' | 'generated' | 'none';
    timestamp?: string;
    summary?: string;
    confidence?: number;
    continuity?: {
      judged: boolean;
      is_continuing?: boolean;
      reason?: string;
    };
  };
  scene?: {
    location: string;
    activity: string;
    emotion_primary: string | null;
    emotion_secondary: string | null;
    appearance: string;
    time_of_day: string;
    summary: string;
    city?: string;
    calendar_date?: string;
    local_timestamp?: string;
    timezone?: string;
    activity_mode?: string;
    continuity_relation?: string;
    environment_mood?: string;
    social_context?: string;
    appearance_change_expected?: boolean;
    appearance_change_reason?: string;
    location_props?: string[];
    lighting_hint?: string;
    framing_hint?: string;
  };
  selfie_ready?: {
    location: string;
    activity: string;
    emotion: string | null;
    appearance: string;
    time_of_day: string;
    summary: string;
  };
}
