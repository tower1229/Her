# 输入输出 JSON 格式 (JSON Schema)

本文件定义了 timeline-skill 的主输出格式（消费侧视图）。

## 1. `TimelineWindow`（主输出）

当本技能运行完成后，以 JSON 格式向大模型或调用端返回事实状态。

```json
{
  "schema_version": "1.0",
  "document_type": "timeline.window",

  "anchor": {
    "now": "2026-03-20T14:30:00+08:00",
    "timezone": "Asia/Shanghai"
  },

  "window": {
    "calendar_date": "2026-03-20",
    "preset": "now_today | recent_3d | explicit",
    "start": "2026-03-20T00:00:00+08:00",
    "end": "2026-03-20T14:30:00+08:00",
    "idempotency_key": "runtime-only soft-fingerprint hash"
  },

  "resolution": {
    "mode": "read_only_hit | generated_new",
    "notes": "optional, debug only"
  },

  "episodes": []
}
```

*若覆盖多天（如 `recent_3d`），则返回 `days: TimelineWindow[]` 数组。*

## 2. `Episode`（片段/情节层）

`episodes` 数组中的元素，每个 `Episode` 代表一段时间内的一个事实行为：

```json
{
  "episode_id": "uuid-v4",
  "schema_version": "1.0",
  "document_type": "timeline.episode",

  "temporal": {
    "start": "2026-03-20T13:00:00+08:00",
    "end": "2026-03-20T15:00:00+08:00",
    "time_of_day": "morning | afternoon | evening | night",
    "granularity": "block"
  },

  "narrative": {
    "summary": "一至两句，检索与闲聊用",
    "detail": "磁盘段落中的自然语言部分（可选）"
  },

  "state_snapshot": {
    "scene": {
      "location_kind": "home|cafe|outdoor|transit|work|other",
      "location_label": "来自磁盘 Location 字段",
      "activity": "来自磁盘 Action 字段",
      "time_of_day": "由 Timestamp 推导"
    },
    "emotion": {
      "primary": "Emotion_Tags[0]",
      "secondary": "Emotion_Tags[1] 或 null",
      "intensity": 0.0
    },
    "appearance": {
      "outfit_style": "来自磁盘 Appearance 字段",
      "grooming": "可选，从 Appearance 拆分或留空",
      "posture_energy": "可选，从 Internal_Monologue 推断或留空"
    }
  },

  "world_hooks": {
    "weekday": true,
    "holiday_key": null
  },

  "provenance": {
    "writer": "timeline-skill",
    "written_at": "2026-03-20T14:30:05+08:00",
    "idempotency_key": "runtime-only soft-fingerprint hash",
    "confidence": 1.0
  }
}
```

## 3. Disk → Episode 映射规则

脚本读取磁盘上的 Markdown 段落并映射至 `Episode`：

| 磁盘字段 | Episode 字段 | 备注 |
|---|---|---|
| `Timestamp` | `temporal.start` | `end` 默认为 `start + 1h` |
| `Timestamp` | `temporal.time_of_day` | 按小时推导 (0-5 night, 6-11 morning, 等) |
| `Location` | `state_snapshot.scene.location_label` | 原文保留 |
| `Location` | `state_snapshot.scene.location_kind` | 脚本归类为 home/cafe/等 |
| `Action` | `state_snapshot.scene.activity` | 原文保留 |
| `Emotion_Tags[0]` | `emotion.primary` | 若无则 null |
| `Emotion_Tags[1]` | `emotion.secondary` | 若无则 null |
| `Appearance` | `appearance.outfit_style` | 原文保留 |
| `Internal_Monologue` | `narrative.detail` | 原文保留 |
| 自然语言段落 | `narrative.summary` | 取前两句 |

*注意：Level B 降级解析时，若缺 `Appearance`，则值为 `"unknown"` 且 `confidence` 降至 `0.6`。*

## 4. 三技能接口契约 (timeline → persona)

timeline 输出供给下游 persona 时，以下字段**必须存在**：
- `schema_version`
- `window.calendar_date`
- `resolution.mode`
- `episodes`（至少 1 条）
- `episodes[*].temporal.start`
- `episodes[*].state_snapshot.scene.location_label`
- `episodes[*].state_snapshot.scene.activity`
- `episodes[*].state_snapshot.scene.time_of_day`
- `episodes[*].state_snapshot.emotion.primary`
- `episodes[*].state_snapshot.appearance.outfit_style`
- `episodes[*].provenance.confidence`
