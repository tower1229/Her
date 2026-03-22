# 磁盘记忆格式 (Memory Entry Format)

记忆文件 `memory/YYYY-MM-DD.md` 是人类与 agent 共同维护的日记流，不区分来源。每条记忆是一个独立的扁平段落，以三级标题开头，键值列表承载结构化字段。

## 1. 格式模板

```markdown
### [HH:MM:SS] {Short Event Title}

- Timestamp: YYYY-MM-DD HH:MM:SS
- Location: {short location phrase}
- Action: {one-sentence description of what you are doing}
- Emotion_Tags: [tag1, tag2]
- Appearance: {outfit or visible state in short phrase}
- Internal_Monologue: {one short sentence of inner thought}

{Optional: 1-2 sentences of natural language for human readability.}
```

## 2. 字段说明 (v1 最小集)

| 字段                 | 必须 | 说明                                                      |
| -------------------- | ---- | --------------------------------------------------------- |
| `Timestamp`          | 是   | ISO 格式，含日期与时间，时区由 SOUL 约定                  |
| `Location`           | 是   | 短词组，如 `home study desk`、`a sunny cafe`              |
| `Action`             | 是   | 一句话，描述当前正在做什么                                |
| `Emotion_Tags`       | 是   | 逗号分隔的情绪词列表，如 `[relaxed, focused]`             |
| `Appearance`         | 是   | 服装/外观关键词，如 `casual home clothes`、`light makeup` |
| `Internal_Monologue` | 建议 | 一句内心独白，增强人格一致性与 `memory_search` 语义质量   |
| 自然语言段落         | 可选 | 供人类阅读，不参与脚本解析                                |

## 3. 设计原则

- **字段扁平**：不嵌套，不引入 agent 难以理解的特殊标识。
- **样式宽松**：样式细节（粗体、空行等）不强制，脚本用"键名 + 冒号"宽松匹配。
- **无差异化对待**：timeline-skill 写入的段落与 agent 自然写入的段落格式相同，不设分区隔离。
- **纯净磁盘存储**：幂等判定、去重等逻辑由 skill 内部脚本处理，不污染磁盘格式。
