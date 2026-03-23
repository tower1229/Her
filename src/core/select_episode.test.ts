import { parseMemoryFile } from '../lib/parse-memory';
import { selectEpisodeForWindow } from './select_episode';

describe('selectEpisodeForWindow', () => {
  it('selects an ongoing current-status episode based on inferred duration', () => {
    const episodes = parseMemoryFile(`
### [13:30:00] 打球
- Timestamp: 2026-03-22 13:30:00
- Location: 小区附近的篮球场
- Action: 和朋友一起打球
- Emotion_Tags: [投入, 放松]
- Appearance: 轻便运动装
    `);

    const result = selectEpisodeForWindow(
      episodes,
      {
        legacy_preset: 'now_today',
        semantic_target: 'now',
        collection_scope: 'today_so_far',
        start: '2026-03-22T00:00:00+08:00',
        end: '2026-03-22T14:30:00+08:00',
        calendar_date: '2026-03-22',
        timezone: 'Asia/Shanghai',
      },
      {
        target_time_range: 'now_today',
        mode: 'read_only',
        reason: 'current_status',
      },
    );

    expect(result.episode?.action).toContain('打球');
  });

  it('returns null when the only parsed episode is stale for current status', () => {
    const episodes = parseMemoryFile(`
### [09:00:00] 早餐
- Timestamp: 2026-03-22 09:00:00
- Location: 家里餐桌
- Action: 慢慢吃早餐
- Emotion_Tags: [平静, 清醒]
- Appearance: 居家服
    `);

    const result = selectEpisodeForWindow(
      episodes,
      {
        legacy_preset: 'now_today',
        semantic_target: 'now',
        collection_scope: 'today_so_far',
        start: '2026-03-22T00:00:00+08:00',
        end: '2026-03-22T14:30:00+08:00',
        calendar_date: '2026-03-22',
        timezone: 'Asia/Shanghai',
      },
      {
        target_time_range: 'now_today',
        mode: 'read_only',
        reason: 'current_status',
      },
    );

    expect(result.episode).toBeNull();
  });

  it('selects the episode that best matches the query semantics instead of the latest entry', () => {
    const episodes = parseMemoryFile(`
### [09:00:00] 健身
- Timestamp: 2026-03-22 09:00:00
- Location: 小区健身房
- Action: 上午去健身房练腿
- Emotion_Tags: [投入, 累]
- Appearance: 运动装

### [11:30:00] 咖啡
- Timestamp: 2026-03-22 11:30:00
- Location: 街角咖啡馆
- Action: 在咖啡馆慢慢坐着发呆
- Emotion_Tags: [放松, 平静]
- Appearance: 休闲外套
    `);

    const result = selectEpisodeForWindow(
      episodes,
      {
        legacy_preset: 'now_today',
        semantic_target: 'explicit_past',
        collection_scope: 'today_so_far',
        start: '2026-03-22T00:00:00+08:00',
        end: '2026-03-22T14:30:00+08:00',
        calendar_date: '2026-03-22',
        timezone: 'Asia/Shanghai',
      },
      {
        target_time_range: 'natural_language',
        query: '你上午不是在健身吗',
        mode: 'read_only',
        reason: 'past_recall',
      },
    );

    expect(result.episode?.action).toContain('健身房');
  });
});
