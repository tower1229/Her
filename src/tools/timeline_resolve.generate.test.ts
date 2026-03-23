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
  it('generates and persists a conservative candidate when no memory entry exists', async () => {
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

    expect(result.ok).toBe(true);
    expect(result.resolution_summary.mode).toBe('generated_new');
    expect(result.resolution_summary.writes_attempted).toBe(1);
    expect(result.resolution_summary.writes_succeeded).toBe(1);
    expect(result.result?.episodes).toHaveLength(1);
    const generatedEpisode: any = result.result?.episodes[0];
    expect(generatedEpisode).toMatchObject({
      state_snapshot: {
        scene: {
          location_label: expect.any(String),
          activity: expect.any(String),
        },
        appearance: {
          outfit_style: expect.any(String),
        },
      },
      provenance: {
        confidence: expect.any(Number),
      },
    });
    expect(String(generatedEpisode?.state_snapshot?.scene?.activity || '')).not.toContain('resting quietly and staying in a low-information state');
    expect(fs.existsSync(tmpFile)).toBe(true);

    const content = fs.readFileSync(tmpFile, 'utf8');
    expect(content).toContain('- Timestamp: 2026-03-22 14:30:00');
    expect(content).toContain('- Emotion_Tags: [focused, inspired]');
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
      generateMemoryDraft: async ({ prompt }) => {
        expect(prompt).toContain('SOUL.md');
        expect(prompt).toContain('IDENTITY');
        return {
          location: 'a softly lit neighborhood cafe corner',
          action: 'writing down scattered thoughts while waiting for the evening to settle',
          emotionTags: ['calm', 'reflective'],
          appearance: 'a neat casual outfit with a light outer layer',
          internalMonologue: 'This kind of small pause makes the whole day feel more coherent.',
          naturalText: 'She is spending the evening in a quiet cafe, letting the day taper into a reflective mood.',
          confidence: 0.83,
          reason: 'llm persona synthesis from customized soul and memory context',
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

});
