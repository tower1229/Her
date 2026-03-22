# Timeline Skill（时间线技能）— [English](README.md)

专为 OpenClaw Agent 设计的事实锚点与时间线记忆组件。它负责回答一个核心问题：**"我此时此刻，乃至过去这段时间，究竟在哪里、在做什么？"**

## 先决条件

- 已安装并运行 **OpenClaw** 网关
- 可选：同时安装 `persona-skill` 以获得更丰富的活动推演能力

## 安装

```bash
clawhub install timeline-skill
```

如需从源码手动部署，将仓库根目录整体复制到 Agent 工作区的 `skills/` 目录中：

```
~/.openclaw/workspace/skills/timeline-skill/SKILL.md
```

安装完成后，请完成以下两步必要配置。**跳过任一步骤都会导致技能静默失败** —— Agent 将不知道何时触发它，也无法以正确的格式写入记忆。

## 配置

### 1. AGENTS.md — 记忆格式协议

这一步强制执行 timeline-skill 读写所依赖的严格日记格式。若跳过，Agent 可能以自由文本写入记忆，导致无法被解析。

打开本技能目录下的 `templates/AGENTS-protocol.template.md`，复制其中 `[MEMORY FORMAT PROTOCOL]` 区块的全部内容，粘贴到你工作区 `AGENTS.md` 的**核心指令区**。

> ⚠️ 这是系统级护栏，**不可**放入 `SOUL.md` —— 否则会被其他内容覆盖。

### 2. SOUL.md — 时间线感知能力

这一步赋予 Agent 识别"我需要回忆自己时间线"的意识。

打开 `templates/SOUL-awareness.template.md`，复制 `[TEMPORAL AWARENESS & MEMORY RETRIEVAL]` 区块的全部内容，**追加至**你工作区 `SOUL.md` 的**最末尾**。

完成以上配置后，每当用户意图涉及时间或当前状态（"你在干嘛"、"昨天下午你在哪"），Agent 便会自动调用 timeline-skill 获取真实事实，再基于事实给出回复。

## 功能特性

1. **当前状态推演与存储** —— 当用户询问角色的近况时，基于会话历史（硬锚）、人物小传和系统时间，合理推演出当下逻辑自洽的活动，并写入 `memory/YYYY-MM-DD.md` 持久化保存。
2. **逻辑持续时间判定** —— 解决"连续询问"边界问题。只有当时间间隔足够合理时，才会生成新的活动事件。模型会评估逻辑时长（喝水 2 分钟结束；打篮球持续 30 分钟以上）。
3. **历史事实提取** —— 支持对明确时间段（如"昨天下午"）的结构化事实查询，返回精准的 Episode 数据。
4. **消除大模型幻觉** —— 防止模型随意捏造背景（一会儿在纽约喝咖啡，一会儿在火星），使所有活动都受制于一条不可篡改的真实人生时间线。
5. **外观日内稳态与动态切换** —— 消除单日对话中的"随机换装"幻觉。外观默认按日继承，仅当 Action 字段包含换装信号时才更新（如洗澡→浴袍、健身→运动服、购物→试穿新装、回家→居家服）。

## 设计思路

- **单一写者原则** —— `timeline-skill` 是唯一被授权读写日记格式记忆的组件。任何其他 Skill 或 Prompt 不应直接追加内容到 `memory/*.md`。
- **大模型指令驱动（非硬编码 RPC）** —— 本技能完全以注入上下文的方式运作。模型被指示在回答前必须先获取事实，在上下文中完成推理，再给出表达。运行时无外部服务调用。
- **事实与表达解耦** —— 本技能只关心"在哪里"和"在干什么"。语气、人格和风格由 `persona-skill` 和 `SOUL.md` 负责。

## 示例

**用户**："你这会儿在干啥呢？"

**模型执行过程**：

1. 检测到时间相关意图。
2. 读取 timeline-skill 约束 —— 必须先获取事实。
3. 调用磁盘/会话读取工具 —— 发现 14:30 时段已有落盘事实：`{Location: 书房, Action: 整理 Obsidian 笔记}`。
4. 以该事实为基准组合最终回复。

**Agent 回复**："（发了个伸懒腰的表情）刚在书房靠窗的位置整理了一会 Obsidian 的笔记，有点累了。怎么，找我有事？"

## 技能生态联动

timeline-skill 可以完全独立运作，但与以下技能配合会产生惊人的管线级涌现：

- **✨ persona-skill** —— 提供角色小传和 MBTI 基底，作为 timeline-skill 推演独处活动的依据。没有 persona，推演出的活动会平淡乏味；没有 timeline，persona 的表现力就像无源之水。
- **✨ stella-selfie** —— 图像生成技能。在用户未提供具体场景时，它会先从 timeline 获取实体背景（场景+地点），再从 persona 获取视觉参数（神态+氛围），最终自动生成一张高度契合上下文的自拍照片。

## 项目结构

```
Her/
├── SKILL.md                          # Skill 入口文件及元数据
├── README.md                         # 英文说明
├── README_ZH.md                      # 本文件（中文）
├── templates/
│   ├── AGENTS-protocol.template.md   # 复制 → AGENTS.md
│   └── SOUL-awareness.template.md    # 追加 → SOUL.md
├── references/
│   ├── memory-format.md              # 磁盘记忆格式规范
│   ├── window-semantics.md           # 时间窗口语义定义
│   ├── json-schema.md                # TimelineWindow & Episode JSON Schema
│   └── gotchas.md                    # 常见陷阱与硬性规则
├── examples/
│   └── episode-sample.md             # Level A/B Episode 示例
├── scripts/
│   ├── types.ts                      # 共享 TypeScript 类型定义
│   ├── parse-memory.ts               # Markdown → ParsedEpisode 解析器
│   ├── fingerprint.ts                # 软指纹去重逻辑
│   ├── inherit-appearance.ts         # 日内外观继承逻辑
│   ├── holidays.ts                   # 内置节假日表（CN/US 2025-2027）
│   ├── write-episode.ts              # 核心写入与校验入口
│   ├── run-log.ts                    # 可观测性运行日志
│   └── release-clawhub.mjs          # ClawHub 发布脚本
└── docs/
    └── timeline-skill-design.md      # 完整架构与设计文档
```

## 开发

```bash
npm install
npm test         # 运行全部单元测试（13 个）
npm run build    # 编译 TypeScript
npm run release:clawhub   # 发布到 ClawHub
```

## 许可证

MIT-0 —— 可自由使用、修改和再分发，无需署名。
