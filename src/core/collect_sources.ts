import { TimelineResolveInput } from '../tools/timeline_resolve';
import { enumerateLogDates } from './calendar_dates';
import { ResolvedWindow } from './resolve_window';
import { TimelinePersonaContext, emptyPersonaContract } from '../persona/persona_contract';
import { collectActiveFacts } from './collect_active_facts';
import { CollectedTimelineFact } from './timeline_reasoner_contract';

export interface TimelineConversationContext {
  is_recently_active: boolean;
  minutes_since_last_turn: number | null;
  stickiness_window_minutes: number;
  active_topic_summary: string;
  should_prefer_conversation_continuity_for_now: boolean;
  last_active_timestamp?: string;
}

export interface TimelineSourceDependencies {
  legacyLogTimezone?: string;
  currentStateLookbackDays?: number;
  currentTime: () => Promise<{ now: string; timezone: string }>;
  sessionsHistory: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<string[]>;
  conversationContext?: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<TimelineConversationContext>;
  memoryGet: (calendarDate: string, window: ResolvedWindow, input: TimelineResolveInput) => Promise<string>;
  memorySearchStatus?: { state: 'available' | 'unavailable' | 'denied' | 'failed'; reason?: string };
  memorySearch?: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<string[]>;
  personaContext?: () => Promise<TimelinePersonaContext>;
}

export interface CollectedSources {
  currentBackgroundFacts?: CollectedTimelineFact[];
  memorySearchStatus?: TimelineSourceDependencies['memorySearchStatus'];
  legacyLogTimezone?: string;
  sourceOrder: string[];
  sessionsHistory: string[];
  dailyLogs: Array<{
    calendar_date: string;
    raw_content: string;
  }>;
  memorySearch: string[];
  personaContext: TimelinePersonaContext;
  conversationContext: TimelineConversationContext;
}

export async function collectSources(
  deps: TimelineSourceDependencies,
  window: ResolvedWindow,
  input: TimelineResolveInput,
): Promise<CollectedSources> {
  const calendarDates = enumerateLogDates(window.start, window.end, deps.legacyLogTimezone);
  const reads = new Map<string, Promise<string>>();
  const readDay = (date: string): Promise<string> => {
    if (!reads.has(date)) reads.set(date, deps.memoryGet(date, window, input));
    return reads.get(date)!;
  };

  const search = async (): Promise<{ hits: string[]; status: NonNullable<TimelineSourceDependencies['memorySearchStatus']> }> => {
    if (!deps.memorySearch || (deps.memorySearchStatus && deps.memorySearchStatus.state !== 'available')) {
      return { hits: [], status: deps.memorySearchStatus ?? { state: 'unavailable' } };
    }
    try { return { hits: await deps.memorySearch(window, input), status: { state: 'available' } }; }
    catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { hits: [], status: { state: /denied|forbidden|permission/i.test(reason) ? 'denied' : 'failed', reason } };
    }
  };
  const [sessionsHistory, dailyLogs, searchResult, personaContext, conversationContext, currentBackgroundFacts] =
    await Promise.all([
      deps.sessionsHistory(window, input),
      Promise.all(
        calendarDates.map(async (calendarDate) => ({
          calendar_date: calendarDate,
          raw_content: await readDay(calendarDate),
        })),
      ),
      search(),
      deps.personaContext
        ? deps.personaContext()
        : ({
            contract: emptyPersonaContract(),
            available_sources: [] as string[],
            should_constrain_generation: false,
          } as TimelinePersonaContext),
      deps.conversationContext
        ? deps.conversationContext(window, input)
        : ({
            is_recently_active: false,
            minutes_since_last_turn: null,
            stickiness_window_minutes: 10,
            active_topic_summary: '',
            should_prefer_conversation_continuity_for_now: false,
          } as TimelineConversationContext),
      // Keep the query window intact while supplying parents that began on earlier days.
      window.query_range === 'now' && (deps.currentStateLookbackDays ?? 0) > 1
        ? collectActiveFacts(readDay, window.end, deps.currentStateLookbackDays, deps.legacyLogTimezone)
          .then(facts => facts.filter(fact => !calendarDates.includes(fact.calendar_date)))
        : [],
    ]);

  const sourceOrder: string[] = ['sessions_history', 'memory_get'];
  if (searchResult.status.state === 'available') sourceOrder.push('memory_search');

  return { legacyLogTimezone: deps.legacyLogTimezone, sourceOrder, sessionsHistory, dailyLogs, currentBackgroundFacts, memorySearch: searchResult.hits, memorySearchStatus: searchResult.status, personaContext, conversationContext };
}
