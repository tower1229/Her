# 示例 Episode (Sample)

## 1. 完整的磁盘片段 (Level A)

以下是符合 §5.1 标准格式的 Memory Entry 样例（此段落会追加写入 `memory/YYYY-MM-DD.md` 中）：

```markdown
### [14:30:00] 整理数字工作区

- Timestamp: 2026-03-22 14:30:00
- Location: 家里书房靠窗的桌子
- Action: 把最近的零碎念头整理进 Obsidian 的第二大脑
- Emotion_Tags: [专注, 灵光乍现]
- Appearance: 浅灰色的舒适家居服，头发随意挽起
- Internal_Monologue: 今天下午的思绪特别清晰，整理完心情也变好了。

下午花了一整段时间重新梳理知识库，感觉大脑整个被清空重启了。晚上或许可以去外面稍微放松一下。
```

## 2. 解析映射的 JSON 片段 (Level A 完整匹配)

上述段落将被 `scripts/parse-memory.ts` 完整读取，并组装为：

```json
{
  "episode_id": "7aa9c51a-...",
  "schema_version": "1.0",
  "document_type": "timeline.episode",
  "temporal": {
    "start": "2026-03-22T14:30:00+08:00",
    "end": "2026-03-22T15:30:00+08:00",
    "time_of_day": "afternoon",
    "granularity": "block"
  },
  "narrative": {
    "summary": "下午花了一整段时间重新梳理知识库，感觉大脑整个被清空重启了。",
    "detail": "今天下午的思绪特别清晰，整理完心情也变好了。"
  },
  "state_snapshot": {
    "scene": {
      "location_kind": "home",
      "location_label": "家里书房靠窗的桌子",
      "activity": "把最近的零碎念头整理进 Obsidian 的第二大脑",
      "time_of_day": "afternoon"
    },
    "emotion": {
      "primary": "专注",
      "secondary": "灵光乍现",
      "intensity": 0.0
    },
    "appearance": {
      "outfit_style": "浅灰色的舒适家居服，头发随意挽起",
      "grooming": null,
      "posture_energy": null
    }
  },
  "world_hooks": {
    "weekday": false,
    "holiday_key": null
  },
  "provenance": {
    "writer": "timeline-skill",
    "written_at": "2026-03-22T14:30:05+08:00",
    "idempotency_key": "c3f8d22a...",
    "confidence": 1.0
  }
}
```
*注：`confidence: 1.0` 表示这是具有全部必需信息流的完美事实点。*

## 3. Level B 降级示例 (缺失字段)

如果用户在与 Agent 交互中手动录入了一段不按常理出牌的格式，恰巧漏掉了 `Appearance` 和 `Emotion_Tags`：

```markdown
### [09:00:00] 起床

- Timestamp: 2026-03-22 09:00:00
- Location: 卧室床边
- Action: 半梦半醒中伸了个大懒腰
```

此段落仍然会被成功解析（不至于丢失事实），但返回给消费端 JSON 时状态会变化：

```json
{
  ...
  "state_snapshot": {
    ...
    "emotion": {
      "primary": "neutral",
      "secondary": null
    },
    "appearance": {
      "outfit_style": "unknown"
    }
  },
  "provenance": {
    "confidence": 0.5
  }
}
```
*注：因为缺失了 `Appearance` 及情绪，`confidence` 会被置为 `0.5`<0.6，这告诉像 `stella-selfie` 那样的强视觉消费端：“不要单纯依赖我所说的话，此处事实不充分”。*
