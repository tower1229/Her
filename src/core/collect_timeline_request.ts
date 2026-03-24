import { parseMemoryFile } from '../lib/parse-memory';
import { TimelineResolveInput } from '../tools/timeline_resolve';
import { enumerateCalendarDates } from './calendar_dates';
import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';
import { TimelineCollectorOutput } from './timeline_reasoner_contract';
import { buildTimelineWorldContext } from './world_rhythm';

export function buildTimelineCollectorOutput(
  requestId: string,
  input: TimelineResolveInput,
  window: ResolvedWindow,
  sources: CollectedSources,
): TimelineCollectorOutput {
  const dailyLogs = sources.dailyLogs.map((entry) => {
    const parsedEpisodes = parseMemoryFile(entry.raw_content);
    return {
      calendar_date: entry.calendar_date,
      raw_content: entry.raw_content,
      parsed_episodes: parsedEpisodes,
    };
  });

  return {
    schema_version: '1.0',
    request_id: requestId,
    request: {
      user_query: input.query,
      mode: input.mode || 'allow_generate',
    },
    anchor: {
      now: window.end,
      timezone: window.timezone,
    },
    window: {
      query_range: window.query_range,
      semantic_target: window.semantic_target,
      collection_scope: window.collection_scope,
      start: window.start,
      end: window.end,
      calendar_dates: window.calendar_dates.length > 0 ? window.calendar_dates : enumerateCalendarDates(window.start, window.end),
      normalization_notes: window.normalization_notes,
    },
    source_order: sources.sourceOrder,
    hard_facts: {
      sessions_history: sources.sessionsHistory,
    },
    canon_memory: {
      daily_logs: dailyLogs.map((entry) => ({
        calendar_date: entry.calendar_date,
        raw_content: entry.raw_content,
        parsed_episode_count: entry.parsed_episodes.length,
      })),
    },
    semantic_memory: {
      memory_search: sources.memorySearch,
    },
    persona_context: {
      soul: sources.coreContext.soul,
      memory: sources.coreContext.memory,
      identity: sources.coreContext.identity,
      available_sources: sources.coreContext.available_sources,
      should_constrain_generation: sources.coreContext.should_constrain_generation,
    },
    world_context: buildTimelineWorldContext({
      ...window,
      calendar_dates: window.calendar_dates.length > 0 ? window.calendar_dates : enumerateCalendarDates(window.start, window.end),
    }),
    candidate_facts: dailyLogs.flatMap((entry) =>
      entry.parsed_episodes.map((episode, index) => ({
        fact_id: `canon:${entry.calendar_date}:${index}`,
        source_type: 'canon_daily_log' as const,
        calendar_date: entry.calendar_date,
        timestamp: episode.timestamp,
        location: episode.location,
        action: episode.action,
        emotion_tags: episode.emotionTags,
        appearance: episode.appearance,
        internal_monologue: episode.internalMonologue,
        parse_level: episode.parseLevel,
        confidence: episode.confidence,
      })),
    ),
  };
}
