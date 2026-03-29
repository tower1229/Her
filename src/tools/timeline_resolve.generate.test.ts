import * as fs from 'fs';
import * as path from 'path';
import { emptyPersonaContract } from '../persona/persona_contract';
import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
  timelineResolve,
} from './timeline_resolve';

const tmpDir = path.join(__dirname, '__tmp__');
const tmpFile = path.join(tmpDir, 'memory', '2026-03-22.md');
const originalCwd = process.cwd();

beforeEach(() => {
  process.chdir(originalCwd);
  resetTimelineResolveDependencies();
  setTimelineResolveDependencies({
    planTimelineQuery: async (input) => {
      const query = String(input.query || '');
      if (query.includes('最近')) {
        return {
          schema_version: '1.0',
          target_time_range: 'past_range',
          normalized_start: '2026-03-19T21:30:00+08:00',
          normalized_end: '2026-03-22T21:30:00+08:00',
          summary: 'Normalized “最近” into the past three days up to the current moment.',
        };
      }
      return {
        schema_version: '1.0',
        target_time_range: 'now',
        summary: 'Interpreted the request as a current-state query.',
      };
    },
  });
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterEach(() => {
  process.chdir(originalCwd);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('timelineResolve generation path', () => {
  it('prefers persona/PERSONA_PROFILE.md in the default workspace personaContext path', async () => {
    fs.mkdirSync(path.join(tmpDir, 'persona'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'persona', 'PERSONA_PROFILE.md'),
      [
        '# PERSONA_PROFILE',
        '',
        '## Meta',
        '- schema_version: 1.0',
        '- home_city: Shanghai',
        '- home_timezone: Asia/Shanghai',
        '',
        '## Identity',
        '- common_zones: [home study, neighborhood cafe]',
        '',
        '## Soul',
        '- temperament: reflective',
        '',
        '## Stable Memory',
        '- long_term_habits:',
        '  - often works quietly from home',
        '',
        '## Appearance Tendencies',
        '- change_triggers: [exercise]',
      ].join('\n'),
      'utf8',
    );

    process.chdir(tmpDir);

    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T20:15:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['The user wants to know what you are up to tonight.'],
      memoryGet: async () => '',
      reasonTimeline: async (collector) => {
        expect(collector.persona_context.contract.identity.home_city).toBe('Shanghai');
        expect(collector.persona_context.contract.soul.temperament).toBe('reflective');
        expect(collector.persona_context.contract.appearance.change_triggers).toContain('exercise');
        return {
          schema_version: '1.0',
          request_id: collector.request_id,
          request_type: 'now',
          decision: {
            action: 'generate_new_fact',
            should_write_canon: true,
          },
          continuity: {
            judged: true,
            is_continuing: false,
            reason: 'no canon fact covered the requested current moment',
          },
          rationale: {
            summary: 'Generated from persona profile context.',
            hard_fact_basis: [],
            canon_basis: [],
            persona_basis: ['profile'],
            constraint_basis: ['respect profile-derived appearance and routine constraints'],
          },
          generated_fact: {
            location: 'home study',
            action: 'quietly organizing thoughts before the night settles',
            emotionTags: ['calm', 'reflective'],
            appearance: 'soft casual homewear',
            internalMonologue: 'Staying grounded in the ordinary details keeps the evening coherent.',
            confidence: 0.83,
            reason: 'persona profile synthesis',
            sceneSemantics: {
              activityMode: 'leisure',
              continuityRelation: 'fresh_moment',
              rationale: 'the profile supports a reflective quiet evening scene',
            },
            appearanceLogic: {
              transition: 'inherit',
              changeReason: 'same_day_continuation',
              outfitMode: 'casual_home',
            },
          },
        };
      },
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.notes.join(' ')).toContain('persona profile synthesis');
    expect(result.result?.consumption?.scene?.city).toBe('Shanghai');
    expect(result.result?.consumption?.scene?.timezone).toBe('Asia/Shanghai');
    expect(result.result?.consumption?.selfie_ready).toEqual({
      location: expect.any(String),
      activity: expect.any(String),
      emotion: expect.any(String),
      appearance: expect.any(String),
      time_of_day: expect.any(String),
      summary: expect.any(String),
    });
    expect(result.result?.consumption?.selfie_ready?.location).toContain('Shanghai');
  });

  it('degrades to forgetfulness empty_window when no LLM generation dependency is configured', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User just asked what are you doing right now?'],
      memoryGet: async () => '',
      personaContext: async () => ({
        contract: {
          ...emptyPersonaContract(),
          identity: {
            ...emptyPersonaContract().identity,
            home_city: 'Shanghai',
          },
          soul: {
            ...emptyPersonaContract().soul,
            temperament: 'introspective',
          },
          memory: {
            ...emptyPersonaContract().memory,
            long_term_habits: ['often organizes notes'],
          },
        },
        available_sources: ['legacy_soul', 'legacy_memory', 'legacy_identity'],
        should_constrain_generation: true,
      }),
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected degraded forgetfulness envelope');
    expect(result.resolution_summary.mode).toBe('empty_window');
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain('记不');
    expect(result.trace?.decision.error_code).toBe('REASONER_UNAVAILABLE');
    expect(result.trace?.notes).toHaveLength(2);
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('prefers an injected LLM-style generation path when available', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T20:15:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['The user wants to know what you are up to tonight.'],
      memoryGet: async () => '',
      personaContext: async () => ({
        contract: {
          ...emptyPersonaContract(),
          identity: {
            ...emptyPersonaContract().identity,
            home_city: 'Shanghai',
          },
          soul: {
            ...emptyPersonaContract().soul,
            values: ['highly customized', 'expressive'],
          },
          memory: {
            ...emptyPersonaContract().memory,
            long_term_preferences: ['cozy evening scenes'],
          },
        },
        available_sources: ['legacy_soul', 'legacy_memory', 'legacy_identity'],
        should_constrain_generation: true,
      }),
      reasonTimeline: async (collector) => {
        expect(collector.persona_context.contract.soul.values).toContain('highly customized');
        expect(collector.persona_context.contract.identity.home_city).toBe('Shanghai');
        return {
          schema_version: '1.0',
          request_id: collector.request_id,
          request_type: 'now',
          decision: {
            action: 'generate_new_fact',
            should_write_canon: true,
          },
          continuity: {
            judged: true,
            is_continuing: false,
            reason: 'no canon fact covered the requested current moment',
          },
          rationale: {
            summary: 'Generated a new evening fact from persona context.',
            hard_fact_basis: [],
            canon_basis: [],
            persona_basis: ['soul', 'memory', 'identity'],
            constraint_basis: ['stay grounded in customized soul', 'respect cozy reflective memory and identity'],
          },
        generated_fact: {
          location: 'a softly lit neighborhood cafe corner',
          action: 'writing down scattered thoughts while waiting for the evening to settle',
          emotionTags: ['calm', 'reflective'],
          appearance: 'a neat casual outfit with a light outer layer',
          internalMonologue: 'This kind of small pause makes the whole day feel more coherent.',
          confidence: 0.83,
          reason: 'llm persona synthesis from customized soul and memory context',
          sceneSemantics: {
            activityMode: 'leisure',
            continuityRelation: 'fresh_moment',
            rationale: 'an evening cafe pause fits the current persona-guided scene',
          },
          appearanceLogic: {
            transition: 'change_required',
            changeReason: 'formal_outing',
            outfitMode: 'casual_outing',
          },
          },
        };
      },
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.result?.episodes).toHaveLength(1);
    const generatedEpisode: any = result.result?.episodes[0];
    expect(generatedEpisode?.state_snapshot?.scene?.location_label).toContain('cafe');
    expect(generatedEpisode?.state_snapshot?.scene?.activity).toContain('writing down scattered thoughts');
    expect(result.notes.join(' ')).toContain('llm persona synthesis');
    expect(result.result?.consumption?.fact.source_type).toBe('generated');
    expect(result.result?.consumption?.selfie_ready?.location).toContain('cafe');
  });

  it('prefers sticky conversation continuity for now queries inside the recent session window', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T20:15:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => [
        'user: 我们刚才一直在聊 timeline 的现实逻辑和穿着连续性',
        'assistant: 我正在把这套状态机和 guard 接到生成链路里。',
      ],
      conversationContext: async () => ({
        is_recently_active: true,
        minutes_since_last_turn: 3,
        stickiness_window_minutes: 10,
        active_topic_summary: '刚才一直在讨论 timeline 的现实逻辑和穿着连续性',
        should_prefer_conversation_continuity_for_now: true,
        last_active_timestamp: '2026-03-22T20:12:00+08:00',
      }),
      memoryGet: async () => '',
      reasonTimeline: async (collector) => {
        expect(collector.conversation_context.should_prefer_conversation_continuity_for_now).toBe(true);
        expect(collector.conversation_context.active_topic_summary).toContain('穿着连续性');
        return {
          schema_version: '1.0',
          request_id: collector.request_id,
          request_type: 'now',
          decision: {
            action: 'generate_new_fact',
            should_write_canon: true,
          },
          continuity: {
            judged: true,
            is_continuing: true,
            reason: 'the current moment is still attached to the conversation that happened a few minutes ago',
          },
          rationale: {
            summary: 'Generated a conversation-continuity current state instead of jumping to an unrelated off-thread life scene.',
            hard_fact_basis: ['user: 我们刚才一直在聊 timeline 的现实逻辑和穿着连续性'],
            canon_basis: [],
            persona_basis: [],
            constraint_basis: ['stay attached to the active conversation inside the stickiness window'],
          },
          generated_fact: {
            location: '和你继续这段对话的当前会话里',
            action: '顺着刚才关于 timeline 现实逻辑和穿着连续性的讨论继续往下想和回应',
            emotionTags: ['专注', '投入'],
            appearance: '舒适的家居服，注意力还停留在这段对话上',
            internalMonologue: '刚才那段讨论还没断开，现在最真实的当下就是继续和你把这件事聊清楚。',
            confidence: 0.86,
            reason: 'session stickiness should keep the current moment attached to the active conversation',
            sceneSemantics: {
              activityMode: 'work_or_study',
              continuityRelation: 'same_scene_continuation',
              rationale: 'the current moment is still part of the same ongoing conversation scene',
            },
            appearanceLogic: {
              transition: 'inherit',
              changeReason: 'same_day_continuation',
              outfitMode: 'casual_home',
            },
          },
        };
      },
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '你在干嘛啊',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected sticky-conversation success envelope');
    const episode: any = result.result?.episodes[0];
    expect(String(episode?.state_snapshot?.scene?.activity || '')).toContain('刚才关于 timeline');
    expect(result.notes.join(' ')).toContain('conversation-continuity');
  });

  it('reports write_conflict with a recovery hint when the append-only writer detects an occupied bucket', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['The user wants the current state, but another writer already touched this slot.'],
      memoryGet: async () => '',
      personaContext: async () => ({
        contract: {
          ...emptyPersonaContract(),
          identity: {
            ...emptyPersonaContract().identity,
            home_city: 'Shanghai',
          },
          soul: {
            ...emptyPersonaContract().soul,
            temperament: 'introspective',
          },
          memory: {
            ...emptyPersonaContract().memory,
            long_term_habits: ['works quietly from home in the afternoon'],
          },
        },
        available_sources: ['legacy_soul', 'legacy_memory', 'legacy_identity'],
        should_constrain_generation: true,
      }),
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        decision: {
          action: 'generate_new_fact',
          should_write_canon: true,
        },
        continuity: {
          judged: true,
          is_continuing: false,
          reason: 'generation is required for the current state',
        },
        rationale: {
          summary: 'Generated a current-state fact for conflict-path validation.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: ['soul', 'memory'],
          constraint_basis: ['stay autobiographically coherent', 'respect quiet home-working routine'],
        },
        generated_fact: {
          location: '家里书房靠窗的桌子',
          action: '继续整理下午的工作内容并回应当前状态询问',
          emotionTags: ['专注', '平静'],
          appearance: '舒适的家居服，头发随意挽起',
          internalMonologue: '先把当前状态稳定下来，后面才不容易漂。',
          confidence: 0.78,
          reason: 'llm timeline generation for conflict-path validation',
          sceneSemantics: {
            activityMode: 'work_or_study',
            continuityRelation: 'same_day_continuation',
            rationale: 'the scene continues a quiet same-day home working rhythm',
          },
          appearanceLogic: {
            transition: 'inherit',
            changeReason: 'same_day_continuation',
            outfitMode: 'casual_home',
          },
        },
      }),
      writeEpisode: async () => ({
        success: false,
        written_at: '',
        outcome: 'conflict',
        error_code: 'CONFLICT_EXISTS',
        error: 'A different episode already occupies the same timeline bucket.',
        recovery_hint: 'Inspect the existing daily log entry before retrying or writing a new canon episode.',
      }),
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success envelope with conflict metadata');
    expect(result.resolution_summary.mode).toBe('write_conflict');
    expect(result.notes.join(' ')).toContain('Recovery hint');
    expect(result.trace?.write.guard).toBe('conflict');
  });

  it('can generate a fresh current-state entry when older same-day canon no longer matches the current window', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked what are you doing right now?'],
      memoryGet: async () => `
### [09:00:00] 早餐
- Timestamp: 2026-03-22 09:00:00
- Location: 家里餐桌
- Action: 慢慢吃早餐
- Emotion_Tags: [平静, 清醒]
- Appearance: 居家服
      `,
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        decision: {
          action: 'generate_new_fact',
          should_write_canon: true,
        },
        continuity: {
          judged: true,
          is_continuing: false,
          reason: 'the earlier breakfast fact is stale for the current moment',
        },
        rationale: {
          summary: 'Generated a fresh current-state fact because stale canon should not be reused.',
          hard_fact_basis: [],
          canon_basis: ['canon:2026-03-22:0'],
          persona_basis: ['afternoon work rhythm'],
          constraint_basis: ['avoid contradicting stale breakfast canon', 'preserve plausible current-state continuity'],
        },
        generated_fact: {
          location: '家里书房靠窗的桌子',
          action: '继续整理下午的工作内容',
          emotionTags: ['专注', '平静'],
          appearance: '舒适的家居服，头发随意挽起',
          internalMonologue: '早餐那一段早就过去了，现在应该以当下状态为准。',
          confidence: 0.81,
          reason: 'llm gap-fill for stale current-state canon',
          sceneSemantics: {
            activityMode: 'work_or_study',
            continuityRelation: 'shifted_scene',
            rationale: 'the day shifted from breakfast into a daytime work scene',
          },
          appearanceLogic: {
            transition: 'inherit',
            changeReason: 'same_day_continuation',
            outfitMode: 'casual_home',
          },
        },
      }),
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated success envelope');
    expect(result.resolution_summary.mode).toBe('generated_new');
    const episode: any = result.result?.episodes[0];
    expect(String(episode?.state_snapshot?.scene?.activity || '')).toContain('下午的工作内容');
  });

  it('writes a generated past-range memory to the generated timestamp day instead of window end day', async () => {
    const olderDayFile = path.join(tmpDir, 'memory', '2026-03-20.md');
    const currentDayFile = path.join(tmpDir, 'memory', '2026-03-22.md');

    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T21:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked: 最近有什么有趣的事吗？'],
      memoryGet: async () => '',
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'past_range',
        decision: {
          action: 'generate_new_fact',
          should_write_canon: true,
        },
        continuity: {
          judged: true,
          reason: 'range query has no reusable canon fact',
        },
        rationale: {
          summary: 'Generated an interesting past-range fact and anchored it to a plausible evening slot inside the recent range.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: ['soul', 'memory'],
          constraint_basis: ['keep recent event aligned with persona interests', 'keep generated recall plausible within recent life pattern'],
        },
        generated_fact: {
          timestamp: '2026-03-20T20:10:00+08:00',
          location: '街角的小书店二层靠窗位置',
          action: '翻到一本意外很喜欢的书，结果一口气坐着读了很久',
          emotionTags: ['投入', '惊喜'],
          appearance: '浅色针织上衣，外套随手搭在椅背上',
          internalMonologue: '本来只是随便进去看看，没想到会被这本书拽住这么久。',
          confidence: 0.82,
          reason: 'interesting-event synthesis inside the recent range',
          sceneSemantics: {
            activityMode: 'leisure',
            continuityRelation: 'fresh_moment',
            rationale: 'the bookstore stop is a distinct memorable leisure event inside the range',
          },
          appearanceLogic: {
            transition: 'change_allowed',
            changeReason: 'shopping',
            outfitMode: 'casual_outing',
          },
        },
      }),
      memoryFilePath: (calendarDate) => path.join(tmpDir, 'memory', `${calendarDate}.md`),
    });

    const result = await timelineResolve({
      query: '最近有什么有趣的事吗',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated past-range success envelope');
    expect(fs.existsSync(olderDayFile)).toBe(true);
    expect(fs.existsSync(currentDayFile)).toBe(false);
    expect(path.normalize(result.trace?.write.file_path ?? '')).toBe(path.normalize(olderDayFile));
  });

  it('keeps a changed outfit when the generated event explicitly requires a same-day wardrobe switch', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T18:20:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User asked what happened this evening.'],
      memoryGet: async () => `
### [09:00:00] 早餐
- Timestamp: 2026-03-22 09:00:00
- Location: 家里餐桌
- Action: 慢慢吃早餐
- Emotion_Tags: [平静, 清醒]
- Appearance: 宽松的家居服
      `,
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        decision: {
          action: 'generate_new_fact',
          should_write_canon: true,
        },
        continuity: {
          judged: true,
          is_continuing: false,
          reason: 'the evening gym visit is a new same-day scene and should not inherit breakfast clothes',
        },
        rationale: {
          summary: 'Generated an evening exercise scene with an explicit outfit change.',
          hard_fact_basis: [],
          canon_basis: ['canon:2026-03-22:0'],
          persona_basis: ['active evening routine'],
          constraint_basis: ['exercise should trigger a same-day outfit change'],
        },
        generated_fact: {
          location: '小区健身房',
          action: '傍晚去健身房练了一会儿腿，准备回家冲澡',
          emotionTags: ['投入', '放松'],
          appearance: '速干运动背心和训练短裤',
          internalMonologue: '白天那套家居服不适合运动，这样活动起来更利落。',
          confidence: 0.8,
          reason: 'exercise scene should switch out of home clothes',
          sceneSemantics: {
            activityMode: 'exercise',
            continuityRelation: 'shifted_scene',
            rationale: 'the day shifted from a home scene into an evening workout scene',
          },
          appearanceLogic: {
            transition: 'change_required',
            changeReason: 'exercise',
            outfitMode: 'sportswear',
          },
        },
      }),
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '你现在在做什么',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated success envelope');
    const episode: any = result.result?.episodes[0];
    expect(String(episode?.state_snapshot?.appearance?.outfit_style || '')).toContain('运动');
    expect(result.trace?.appearance.inherited).toBe(false);
    expect(result.trace?.appearance.transition).toBe('change_required');
    expect(result.trace?.appearance.outfit_mode).toBe('sportswear');
  });

  it('retries once with continuity policy when allow_generate initially returns empty', async () => {
    const reasonTimeline = jest.fn(async (collector) => {
      if (collector.request.recovery_hint !== 'prefer_generation') {
        return {
          schema_version: '1.0' as const,
          request_id: collector.request_id,
          request_type: 'past_range' as const,
          decision: {
            action: 'return_empty' as const,
            should_write_canon: false,
          },
          continuity: {
            judged: true,
            is_continuing: false,
            reason: 'blank breakfast window in canon',
          },
          rationale: {
            summary: 'No reusable breakfast fact was found in the requested window.',
            hard_fact_basis: [],
            canon_basis: [],
            persona_basis: [],
            constraint_basis: [],
          },
        };
      }
      return {
        schema_version: '1.0' as const,
        request_id: collector.request_id,
        request_type: 'past_range' as const,
        decision: {
          action: 'generate_new_fact' as const,
          should_write_canon: true,
        },
        continuity: {
          judged: true,
          is_continuing: false,
          reason: 'non-sleep blank window should be gap-filled in allow_generate mode',
        },
        rationale: {
          summary: 'Generated a conservative breakfast memory after continuity-policy retry.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: ['morning home routine'],
          constraint_basis: ['keep breakfast timing plausible and non-contradictory'],
        },
        generated_fact: {
          timestamp: '2026-03-22T07:40:00+08:00',
          location: '家里厨房',
          action: '简单准备了早餐并慢慢吃完',
          emotionTags: ['平静', '清醒'],
          appearance: '宽松的家居服，刚起床的状态',
          internalMonologue: '这段早餐很普通，但确实是那天早上的一部分。',
          confidence: 0.61,
          reason: 'allow_generate continuity fallback for a non-sleep blank window',
          sceneSemantics: {
            activityMode: 'meal' as const,
            continuityRelation: 'fresh_moment' as const,
            rationale: 'the generated event is a plausible breakfast scene inside the requested range',
          },
          appearanceLogic: {
            transition: 'inherit' as const,
            changeReason: 'same_day_continuation' as const,
            outfitMode: 'casual_home' as const,
          },
        },
      };
    });

    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T23:59:59+08:00', timezone: 'Asia/Shanghai' }),
      planTimelineQuery: async () => ({
        schema_version: '1.0',
        target_time_range: 'past_range',
        normalized_start: '2026-03-22T06:00:00+08:00',
        normalized_end: '2026-03-22T09:00:00+08:00',
        summary: 'Normalized breakfast question into 06:00-09:00 range.',
      }),
      sessionsHistory: async () => ['user: 今天吃早饭了吗'],
      memoryGet: async () => '',
      reasonTimeline,
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '今天吃早饭了吗',
      mode: 'allow_generate',
      trace: true,
    });

    expect(reasonTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ recovery_hint: 'prefer_generation' }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated success envelope');
    expect(result.resolution_summary.mode).toBe('generated_new');
    expect(result.result?.consumption?.fact.source_type).toBe('generated');
  });

});
