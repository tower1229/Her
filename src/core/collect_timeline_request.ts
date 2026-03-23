import { parseMemoryFile } from '../lib/parse-memory';
import { TimelineResolveInput } from '../tools/timeline_resolve';
import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';
import { TimelineCollectorOutput } from './timeline_reasoner_contract';

function enumerateCalendarDates(start: string, end: string): string[] {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    const fallback = start.slice(0, 10);
    return fallback ? [fallback] : [];
  }

  const dates: string[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const endFloor = new Date(endDate);
  endFloor.setHours(0, 0, 0, 0);

  while (current.getTime() <= endFloor.getTime()) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function buildTimelineCollectorOutput(
  requestId: string,
  input: TimelineResolveInput,
  window: ResolvedWindow,
  sources: CollectedSources,
): TimelineCollectorOutput {
  const parsedEpisodes = parseMemoryFile(sources.memoryContent);

  return {
    schema_version: '1.0',
    request_id: requestId,
    request: {
      user_query: input.query,
      target_time_range: input.target_time_range,
      reason: input.reason,
      mode: input.mode,
    },
    anchor: {
      now: window.end,
      timezone: window.timezone,
    },
    window: {
      legacy_preset: window.legacy_preset,
      semantic_target: window.semantic_target,
      collection_scope: window.collection_scope,
      start: window.start,
      end: window.end,
      calendar_dates: enumerateCalendarDates(window.start, window.end),
    },
    source_order: sources.sourceOrder,
    hard_facts: {
      sessions_history: sources.sessionsHistory,
    },
    canon_memory: {
      daily_logs: [
        {
          calendar_date: window.calendar_date,
          raw_content: sources.memoryContent,
          parsed_episode_count: parsedEpisodes.length,
        },
      ],
    },
    semantic_memory: {
      memory_search: sources.memorySearch,
    },
    persona_context: {
      soul: sources.coreContext.soul,
      memory: sources.coreContext.memory,
      identity: sources.coreContext.identity,
    },
    candidate_facts: parsedEpisodes.map((episode, index) => ({
      fact_id: `canon:${window.calendar_date}:${index}`,
      source_type: 'canon_daily_log',
      calendar_date: window.calendar_date,
      timestamp: episode.timestamp,
      location: episode.location,
      action: episode.action,
      emotion_tags: episode.emotionTags,
      appearance: episode.appearance,
      internal_monologue: episode.internalMonologue,
      natural_text: episode.naturalText,
      parse_level: episode.parseLevel,
      confidence: episode.confidence,
    })),
  };
}
