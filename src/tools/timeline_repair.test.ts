import * as fs from 'fs';
import * as path from 'path';
import { timelineRepair } from './timeline_repair';

const tmpDir = path.join(__dirname, '__repair_tmp__');
const memoryDir = path.join(tmpDir, 'memory');
const goodFile = path.join(memoryDir, '2026-03-22.md');
const badFile = path.join(memoryDir, '2026-03-23.md');

beforeEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(memoryDir, { recursive: true });

  fs.writeFileSync(
    goodFile,
    `### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
`,
    'utf8',
  );

  fs.writeFileSync(
    badFile,
    `### [15:00:00] 不完整记录
- Timestamp: 2026-03-23 15:00:00
- Action: 只写了动作，没有其他字段
`,
    'utf8',
  );
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('timelineRepair', () => {
  it('reports a healthy canonical file with no structural issues', async () => {
    const result = await timelineRepair({ file_path: goodFile, include_recent_runs: false });

    expect(result.ok).toBe(true);
    expect(result.target.exists).toBe(true);
    expect(result.target.canonical).toBe(true);
    expect(result.summary.parsed_episode_count).toBe(1);
    expect(result.summary.issue_count).toBe(0);
  });

  it('reports missing fields inside malformed daily log sections', async () => {
    const result = await timelineRepair({ file_path: badFile, include_recent_runs: false });

    expect(result.ok).toBe(true);
    expect(result.summary.issue_count).toBeGreaterThan(0);
    expect(result.diagnostics.issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining(['missing_location', 'missing_emotion_tags', 'missing_appearance']),
    );
  });
});
