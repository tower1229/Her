import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resetTimelineResolveDependencies, setTimelineResolveDependencies, timelineResolve } from './timeline_resolve';

describe('timelineResolve trace schema', () => {
  const traceLogPath = path.join(os.tmpdir(), 'timeline-resolve-trace-test.log');

  beforeEach(() => {
    resetTimelineResolveDependencies();
    setTimelineResolveDependencies({
      planTimelineQuery: async (input) => {
        const query = String(input.query || '');
        if (query.includes('最近')) {
          return {
            schema_version: '1.0',
            target_time_range: 'past_range',
            normalized_start: '2026-03-19T14:30:00+08:00',
            normalized_end: '2026-03-22T14:30:00+08:00',
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
    fs.rmSync(traceLogPath, { force: true });
  });

  afterAll(() => {
    fs.rmSync(traceLogPath, { force: true });
  });

  it('returns a richer trace for read-only hits', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Read-only trace run.'],
      memoryGet: async () => `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
      `,
      reasonTimeline: async (collector) => ({
        schema_version: '1.0',
        request_id: collector.request_id,
        request_type: 'now',
        decision: {
          action: 'reuse_existing_fact',
          selected_fact_id: 'canon:2026-03-22:0',
          should_write_canon: false,
        },
        continuity: {
          judged: true,
          is_continuing: true,
          reason: 'the existing canon fact still covers the current moment',
        },
        rationale: {
          summary: 'Reused the current canon fact.',
          hard_fact_basis: [],
          canon_basis: ['canon:2026-03-22:0'],
          persona_basis: [],
        },
      }),
      traceLogPath,
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'read_only',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.trace?.source_order).toEqual(['sessions_history', 'memory_get']);
    expect(result.trace?.source_summary.parsed_episode_count).toBe(1);
    expect(result.trace?.fingerprint.checked).toBe(true);
    expect(result.trace?.fingerprint.compared_episodes).toBe(1);
    expect(result.trace?.write.guard).toBe('not_attempted');
    expect(result.trace?.decision.resolution_mode).toBe('read_only_hit');
    expect(fs.existsSync(traceLogPath)).toBe(true);
  });

  it('returns write and appearance details for generated entries', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => ['Generated trace run.'],
      memoryGet: async () => '',
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
          reason: 'no canon fact matched the current moment',
        },
        rationale: {
          summary: 'Generated a current-state fact for trace coverage.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: [],
        },
        generated_fact: {
          location: '家里书房靠窗的桌子',
          action: '继续梳理当前这段对话对应的工作内容',
          emotionTags: ['专注', '平静'],
          appearance: '舒适的家居服，头发随意挽起',
          internalMonologue: '把当前状态固定下来，后续回复才会稳。',
          confidence: 0.79,
          reason: 'llm generation for trace coverage',
        },
      }),
      memoryFilePath: () => 'memory/2026-03-22.md',
      writeEpisode: async () => ({ success: true, written_at: '2026-03-22T14:30:01+08:00' }),
      traceLogPath,
    });

    const result = await timelineResolve({
      query: '你在干嘛',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    expect(result.trace?.write.attempted).toBe(true);
    expect(result.trace?.write.succeeded).toBe(true);
    expect(result.trace?.write.guard).toBe('canonical_path');
    expect(result.trace?.appearance.reason).toBeTruthy();
    expect(result.trace?.fingerprint.reason).toBeTruthy();
    expect(result.trace?.decision.resolution_mode).toBe('generated_new');
  });

  it('can materialize an llm-generated entry for non-now ranges when memory is blank', async () => {
    setTimelineResolveDependencies({
      currentTime: async () => ({ now: '2026-03-22T14:30:00+08:00', timezone: 'Asia/Shanghai' }),
      sessionsHistory: async () => [],
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
          reason: 'no canon fact matched the recent recall window',
        },
        rationale: {
          summary: 'Generated a recent-recall fact from the available context.',
          hard_fact_basis: [],
          canon_basis: [],
          persona_basis: [],
        },
        generated_fact: {
          location: '安静的社区咖啡馆角落',
          action: '回想最近几天里最值得提起的一段放松时刻',
          emotionTags: ['轻松', '满足'],
          appearance: '整洁的休闲穿搭，外套随手搭在椅背上',
          internalMonologue: '最近并不喧闹，但这种安静的小片段其实很适合被记住。',
          confidence: 0.76,
          reason: 'llm recent-recall synthesis',
        },
      }),
      writeEpisode: async () => ({ success: true, written_at: '2026-03-22T14:30:01+08:00' }),
      traceLogPath,
    });

    const result = await timelineResolve({
      query: '最近有什么有趣的事吗',
      mode: 'allow_generate',
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success envelope');
    expect(result.resolution_summary.mode).toBe('generated_new');
    expect(result.trace?.write.guard).toBe('canonical_path');
    expect(result.trace?.decision.resolution_mode).toBe('generated_new');
    expect(result.result?.episodes).toHaveLength(1);
  });
});
