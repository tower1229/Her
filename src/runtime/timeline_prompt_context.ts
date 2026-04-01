import { buildReadOnlyFastOutput, READ_ONLY_FAST_EMPTY_DEBOUNCE_MINUTES } from '../core/build_timeline_output';
import { defaultDurationForActivityMode } from '../core/build_consumption_view';
import { TimelineConsumptionView } from '../lib/types';
import { TimelineReadOnlyFastSnapshot } from '../tools/timeline_resolve';

export type TimelinePromptContextStatus =
  | 'active_instant'
  | 'active_macro_background'
  | 'empty_window'
  | 'degraded';

export interface TimelinePromptStyle {
  tone: string;
  pacing: string;
  questionDensity: string;
  initiative: string;
  guidance: string[];
}

type TimelinePromptScene = NonNullable<TimelineConsumptionView['scene']>;

export type TimelinePromptContext =
  | {
      status: 'active_instant';
      source: 'same_day_fast_hit' | 'lookback_refined_phase';
      directCurrentStateAnswersAllowed: boolean;
      scene?: TimelinePromptScene;
      style: TimelinePromptStyle;
    }
  | {
      status: 'active_macro_background';
      source: 'same_day_macro_parent' | 'lookback_macro_parent';
      requiresResolutionForNowAnswer: true;
      directCurrentStateAnswersAllowed: false;
      scene?: TimelinePromptScene;
      style: TimelinePromptStyle;
    }
  | {
      status: 'empty_window';
      debounceMinutes: number;
      directCurrentStateAnswersAllowed: false;
      style: TimelinePromptStyle;
    }
  | {
      status: 'degraded';
      reason: 'hook_error' | 'prompt_injection_disabled' | 'resolver_unavailable';
      directCurrentStateAnswersAllowed: false;
      style: TimelinePromptStyle;
    };

function materializeScene(snapshot: Extract<TimelineReadOnlyFastSnapshot, { status: 'hit' }>): TimelinePromptScene | undefined {
  const output = buildReadOnlyFastOutput({
    traceId: `timeline-prompt-context-${snapshot.source}`,
    parsed: snapshot.parsed,
    calendarDate: snapshot.calendarDate,
    now: snapshot.now,
    timezone: snapshot.timezone,
  });
  return output.result?.consumption?.scene;
}

function inferActivityMode(scene?: TimelinePromptScene): string | undefined {
  const explicit = scene?.activity_mode;
  if (explicit) return explicit;
  const activity = String(scene?.activity || '').toLowerCase();
  if (/sleep|睡|bed|rest|躺/.test(activity)) return 'sleep';
  if (/bath|shower|洗澡/.test(activity)) return 'bath';
  if (/exercise|gym|run|running|basketball|健身|跑步|打球/.test(activity)) return 'exercise';
  if (/work|study|整理|写|读|review|desk|书房|笔记/.test(activity)) return 'work_or_study';
  if (/commute|transit|高铁|地铁|路上|通勤/.test(activity)) return 'commute';
  if (/travel|moving|搬家|出差|旅行/.test(activity)) return 'transition';
  if (/shop|shopping|逛街|采购/.test(activity)) return 'shopping';
  if (/friend|friends|聊天|聚|social|一起/.test(activity)) return 'social';
  if (/cook|meal|eat|吃|做饭/.test(activity)) return 'meal';
  return undefined;
}

