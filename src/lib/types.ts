export interface ParsedEpisode {
  timestamp: string;
  location: string;
  action: string;
  emotionTags: string[];
  appearance: string; // "unknown" when Level B
  internalMonologue?: string;
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
    preset: string; // "now_today" | "recent_3d" | "explicit"
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
