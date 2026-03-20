# OpenClaw 人格化三项目开发计划（v1）

本计划覆盖三个项目：

- `Her`（timeline-skill，事实层）
- `Zhuang-Yan`（persona-skill，表达层）
- `Stella`（stella-selfie，渲染与发送层）

依赖顺序：`timeline -> persona -> stella`

---

## 0. 目标与验收口径

### 总体目标

建立稳定的人格化链路，使系统在“用户未明确场景”的自拍/闲聊请求下，能基于事实时间线生成一致、可解释、可回放的表现。

### 全链路验收

1. 无场景自拍请求时，必须按 `timeline -> persona -> stella` 顺序执行。
2. timeline 输出满足 `Her/docs/protocol.md` 必填字段约束。
3. persona 输出满足 `Zhuang-Yan/docs/protocol.md` 必填字段约束。
4. stella 缺字段或低置信度时按协议稳定回退，不报错、不伪造事实层。

---

## 1. Phase A（Her）: timeline-skill 最小可运行实现

### A1. 工程骨架

- 新建 Node.js + TypeScript 工程骨架（与 Stella 技术栈对齐）
- 提供统一入口（脚本或运行函数）用于接收 `target_time_range`

### A2. 读取与硬锚

- 实现读取优先级：
  1) `sessions_history`
  2) `memory_get`
  3) `memory_search`
- 将 `sessions_history` 结果作为事实锚，禁止被语义召回覆盖

### A3. 记忆解析与幂等

- 实现扁平段落解析器（Level A / Level B）
- 实现软指纹计算与 `read_only_hit` / `generated_new` 判定
- append-only 写入 `memory/YYYY-MM-DD.md`

### A4. 输出契约

- 按 `Her/docs/protocol.md` 输出 `TimelineWindow` 与 `episodes[]`
- 保证必填字段齐全，支持多日 `days: TimelineWindow[]`

### A5. 测试

- 同日重复询问命中只读
- 缺字段段落降级映射
- 无历史场景返回非空状态

---

## 2. Phase B（Zhuang-Yan）: persona-skill 表达层实现

### B1. 工程骨架

- 建立 persona 运行时入口（可由 SKILL/编排触发）
- 明确无显式用户输入，对外仅暴露触发点

### B2. 输入聚合

- 消费 timeline 输出作为事实层
- 读取 `SOUL.md` / `MEMORY.md` / `USER.md` 与近期会话信号

### B3. 输出契约

- 按 `Zhuang-Yan/docs/protocol.md` 生成结构化 JSON：
  - `scene`
  - `emotion`
  - `appearance`
  - `camera`
  - `confidence`
  - `signal_sources`

### B4. 责任边界

- persona 不直接写 canonical memory
- flush 场景下只触发 timeline 补写

### B5. 测试

- timeline 缺字段时的降级策略
- 必填字段完整性校验
- 低置信度输出行为

---

## 3. Phase C（Stella）: 协议接入与实施规范落地

### C1. 编排接入

- 在 Stella `SKILL.md`/运行逻辑中落地 Step 0：
  - 无明确场景 -> 调 `timeline` 再调 `persona`
  - 有明确场景 -> 走显式请求路径

### C2. 字段校验与回退

- 校验 `persona -> stella` 必填字段
- 缺关键字段或 `confidence < 0.5` 时执行协议回退

### C3. 端到端测试

- 无场景自拍：完整三段链路
- 明确场景自拍：显式路径
- 上游不可用：透明回退

---

## 4. 联调与发布准备

### D1. 三仓库联调

- 契约版本一致性检查（`schema_version`）
- 字段变更回归测试
- 日志与可观测性（关键决策点）

### D2. 文档与入口统一

- 保持三个 README 指向各自 `docs/protocol.md`
- 变更协议时同步更新：
  - `Her/docs/protocol.md`
  - `Zhuang-Yan/docs/protocol.md`
  - `Stella/docs/protocol.md`

### D3. 发布门禁

- timeline / persona / stella 各自单测通过
- 三链路 E2E 用例通过
- 回退策略验证通过

---

## 5. 建议里程碑

1. **M1（事实层可用）**：timeline 可稳定读写与输出
2. **M2（表达层可用）**：persona 消费 timeline 并稳定输出
3. **M3（链路可用）**：Stella 完成协议接入与回退
4. **M4（上线候选）**：联调与回归通过，准备发布

---

## 6. 非目标（v1）

- 定时任务实例化（cron/heartbeat 自动日程）
- 历史记忆冲突自动修复
- 对既有 Episode 的增量补细节
- 高阶容错编排（仅保留基础回退）
