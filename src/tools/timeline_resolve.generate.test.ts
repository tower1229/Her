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
      }),
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
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
      }),
      reasonTimeline: async (collector) => {
        expect(collector.persona_context.soul).toContain('customized');
        expect(collector.persona_context.identity).toContain('Shanghai');
        return {
          schema_version: '1.0',
          request_id: collector.request_id,
          request_type: 'current_status',
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
          },
          generated_fact: {
          location: 'a softly lit neighborhood cafe corner',
          action: 'writing down scattered thoughts while waiting for the evening to settle',
          emotionTags: ['calm', 'reflective'],
          appearance: 'a neat casual outfit with a light outer layer',
          internalMonologue: 'This kind of small pause makes the whole day feel more coherent.',
          naturalText: 'She is spending the evening in a quiet cafe, letting the day taper into a reflective mood.',
          confidence: 0.83,
          reason: 'llm persona synthesis from customized soul and memory context',
          },
        };
      },
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.result?.episodes).toHaveLength(1);
    const generatedEpisode: any = result.result?.episodes[0];
    expect(generatedEpisode?.state_snapshot?.scene?.location_label).toContain('cafe');
    expect(generatedEpisode?.state_snapshot?.scene?.activity).toContain('writing down scattered thoughts');
    expect(result.notes.join(' ')).toContain('llm persona synthesis');
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
      }),
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'current_status',
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
        },
        generated_fact: {
          location: '家里书房靠窗的桌子',
          action: '继续整理下午的工作内容并回应当前状态询问',
          emotionTags: ['专注', '平静'],
          appearance: '舒适的家居服，头发随意挽起',
          internalMonologue: '先把当前状态稳定下来，后面才不容易漂。',
          naturalText: '她还在家里书房里继续下午的工作。',
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
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
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
        request_type: 'current_status',
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
          persona_basis: [],
        },
        generated_fact: {
          location: '家里书房靠窗的桌子',
          action: '继续整理下午的工作内容',
          emotionTags: ['专注', '平静'],
          appearance: '舒适的家居服，头发随意挽起',
          internalMonologue: '早餐那一段早就过去了，现在应该以当下状态为准。',
          naturalText: '她现在正在家里书房继续下午的工作内容。',
          confidence: 0.81,
          reason: 'llm gap-fill for stale current-state canon',
        },
      }),
      memoryFilePath: () => tmpFile,
    });

    const result = await timelineResolve({
      target_time_range: 'now_today',
      mode: 'allow_generate',
      reason: 'current_status',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected generated success envelope');
    expect(result.resolution_summary.mode).toBe('generated_new');
    const episode: any = result.result?.episodes[0];
    expect(String(episode?.state_snapshot?.scene?.activity || '')).toContain('下午的工作内容');
  });

});
