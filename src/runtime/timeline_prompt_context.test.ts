import {
  buildTimelinePromptContextFromFastSnapshot,
  buildTimelinePromptContextText,
  buildTimelinePromptSystemGuidance,
  createDegradedTimelinePromptContext,
} from './timeline_prompt_context';

describe('timeline prompt context', () => {
  it('classifies a refined phase as active_instant and allows direct current-state answers', () => {
    const context = buildTimelinePromptContextFromFastSnapshot(
      {
        status: 'hit',
        source: 'lookback_active_fact',
        now: '2026-04-01T09:00:00+08:00',
        timezone: 'Asia/Shanghai',
        calendarDate: '2026-03-31',
        parsed: {
          timestamp: '2026-03-31 22:30:00',
          location: '夜间列车卧铺',
          action: '在去大理的夜车上准备休息',
          emotionTags: ['疲惫', '期待'],
          appearance: '宽松外套',
          parseLevel: 'A',
          confidence: 0.92,
          estimatedDurationMinutes: 90,
          parentEventTag: 'evt-20260331-080000',
          parentEventPhase: 'overnight-transit',
          parentEventProgress: 0.75,
        },
      },
      {
        macroThresholdMinutes: 120,
        directCurrentStateAnswersAllowed: true,
      },
    );

    expect(context.status).toBe('active_instant');
    if (context.status !== 'active_instant') throw new Error('expected active_instant');
    expect(context.source).toBe('lookback_refined_phase');
    expect(context.directCurrentStateAnswersAllowed).toBe(true);
    expect(context.style.guidance.join(' ')).toContain('Current-state questions may be answered directly');
  });

  it('classifies a long-running parent event as active_macro_background', () => {
    const context = buildTimelinePromptContextFromFastSnapshot(
      {
        status: 'hit',
        source: 'lookback_active_fact',
        now: '2026-04-01T09:00:00+08:00',
        timezone: 'Asia/Shanghai',
        calendarDate: '2026-03-31',
        parsed: {
          timestamp: '2026-03-31 08:00:00',
          location: '从上海搬去大理的途中',
          action: '整段搬家行程仍在持续',
          emotionTags: ['专注'],
          appearance: '便于出行的休闲装',
          parseLevel: 'A',
          confidence: 0.88,
          estimatedDurationMinutes: 2880,
          eventId: 'evt-20260331-080000',
        },
      },
      {
        macroThresholdMinutes: 120,
        directCurrentStateAnswersAllowed: true,
      },
    );

    expect(context.status).toBe('active_macro_background');
    if (context.status !== 'active_macro_background') throw new Error('expected active_macro_background');
    expect(context.requiresResolutionForNowAnswer).toBe(true);
    expect(context.directCurrentStateAnswersAllowed).toBe(false);
    expect(context.style.guidance.join(' ')).toContain('Do not answer concrete current-state questions');
  });

  it('classifies empty snapshots as empty_window with baseline style', () => {
    const context = buildTimelinePromptContextFromFastSnapshot(
      {
        status: 'empty',
        now: '2026-04-01T09:00:00+08:00',
        timezone: 'Asia/Shanghai',
        calendarDate: '2026-04-01',
      },
      {
        macroThresholdMinutes: 120,
        directCurrentStateAnswersAllowed: true,
      },
    );

    expect(context.status).toBe('empty_window');
    if (context.status !== 'empty_window') throw new Error('expected empty_window');
    expect(context.debounceMinutes).toBe(30);
    expect(context.style.tone).toBe('natural');
  });

  it('infers duration from scene activity when explicit Estimated_Duration is missing', () => {
    const context = buildTimelinePromptContextFromFastSnapshot(
      {
        status: 'hit',
        source: 'same_day_fast_hit',
        now: '2026-04-01T02:30:00+08:00',
        timezone: 'Asia/Shanghai',
        calendarDate: '2026-04-01',
        parsed: {
          timestamp: '2026-04-01 00:30:00',
          location: '卧室',
          action: '已经洗漱完，正准备睡觉',
          emotionTags: ['困倦'],
          appearance: '宽松睡衣',
          parseLevel: 'A',
          confidence: 0.9,
        },
      },
      {
        macroThresholdMinutes: 120,
        directCurrentStateAnswersAllowed: true,
      },
    );

    expect(context.status).toBe('active_macro_background');
    if (context.status !== 'active_macro_background') throw new Error('expected active_macro_background');
    expect(context.style.tone).toBe('grounded');
  });

  it('formats degraded prompt context without exposing raw errors', () => {
    const context = createDegradedTimelinePromptContext('resolver_unavailable');
    const text = buildTimelinePromptContextText(context);
    const systemGuidance = buildTimelinePromptSystemGuidance({
      directCurrentStateAnswersAllowed: true,
    });

    expect(context.status).toBe('degraded');
    expect(text).toContain('status: degraded');
    expect(text).toContain('reason: resolver_unavailable');
    expect(text).not.toContain('stack');
    expect(systemGuidance).toContain('current-state questions');
  });
});
