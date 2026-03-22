import { parseMemoryFile } from './parse-memory';

describe('parseMemoryFile', () => {
  it('should parse Level A correctly', () => {
    const memory = `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
- Internal_Monologue: 今天下午的思绪特别清晰，整理完心情也变好了。

下午花了一整段时间重新梳理知识库，感觉大脑整个被清空重启了。
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(1);
    expect(result[0].parseLevel).toBe('A');
    expect(result[0].confidence).toBe(1.0);
    expect(result[0].timestamp).toBe('2026-03-22 14:30:00');
    expect(result[0].location).toBe('家里书房靠窗的桌子');
    expect(result[0].action).toBe('把最近的零碎念头整理进 Obsidian 的第二大脑');
    expect(result[0].emotionTags).toEqual(['专注', '灵光乍现']);
    expect(result[0].appearance).toBe('浅灰色的舒适家居服，头发随意挽起');
    expect(result[0].internalMonologue).toBe('今天下午的思绪特别清晰，整理完心情也变好了。');
  });

  it('should parse Level B correctly missing appearance and emotion', () => {
    const memory = `
### [09:00:00] 起床
- Timestamp: 2026-03-22 09:00:00
- Location: 卧室床边
- Action: 半梦半醒中伸了个大懒腰
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(1);
    expect(result[0].parseLevel).toBe('B');
    expect(result[0].confidence).toBe(0.5);
    expect(result[0].appearance).toBe('unknown');
    expect(result[0].emotionTags).toEqual(['neutral']);
  });

  it('should ignore segments without timestamps', () => {
    const memory = `
### [09:00:00] 起床
- Location: 卧室床边
- Action: 半梦半醒中伸了个大懒腰
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(0);
  });
});
