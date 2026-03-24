import * as fs from 'fs';
import * as path from 'path';
import {
  resetTimelineResolveDependencies,
  setTimelineResolveDependencies,
  timelineResolve,
} from './timeline_resolve';

const tmpDir = path.join(__dirname, '__tmp__');
const tmpFile = path.join(tmpDir, 'memory', '2026-03-22.md');

beforeEach(() => {
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
          summary: '将“最近”归一化为过去三天到当前时刻。',
        };
      }
      return {
        schema_version: '1.0',
        target_time_range: 'now',
        summary: '将请求解释为当前状态查询。',
      };
    },
  });
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('timelineResolve generation path', () => {
  it('refuses to generate when no LLM generation dependency is configured', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['User just asked what are you doing right now?'],
      memoryGet: async () => '',
      coreFiles: async () => ({
        soul: 'She is introspective, creative, loves photography, and enjoys coffee shop afternoons.',
        memory: 'She often organizes notes, keeps a coherent selfie-ready appearance, and likes quiet focused work.',
        identity: 'A 26 years old woman living in Shanghai.',
        available_sources: ['soul', 'memory', 'identity'],
        should_constrain_generation: true,
      }),
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected generation-unavailable error');
    expect(result.error.code).toBe('REASONER_UNAVAILABLE');
    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  it('prefers an injected LLM-style generation path when available', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T20:15:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['The user wants to know what you are up to tonight.'],
      memoryGet: async () => '',
      coreFiles: async () => ({
        soul: 'She is highly customized, expressive, and likes to keep her selfie output grounded in lived memory.',
        memory: 'She often writes in a reflective tone and prefers cozy evening scenes.',
        identity: 'A young woman living in Shanghai.',
        available_sources: ['soul', 'memory', 'identity'],
        should_constrain_generation: true,
      }),
      reasonTimeline: async (collector) => {
        expect(collector.persona_context.soul).toContain('customized');
        expect(collector.persona_context.identity).toContain('Shanghai');
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

  it('reports write_conflict with a recovery hint when the append-only writer detects an occupied bucket', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['The user wants the current state, but another writer already touched this slot.'],
      memoryGet: async () => '',
      coreFiles: async () => ({
        soul: 'She is introspective and likes a coherent autobiographical timeline.',
        memory: 'She often works quietly from home in the afternoon.',
        identity: 'A woman living in Shanghai.',
        available_sources: ['soul', 'memory', 'identity'],
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
    expect(result.trace?.write.file_path).toBe(olderDayFile);
  });

});