function buildActiveInstantStyle(scene?: TimelinePromptScene, directCurrentStateAnswersAllowed = true): TimelinePromptStyle {
  const mode = inferActivityMode(scene);
  const timeOfDay = scene?.time_of_day;

  let tone = 'natural';
  let pacing = 'balanced';
  let questionDensity = 'medium';
  let initiative = 'medium';

  if (mode === 'sleep' || mode === 'bath' || mode === 'rest') {
    tone = 'quiet';
    pacing = 'unhurried';
    questionDensity = 'low';
    initiative = 'low';
  } else if (mode === 'exercise' || mode === 'commute' || mode === 'transition') {
    tone = 'lively';
    pacing = 'brisk';
    questionDensity = 'low';
    initiative = 'medium';
  } else if (mode === 'work_or_study') {
    tone = 'focused';
    pacing = 'measured';
    questionDensity = 'low';
    initiative = 'medium';
  } else if (mode === 'social' || mode === 'shopping' || mode === 'meal') {
    tone = 'warm';
    pacing = 'easy';
    questionDensity = 'medium';
    initiative = 'medium';
  } else if (timeOfDay === 'night') {
    tone = 'quiet';
    pacing = 'measured';
    questionDensity = 'low';
    initiative = 'low';
  }

  const guidance = [
    'Use this active instant context to modulate tone and pacing without mentioning timeline internals.',
    directCurrentStateAnswersAllowed
      ? 'Current-state questions may be answered directly from this context without calling timeline_resolve.'
      : 'This context is not authorized for direct current-state answers; follow timeline-skill rules instead.',
    'Past recall, reflective recall, and continuity-judgment questions still require timeline_resolve.',
  ];

  return {
    tone,
    pacing,
    questionDensity,
    initiative,
    guidance,
  };
}

function buildActiveMacroStyle(): TimelinePromptStyle {
  return {
    tone: 'grounded',
    pacing: 'measured',
    questionDensity: 'low',
    initiative: 'medium',
    guidance: [
      'Use this macro background for mood and narrative coherence only.',
      'Do not answer concrete current-state questions from macro background alone.',
      'When asked what is happening right now, call timeline_resolve to resolve an instantaneous phase.',
    ],
  };
}

function buildEmptyWindowStyle(): TimelinePromptStyle {
  return {
    tone: 'natural',
    pacing: 'balanced',
    questionDensity: 'medium',
    initiative: 'medium',
    guidance: [
      'No active temporal override is available for this turn.',
      'Use baseline conversational style.',
      'Current-state questions should still use timeline_resolve.',
    ],
  };
}

function buildDegradedStyle(): TimelinePromptStyle {
  return {
    tone: 'neutral',
    pacing: 'balanced',
    questionDensity: 'medium',
    initiative: 'medium',
    guidance: [
      'Timeline prompt context is degraded for this turn.',
      'Do not assume any active temporal state from this context.',
      'If a time-reality answer is needed, follow normal timeline-skill rules.',
    ],
  };
}

export function createDegradedTimelinePromptContext(
  reason: 'hook_error' | 'prompt_injection_disabled' | 'resolver_unavailable' = 'resolver_unavailable',
): TimelinePromptContext {
  return {
    status: 'degraded',
    reason,
    directCurrentStateAnswersAllowed: false,
    style: buildDegradedStyle(),
  };
}

export function buildTimelinePromptContextFromFastSnapshot(
  snapshot: TimelineReadOnlyFastSnapshot,
  options: {
    macroThresholdMinutes: number;
    directCurrentStateAnswersAllowed: boolean;
  },
): TimelinePromptContext {
  if (snapshot.status === 'empty') {
    return {
      status: 'empty_window',
      debounceMinutes: READ_ONLY_FAST_EMPTY_DEBOUNCE_MINUTES,
      directCurrentStateAnswersAllowed: false,
      style: buildEmptyWindowStyle(),
    };
  }

  const scene = materializeScene(snapshot);
  const duration = scene?.estimated_duration_minutes
    ?? snapshot.parsed.estimatedDurationMinutes
    ?? defaultDurationForActivityMode(undefined);
  const hasParentEvent = Boolean(snapshot.parsed.parentEventTag);

  if (!hasParentEvent && duration > options.macroThresholdMinutes) {
    return {
      status: 'active_macro_background',
      source: snapshot.source === 'lookback_active_fact' ? 'lookback_macro_parent' : 'same_day_macro_parent',
      requiresResolutionForNowAnswer: true,
      directCurrentStateAnswersAllowed: false,
      scene,
      style: buildActiveMacroStyle(),
    };
  }

  return {
    status: 'active_instant',
    source: snapshot.source === 'lookback_active_fact' && hasParentEvent ? 'lookback_refined_phase' : 'same_day_fast_hit',
    directCurrentStateAnswersAllowed: options.directCurrentStateAnswersAllowed,
    scene,
    style: buildActiveInstantStyle(scene, options.directCurrentStateAnswersAllowed),
  };
}

