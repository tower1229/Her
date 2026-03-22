---
name: timeline-skill
description: >
  Factual timeline layer. Given a time range, retrieves or generates
  structured episode facts from memory and session history.
  Returns a TimelineWindow JSON object. Writes new episodes to disk (Append-Only).
---

# timeline-skill

## 1. 触发条件 (Triggers)
当用户的自然语言问题涉及时间、当下状态或近期活动时被触发（例如"你在干嘛"、"最近有什么好玩的"）。
需要将意图解析为以下时间窗口（Window Preset）：
- `now_today`：当下
- `recent_3d`：最近三天
- `explicit`：明确指定的起止时间段

## 2. 强依赖与调用顺序 (Hard Dependencies)
本组件必须遵循以下读取顺序：
1. **`sessions_history`**：查询真实聊天记录，作为**绝对硬锚**。
2. **`memory_get`**：按需读取当日记忆文件 `memory/YYYY-MM-DD.md`。
3. **`memory_search`**：作为补充，检索相关语义上下文。

## 3. 绝对禁令 (Strict Bans)
- **禁止覆盖已有 canon**：软指纹命中后直接返回，绝对不允许以"更新"或"补充细节"为名修改已落盘内容（详情见 Gotchas G3）。
- **禁止否定事实**：绝不能用 `memory_search` 的结果否定 `sessions_history` 中的硬事实（详情见 Gotchas G1）。
- **禁止输出空结果**：必须给出非空结果（允许描述"在睡觉/发呆"，但绝不允许返回"没有记忆"）（详情见 Gotchas G6）。

完整踩坑点详见：[references/gotchas.md](references/gotchas.md)

## 4. 文件索引 (References)
开发与使用该 Skill 需要严格恪守以下文档规约：
- [高频踩坑点 (Gotchas)](references/gotchas.md)
- [磁盘记忆格式 (Memory Format)](references/memory-format.md)
- [时间窗口语义 (Window Semantics)](references/window-semantics.md)
- [输入输出 JSON 格式 (JSON Schema)](references/json-schema.md)
