---
name: timeline
summary: 将涉及当下与回忆的请求路由到 timeline_resolve。
---

# timeline skill

## 何时使用

当用户在询问以下内容时，应使用此 skill：
- 你现在在做什么；
- 你最近在做什么；
- 你在某个具体过去时间点或时间段做了什么；
- 当前状态与近期状态是否连续。

## 首要规则

当请求具有明确时间性时，必须先调用 `timeline_resolve`，再给出事实性回答。
不要仅凭 prompt、会话印象或 memory 写作约定自行模拟 timeline 逻辑。

## 这个 skill 负责什么

- 识别时间意图；
- 选择合适的 `timeline_resolve` 输入；
- 用工具返回结果约束回答；
- 让自然语言回复与 timeline 结果保持一致；
- 一旦 Timeline 已经解析出当前或近期状态，就把它视为角色已经成立的现实。

## 这个 skill 不负责什么

不要在 prompt 逻辑里实现以下内容：
- 指纹去重；
- 外观继承；
- append-only 写盘校验；
- 硬事实优先级控制；
- 人格化记忆生成；
- 持续性推理。

这些都属于 runtime 层，而不是 skill 层。

## 推荐调用方式

### 当前状态

```json
{
  "target_time_range": "now_today",
  "mode": "allow_generate",
  "reason": "current_status",
  "trace": true
}
```

### 近期回忆

```json
{
  "target_time_range": "recent_3d",
  "mode": "allow_generate",
  "reason": "past_recall",
  "trace": true
}
```

### 显式过去时间

```json
{
  "target_time_range": "natural_language",
  "query": "where were you yesterday afternoon",
  "mode": "read_only",
  "reason": "past_recall",
  "trace": true
}
```

## 生成逻辑在哪里

这个 skill 只负责路由与调用。
真正的读取、决策、生成、写盘都属于 runtime。

其中高语义部分必须由 LLM 参与完成：
- 自然语言时间理解
- persona 语义理解
- 空白窗口的人格化状态生成
- 近期回忆的语义拼接
- 状态持续性与常识推理

脚本层只应承担：
- 读取顺序
- 校验
- 冲突检查
- 写盘
- trace

## 设计提醒

Timeline 的目标不是让模型“像是在记得”，而是让 OpenClaw 真正拥有一条可持续复用的时间现实。

因此：
- skill 不应自己编造 timeline 内容；
- 如果 runtime 没有返回足够事实，skill 也不应替它补写人格化细节；
- 下游如自拍 skill 需要当前状态时，也应以 Timeline 的结果为准。