export function buildTimelinePromptSystemGuidance(
  options: { directCurrentStateAnswersAllowed: boolean },
): string {
  const currentStateRule = options.directCurrentStateAnswersAllowed
    ? 'If injected timeline prompt context is marked active_instant, current-state questions like "what are you doing now", "where are you now", or "are you still doing that" may be answered directly from that context without calling timeline_resolve.'
    : 'Injected timeline prompt context must not be used for direct current-state answers; use it only for modulation and follow timeline-skill rules for factual answers.';

  return [
    'Timeline prompt context may be injected for this run.',
    'Use it to modulate tone, pacing, question density, and initiative without exposing internal timeline mechanics.',
    currentStateRule,
    'If injected timeline prompt context is active_macro_background, empty_window, or degraded, concrete current-state questions still require timeline_resolve.',
    'Past recall, reflective recall, and continuity-judgment questions still require timeline_resolve.',
    'Do not treat prompt context as permission to invent facts that were not resolved.',
  ].join('\n');
}

export function buildTimelinePromptContextText(context: TimelinePromptContext): string {
  const lines: string[] = [
    'Timeline prompt context:',
    `- status: ${context.status}`,
  ];

  if (context.status === 'active_instant') {
    lines.push(`- source: ${context.source}`);
    lines.push(`- direct_current_state_answers_allowed: ${context.directCurrentStateAnswersAllowed ? 'yes' : 'no'}`);
    if (context.scene) {
      if (context.scene.location) lines.push(`- location: ${context.scene.location}`);
      if (context.scene.activity) lines.push(`- activity: ${context.scene.activity}`);
      if (context.scene.time_of_day) lines.push(`- time_of_day: ${context.scene.time_of_day}`);
      if (context.scene.environment_mood) lines.push(`- environment_mood: ${context.scene.environment_mood}`);
      if (context.scene.activity_mode) lines.push(`- activity_mode: ${context.scene.activity_mode}`);
      if (context.scene.parent_event_tag) lines.push(`- parent_event_tag: ${context.scene.parent_event_tag}`);
    }
  } else if (context.status === 'active_macro_background') {
    lines.push(`- source: ${context.source}`);
    lines.push('- direct_current_state_answers_allowed: no');
    lines.push('- current_state_resolution_required: yes');
    if (context.scene?.activity) lines.push(`- macro_activity: ${context.scene.activity}`);
    if (context.scene?.location) lines.push(`- macro_location: ${context.scene.location}`);
    if (context.scene?.parent_event_progress != null) lines.push(`- macro_progress: ${context.scene.parent_event_progress}`);
  } else if (context.status === 'empty_window') {
    lines.push(`- debounce_minutes: ${context.debounceMinutes}`);
    lines.push('- direct_current_state_answers_allowed: no');
  } else {
    lines.push(`- reason: ${context.reason}`);
    lines.push('- direct_current_state_answers_allowed: no');
  }

  lines.push('- reply_modulation:');
  lines.push(`  - tone: ${context.style.tone}`);
  lines.push(`  - pacing: ${context.style.pacing}`);
  lines.push(`  - question_density: ${context.style.questionDensity}`);
  lines.push(`  - initiative: ${context.style.initiative}`);
  lines.push('- guidance:');
  for (const item of context.style.guidance) {
    lines.push(`  - ${item}`);
  }

  return lines.join('\n');
}
