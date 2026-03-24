import { TimelineResolveInput } from '../tools/timeline_resolve';
import { enumerateCalendarDates } from './calendar_dates';
import { ResolvedWindow } from './resolve_window';

export interface TimelineCoreContext {
  soul: string;
  memory: string;
  identity: string;
  available_sources: string[];
  should_constrain_generation: boolean;
}

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
  coreFiles?: () => Promise<TimelineCoreContext>;
}

export interface CollectedSources {
  sourceOrder: string[];
  sessionsHistory: string[];
  dailyLogs: Array<{
    calendar_date: string;
    raw_content: string;
  }>;
  memorySearch: string[];
  coreContext: TimelineCoreContext;
  conversationContext: TimelineConversationContext;
}

export async function collectSources(
  deps: TimelineSourceDependencies,
  window: ResolvedWindow,
  input: TimelineResolveInput,
): Promise<CollectedSources> {
  const sourceOrder: string[] = [];
  const calendarDates = enumerateCalendarDates(window.start, window.end);

  sourceOrder.push('sessions_history');
  const sessionsHistory = await deps.sessionsHistory(window, input);

  sourceOrder.push('memory_get');
  const dailyLogs = await Promise.all(
    calendarDates.map(async (calendarDate) => ({
      calendar_date: calendarDate,
      raw_content: await deps.memoryGet(calendarDate, window, input),
    })),
  );

  let memorySearch: string[] = [];
  if (deps.memorySearch) {
    sourceOrder.push('memory_search');
    memorySearch = await deps.memorySearch(window, input);
  }

  const coreContext = deps.coreFiles
    ? await deps.coreFiles()
    : {
        soul: '',
        memory: '',
        identity: '',
        available_sources: [],
        should_constrain_generation: false,
      };
  const conversationContext = deps.conversationContext
    ? await deps.conversationContext(window, input)
    : {
        is_recently_active: false,
        minutes_since_last_turn: null,
        stickiness_window_minutes: 10,
        active_topic_summary: '',
        should_prefer_conversation_continuity_for_now: false,
      };

  return { sourceOrder, sessionsHistory, dailyLogs, memorySearch, coreContext, conversationContext };
}
