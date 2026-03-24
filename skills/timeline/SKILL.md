---
name: timeline
description: 当用户问“你在干嘛”“你现在在哪”“最近有什么有趣的事吗”“你刚才不是还在做那件事吗”或自拍需要当前状态时，必须先调用 timeline_resolve；禁止只根据人设直接回答。
---

# Timeline

看到下面这类话，先调用 `timeline_resolve`，再回答。不要先按人设猜：

- 当下状态
  - 例如：“你在干嘛”“你现在在哪”“你现在什么状态”
- 近期回忆
  - 例如：“最近有什么有趣的事吗”“你最近都在忙什么”
- 连续性追问
  - 例如：“你刚才不是在打球吗，现在还在吗”“那你后来去哪了”
- 需要当前状态作为输入的下游技能
  - 例如：自拍、场景描述、状态卡片

## 强制规则

1. 涉及时间现实的问题，先调用 `timeline_resolve`，后回答。
2. 不要只根据 `SOUL.md`、`IDENTITY.md`、`MEMORY.md` 直接回答“现在在做什么”或“最近发生了什么”。
3. `SOUL` / `IDENTITY` / `MEMORY` 只用于帮助理解和表述，不能替代 Timeline 事实。
4. `timeline_resolve` 返回既有事实时，优先复用；不要改写它。
5. 如果用户是普通闲聊而不是运维检查，允许 Timeline 生成缺失事实并写入 canon。
6. 只有在明确做运维排查、日志检查、修复诊断时，才改用 `timeline_status` 或 `timeline_repair`。

## 调用策略

### 1. 当下状态

适用于：

- “你在干嘛”
- “你现在在哪”
- “你现在什么状态”

先调用：

```json
{
  "target_time_range": "now_today",
  "mode": "allow_generate",
  "reason": "current_status",
  "trace": true
}
```

然后：

- 如果命中既有事实，就按事实自然回答。
- 如果 Timeline 生成了新事实，就按该事实自然回答，不要暴露工具细节。
- 若存在延续性语义，例如“还在吗”，要基于 Timeline 返回的结果来回答，而不是只看上一轮字面内容。

### 2. 近期回忆

适用于：

- “最近有什么有趣的事吗”
- “你最近都在忙什么”

先调用：

```json
{
  "target_time_range": "recent_3d",
  "mode": "allow_generate",
  "reason": "past_recall",
  "trace": true
}
```

然后：

- 用自然聊天方式组织回忆。
- 优先说最鲜活、最像真人会提到的内容。
- 不要把原始 JSON 或工具名暴露给用户。

### 3. 连续性追问

适用于：

- “你刚才不是在打球吗，现在还在吗”
- “后来呢”
- “那你现在还在外面吗”

优先调用：

```json
{
  "target_time_range": "natural_language",
  "query": "用户的原话",
  "mode": "allow_generate",
  "reason": "current_status",
  "trace": true
}
```

这样 Timeline 可以结合当前时间、既有事实和连续性语义做判断。

### 4. 下游技能取当前状态

如果你要调用自拍或其他需要“当前场景”的技能，先调用：

```json
{
  "target_time_range": "now_today",
  "mode": "allow_generate",
  "reason": "current_status",
  "trace": true
}
```

然后把返回的地点、行为、情绪、外观等事实作为下游技能输入的一部分，确保下游产物和 Timeline 保持同一现实。

## 回答要求

- 对用户说人话，不要提 `timeline_resolve`、`timeline_status`、`timeline_repair`。
- 语气自然，像真人在回忆或描述当下。
- 如果 Timeline 返回的是空窗口或失败，不要假装已有确定事实；按可用结果谨慎表达。
- 除非用户明确要求看原始结果，否则不要输出 JSON。
