import { TimelineResolveInput } from '../tools/timeline_resolve';
import { enumerateCalendarDates } from './calendar_dates';
import { ResolvedWindow } from './resolve_window';
import { TimelinePersonaContext, emptyPersonaContract } from '../persona/persona_contract';

export interface TimelineConversationContext {
  is_recently_active: boolean;
  minutes_since_last_turn: number | null;
  stickiness_window_minutes: number;
  active_topic_summary: string;
  should_prefer_conversation_continuity_for_now: boolean;
  last_active_timestamp?: string;
}

export interface TimelineSourceDependencies {
  currentTime: () => Promise<{ now: string; timezone: string }>;
  sessionsHistory: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<string[]>;
  conversationContext?: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<TimelineConversationContext>;
  memoryGet: (calendarDate: string, window: ResolvedWindow, input: TimelineResolveInput) => Promise<string>;
  memorySearch?: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<string[]>;
  personaContext?: () => Promise<TimelinePersonaContext>;
}

export interface CollectedSources {
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
  const calendarDates = enumerateCalendarDates(window.start, window.end);

  const [sessionsHistory, dailyLogs, memorySearch, personaContext, conversationContext] =
    await Promise.all([
      deps.sessionsHistory(window, input),
      Promise.all(
        calendarDates.map(async (calendarDate) => ({
          calendar_date: calendarDate,
          raw_content: await deps.memoryGet(calendarDate, window, input),
        })),
      ),
      deps.memorySearch
        ? deps.memorySearch(window, input)
        : ([] as string[]),
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
    ]);

  const sourceOrder: string[] = ['sessions_history', 'memory_get'];
  if (deps.memorySearch) sourceOrder.push('memory_search');

  return { sourceOrder, sessionsHistory, dailyLogs, memorySearch, personaContext, conversationContext };
}
