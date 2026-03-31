import { Episode, TimelineConsumptionView } from '../lib/types';

export type TimelineResolutionMode =
  | 'read_only_hit'
  | 'read_only_fast_hit'
  | 'empty_window'
  | 'generated_new'
  | 'already_present'
  | 'write_blocked'
  | 'write_conflict'
  | 'write_failed'
  | 'error';

export interface TimelineResolutionSummaryContract {
  mode: TimelineResolutionMode;
  writes_attempted: number;
  writes_succeeded: number;
  sources: string[];
  confidence_min: number;
  confidence_max: number;
}

export interface TimelineResolveSuccessContract {
  ok: true;
  schema_version: '1.0';
  trace_id: string;
  resolution_summary: TimelineResolutionSummaryContract;
  result?: {
    schema_version: '1.0';
    document_type: 'timeline.window';
    anchor: { now: string; timezone: string };
    window: {
      calendar_date: string;
      preset: string;
      semantic_target?: string;
      collection_scope?: string;
      start: string;
      end: string;
      idempotency_key: string;
    };
    resolution: {
      mode: TimelineResolutionMode;
      notes?: string;
    };
    consumption?: TimelineConsumptionView;
    episodes: Episode[];
  };
  notes: string[];
}

