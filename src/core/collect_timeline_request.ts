import { parseMemoryFile } from '../lib/parse-memory';
import { TimelineResolveInput } from '../tools/timeline_resolve';
import { enumerateCalendarDates } from './calendar_dates';
import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';
import { TimelineCollectorOutput } from './timeline_reasoner_contract';
import { buildTimelineWorldContext, WorldRhythmSlot } from './world_rhythm';

const MAX_RAW_CONTENT_CHARS = 2000;

function truncateRawContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const half = Math.floor((maxChars - 30) / 2);
  return `${content.slice(0, half)}\n[...truncated...]\n${content.slice(-half)}`;
}

function deduplicateRangeCalendar(slots: WorldRhythmSlot[]): WorldRhythmSlot[] {
  const seen = new Set<string>();
  return slots.filter((slot) => {
    const key = `${slot.season}:${slot.day_kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
      mode: (input.mode === 'read_only' ? 'read_only' : 'allow_generate') as 'read_only' | 'allow_generate',
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
    conversation_context: sources.conversationContext,
    canon_memory: {
      daily_logs: dailyLogs.map((entry) => ({
        calendar_date: entry.calendar_date,
        raw_content: truncateRawContent(entry.raw_content, MAX_RAW_CONTENT_CHARS),
        parsed_episode_count: entry.parsed_episodes.length,
      })),
    },
    semantic_memory: {
      memory_search: sources.memorySearch,
    },
    persona_context: {
      contract: sources.personaContext.contract,
      available_sources: sources.personaContext.available_sources,
      should_constrain_generation: sources.personaContext.should_constrain_generation,
    },
    world_context: (() => {
      const ctx = buildTimelineWorldContext({
        ...window,
        calendar_dates: window.calendar_dates.length > 0 ? window.calendar_dates : enumerateCalendarDates(window.start, window.end),
      });
      return {
        target: ctx.target,
        range_calendar: deduplicateRangeCalendar(ctx.range_calendar),
      };
    })(),
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
