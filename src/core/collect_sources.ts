import { TimelineResolveInput } from '../tools/timeline_resolve';
import { ResolvedWindow } from './resolve_window';

export interface TimelineCoreContext {
  soul: string;
  memory: string;
  identity: string;
}

export interface TimelineSourceDependencies {
  currentTime: () => Promise<{ now: string; timezone: string }>;
  sessionsHistory: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<string[]>;
  memoryGet: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<string>;
  memorySearch?: (window: ResolvedWindow, input: TimelineResolveInput) => Promise<string[]>;
  coreFiles?: () => Promise<TimelineCoreContext>;
}

export interface CollectedSources {
  sourceOrder: string[];
  sessionsHistory: string[];
  memoryContent: string;
  memorySearch: string[];
  coreContext: TimelineCoreContext;
}

export async function collectSources(
  deps: TimelineSourceDependencies,
  window: ResolvedWindow,
  input: TimelineResolveInput,
): Promise<CollectedSources> {
  const sourceOrder: string[] = [];

  sourceOrder.push('sessions_history');
  const sessionsHistory = await deps.sessionsHistory(window, input);

  sourceOrder.push('memory_get');
  const memoryContent = await deps.memoryGet(window, input);

  let memorySearch: string[] = [];
  if (deps.memorySearch && (input.target_time_range === 'recent_3d' || input.target_time_range === 'natural_language')) {
    sourceOrder.push('memory_search');
    memorySearch = await deps.memorySearch(window, input);
  }

  const coreContext = deps.coreFiles
    ? await deps.coreFiles()
    : { soul: '', memory: '', identity: '' };

  return { sourceOrder, sessionsHistory, memoryContent, memorySearch, coreContext };
}
