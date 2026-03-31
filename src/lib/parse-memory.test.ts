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

  it('should parse Estimated_Duration field', () => {
    const memory = `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
- Internal_Monologue: 今天下午的思绪特别清晰，整理完心情也变好了。
- Estimated_Duration: 90
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(1);
    expect(result[0].estimatedDurationMinutes).toBe(90);
  });

  it('should parse entries without Estimated_Duration as undefined', () => {
    const memory = `
### [14:30:00] 整理数字工作区
- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(1);
    expect(result[0].estimatedDurationMinutes).toBeUndefined();
  });

  it('should parse Event_Id field', () => {
    const memory = `
### [09:30:00] 工作
- Timestamp: 2026-03-24 09:30:00
- Location: Home study
- Action: Reviewing tasks
- Emotion_Tags: [calm]
- Appearance: Light home top
- Estimated_Duration: 120
- Event_Id: evt-20260324-093000
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(1);
    expect(result[0].eventId).toBe('evt-20260324-093000');
  });

  it('should parse Parent_Event fields with Event_Id', () => {
    const memory = `
### [08:00:00] 搬家
- Timestamp: 2026-03-31 08:00:00
- Location: 北京旧居
- Action: 开始打包行李准备搬去大理
- Emotion_Tags: [期待, 忙碌]
- Appearance: 宽松T恤和运动裤
- Internal_Monologue: 终于要出发了，有点兴奋也有点紧张
- Estimated_Duration: 720
- Event_Id: evt-20260331-080000
- Parent_Event: evt-20260331-060000
- Parent_Event_Phase: packing
- Parent_Event_Progress: 0.1
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(1);
    expect(result[0].eventId).toBe('evt-20260331-080000');
    expect(result[0].parentEventTag).toBe('evt-20260331-060000');
    expect(result[0].parentEventPhase).toBe('packing');
    expect(result[0].parentEventProgress).toBe(0.1);
  });

  it('should parse entries without Event_Id and Parent_Event fields as undefined', () => {
    const memory = `
### [14:30:00] 整理
- Timestamp: 2026-03-22 14:30:00
- Location: 书房
- Action: 整理东西
- Emotion_Tags: [专注]
- Appearance: 家居服
- Estimated_Duration: 60
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(1);
    expect(result[0].eventId).toBeUndefined();
    expect(result[0].parentEventTag).toBeUndefined();
    expect(result[0].parentEventPhase).toBeUndefined();
    expect(result[0].parentEventProgress).toBeUndefined();
  });

  it('should parse Parent_Event_Progress as float', () => {
    const memory = `
### [14:00:00] 搬家途中
- Timestamp: 2026-03-31 14:00:00
- Location: 高铁上
- Action: 坐高铁前往大理
- Emotion_Tags: [期待]
- Appearance: 休闲外套
- Parent_Event: moving-to-dali-20260331
- Parent_Event_Phase: in-transit
- Parent_Event_Progress: 0.55
    `;

    const result = parseMemoryFile(memory);
    expect(result.length).toBe(1);
    expect(result[0].parentEventProgress).toBeCloseTo(0.55);
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

import { mapToEpisode } from './parse-memory';

describe('mapToEpisode', () => {
  it('should map ParsedEpisode to Episode correctly', () => {
    const parsed = {
      timestamp: '2026-03-22T09:00:00+08:00',
      location: '卧室床边',
      action: '醒来',
      emotionTags: ['sleepy'],
      appearance: 'pajamas',
      parseLevel: 'A' as const,
      confidence: 1.0
    };
    
    const worldHooks = { weekday: false, holiday_key: null };
    const ep = mapToEpisode(parsed, worldHooks, 'test-key');
    
    expect(ep.temporal.start).toBe('2026-03-22T09:00:00+08:00');
    expect(ep.temporal.end).toBe('2026-03-22T10:00:00+08:00');
    expect(ep.temporal.time_of_day).toBe('morning');
    expect(ep.state_snapshot.scene.location_kind).toBe('literal');
    expect(ep.state_snapshot.scene.location_label).toBe('卧室床边');
    expect(ep.state_snapshot.emotion.primary).toBe('sleepy');
    expect(ep.narrative.summary).toBe('在卧室床边醒来');
    expect(ep.world_hooks).toEqual(worldHooks);
    expect(ep.provenance.idempotency_key).toBe('test-key');
  });
});
