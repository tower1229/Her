export interface TimelineTransitionInput {
  directive: string;
}

export interface TransitionPlan {
  summary: string;
  estimated_duration_minutes: number;
  started_at: string;
  requires_persona_update: boolean;
  persona_update_data?: any;
  interruption_handling?: 'interrupt' | 'insert_micro_task' | 'reject';
  reject_reason?: string;
  initial_phase: {
    location: string;
    action: string;
    emotionTags: string[];
    appearance: string;
    internalMonologue: string;
  };
}

export interface TimelineTransitionOutput {
  ok: boolean;
  trace_id: string;
  transition?: {
    event_id: string;
    summary: string;
    estimated_duration_minutes: number;
    started_at: string;
    expected_end_at: string;
    requires_persona_update: boolean;
    persona_update_data?: any;
  };
  canon_write?: {
    success: boolean;
    file_path: string;
    error_code?: string;
    error?: string;
    recovery_hint?: string;
  };
  notes: string[];
}
