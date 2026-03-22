# 时间窗口语义 (Window Semantics)

## 1. 时区与锚点

- **Timezone**：使用 OpenClaw 注入 Context 的当前时间（即配置的 `agents.defaults.userTimezone`），不在 skill 脚本层二次计算。

## 2. Preset 定义

时间意图应在内部被解析为以下三种 Window Preset：

- **`now_today`**（当下）：
  - 当日从**本地日历日 00:00** 至 **`anchor.now`（Context 中的当前时间）**。
  - 若调用意图是"此刻在干嘛"，返回的叙述应对齐该窗口内**已存在或本次新生成**的 canon。

- **`recent_3d`**（最近三天）：
  - 定义为 **`(now - 3d, now]`**，按日拆成**最多 3 个独立日历日**。
  - 每日分别检索/生成，**不合并**为一个跨日的巨型状态集合。

- **`explicit`**（明确指定起止范围）：
  - 用户或大模型内部解析出的明确起止时间段，仍需按所覆盖到的**涉及自然日**由脚本拆分成逐日流转或计算。

## 3. 幂等键规则 (运行态)

- **磁盘无感存储**：磁盘保存的 Markdown 里不落 `window_id` 等技术主键标记，保证最原本自然的日记记录。
- **运行态哈希**：仅在内部脚本生成阶段或 Heartbeat 挂起阶段，动态计算软哈希以保证不重复叠加生成。
  - 推荐：`idempotency_key = hash(calendar_date + normalized(location) + normalized(action) + time_bucket)`
  - 该 `idempotency_key` 仅被用于本轮计算的暂存逻辑与系统运行监控日志，决不作为实际协议或磁盘存储字段暴露。
