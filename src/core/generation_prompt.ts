import { CollectedSources } from './collect_sources';
import { ResolvedWindow } from './resolve_window';

export interface TimelineGenerationRequest {
  window: ResolvedWindow;
  sources: CollectedSources;
  prompt: string;
}

export function buildTimelineGenerationPrompt(window: ResolvedWindow, sources: CollectedSources): string {
  return [
    'You are generating a plausible autobiographical timeline memory for OpenClaw.',
    'Goal: when canon is blank, create one memory that is faithful to persona context and real-world time context.',
    'Hard rules:',
    '- Do not contradict sessions_history or existing same-day canon.',
    '- Treat SOUL, MEMORY, and IDENTITY as high-value semantic persona context.',
    '- Use weekday / holiday / time-of-day to keep the memory realistic.',
    '- Output one JSON object only with keys: location, action, emotionTags, appearance, internalMonologue, naturalText, confidence, reason.',
    '',
    `Semantic target: ${window.semantic_target}`,
    `Collection scope: ${window.collection_scope}`,
    `Legacy preset: ${window.legacy_preset}`,
    `Window start: ${window.start}`,
    `Window end: ${window.end}`,
    `Calendar date: ${window.calendar_date}`,
    '',
    'sessions_history:',
    JSON.stringify(sources.sessionsHistory, null, 2),
    '',
    'memory_get daily log:',
    sources.memoryContent || '(empty)',
    '',
    'memory_search:',
    JSON.stringify(sources.memorySearch, null, 2),
    '',
    'SOUL.md:',
    sources.coreContext.soul || '(empty)',
    '',
    'MEMORY.md:',
    sources.coreContext.memory || '(empty)',
    '',
    'IDENTITY:',
    sources.coreContext.identity || '(empty)',
  ].join('\n');
}
