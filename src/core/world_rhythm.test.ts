import { buildTimelineWorldContext, buildWorldRhythmSlot, validateGeneratedWorldRhythm } from './world_rhythm';
import { ResolvedWindow } from './resolve_window';

describe('world rhythm guidance', () => {
  it('marks weekday lunch windows with realistic midday guidance', () => {
    const slot = buildWorldRhythmSlot('2026-03-24T12:20:00+08:00');
    expect(slot).toBeTruthy();
    expect(slot?.time_band).toBe('midday');
    expect(slot?.weekday).toBe(true);
    expect(slot?.encouraged_modes).toEqual(expect.arrayContaining(['lunch', 'work_or_study']));
  });

  it('marks holidays as holiday day kinds with special notes', () => {
    const slot = buildWorldRhythmSlot('2026-10-01T18:30:00+08:00');
    expect(slot?.day_kind).toBe('holiday');
    expect(slot?.holiday_key).toBe('National Day');
    expect(slot?.notes.join(' ')).toContain('Public holiday context');
  });

  it('builds a range-aware world context from the resolved window', () => {
    const window: ResolvedWindow = {
      query_range: 'past_range',
      semantic_target: 'past_range',
      collection_scope: 'explicit_range',
      start: '2026-03-20T00:00:00+08:00',
      end: '2026-03-22T23:59:59+08:00',
      calendar_date: '2026-03-20',
      calendar_dates: ['2026-03-20', '2026-03-21', '2026-03-22'],
      timezone: 'Asia/Shanghai',
      normalization_notes: [],
    };

    const context = buildTimelineWorldContext(window);
    expect(context.target).toBeNull();
    expect(context.range_calendar).toHaveLength(3);
    expect(context.range_calendar[1].day_kind).toBe('weekend');
  });

  it('rejects obvious real-world timing contradictions for generated facts', () => {
    const validation = validateGeneratedWorldRhythm({
      timestamp: '2026-03-24T03:20:00+08:00',
      location: 'home kitchen',
      action: 'eating breakfast before starting the day',
      emotionTags: ['sleepy'],
      appearance: 'pajamas',
      internalMonologue: 'Breakfast should wake me up.',
      confidence: 0.6,
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues.join(' ')).toContain('Breakfast-like activity');
  });

  it('prefers structured scene semantics over keyword guessing when validating rhythm', () => {
    const validation = validateGeneratedWorldRhythm({
      timestamp: '2026-03-24T14:20:00+08:00',
      location: 'home',
      action: 'staying still for a while',
      emotionTags: ['sleepy'],
      appearance: 'pajamas',
      internalMonologue: 'I should probably rest more.',
      confidence: 0.6,
      sceneSemantics: {
        activityMode: 'sleep',
        continuityRelation: 'same_scene_continuation',
        rationale: 'the generated scene explicitly represents daytime sleeping',
      },
      appearanceLogic: {
        transition: 'inherit',
        changeReason: 'same_day_continuation',
        outfitMode: 'sleepwear',
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.issues.join(' ')).toContain('Sleeping activity');
  });
});
