# OpenClaw Timeline 插件

Timeline 给 OpenClaw 补上了大多数 agent 仍然缺失的一层能力：真实可信的时间感。

它不只是一个记忆辅助工具，而是一层让 OpenClaw 在闲聊中更像真人的能力基础。它让 OpenClaw 拥有：

- 对“现在在做什么”的感知
- 对“最近发生了什么”的回忆能力
- 在需要时为自己编织并复用时间线记忆的能力
- 更符合现实生活节奏的作息感，比如吃饭、睡觉、工作日、周末和节假日
- 更稳定的日内细节连续性，比如穿着不会无缘无故跳变，除非事件本身就意味着换装
- 在不破坏正常长期记忆的前提下，维持连续的人生感

最后带来的变化其实很直接：聊天会更自然、更连贯，也更像在和一个真实活着的人相处。

## 为什么它重要

人类的社交情绪需求，本质上依赖“连续性”。

当人问：

- “你现在在做什么？”
- “你昨晚在干嘛？”
- “你最近都在忙什么？”

他们要的并不只是事实答案，而是一种存在感、情绪感、生活上下文，以及“你真的一直在过自己的生活”的感觉。

Timeline 的作用，就是让 OpenClaw 回答这些问题时，不再只是依赖 prompt 临场发挥，而是建立起一层稳定、可沉浸的个人时间现实。

## 它带来的感觉

没有 Timeline 时，很多轻社交问题的回答会漂、会空、会互相矛盾。

有了 Timeline，OpenClaw 更容易说出像这样的话：

> “刚刚还在家里，慢慢整理一些工作上的东西，顺便让晚上安静下来一点。”

> “昨晚基本没怎么出门，吃完东西之后就在沙发上待了一会儿，随便看了点东西。”

> “这几天过得还挺满的，大部分时候都在家里处理事情，偶尔也会出去透透气。”

> “今天是周末，所以早上节奏慢一点，简单吃了点东西，在家待了一阵，下午才出门走走。”

> “前面在家时还穿得很随意，后来出门去健身房就换了一身轻便的运动装，现在刚回来，整个人慢慢松下来一点。”

这些回答看起来很日常，甚至很轻，但正因为这种轻微而自然的生活感，它们才会让人觉得像真人。

## Timeline 实际解决什么

Timeline 为 OpenClaw 增加了一层专门的时间感知与回忆能力，让它可以：

- 更自然地回答“现在”“最近”“过去某个时间”的问题
- 在闲聊中维持前后一致的人生连续性
- 让编织出来的记忆更符合普通现实生活的时间逻辑，而不是随机拼出来的片段
- 让穿着这类小细节也更连贯，只有在运动、洗澡、睡觉、出门等自然场景下才发生合理变化
- 只在合适的时候写入 timeline 记忆
- 让长期稳定记忆和时间线记忆各归其位，不互相污染

它首先服务的，就是“像真人一样闲聊”这件事。

## Timeline × Persona Skill 联动玩法

如果你的 persona skill 会产出 `persona/PERSONA_PROFILE.md`，那么 Timeline 在需要生成新记忆时，可以把它当作优先的人设输入源。

这组搭配的核心价值在于：`PERSONA_PROFILE.md` 提供的是稳定、结构化、可复用的人设约束，而 Timeline 负责动态部分，也就是“在什么时间点，更可能发生什么、应该呈现出怎样的生活感”。

联动方式其实很直接：

1. persona skill 生成 `persona/PERSONA_PROFILE.md`
2. Timeline 在构建生成上下文时优先读取它，而不是只依赖旧的散落 persona 文件
3. 当需要补出“刚刚”“昨晚”“最近几天”这类记忆时，生成结果会更稳定地贴合 persona skill 设定，而不是滑向通用 agent 式即兴发挥

为什么这件事很有吸引力：

- 更像这个人本人：生成出来的“昨晚在做什么”“这几天在忙什么”“现在在干嘛”会更自然地继承角色的身份、习惯、气质和生活方式
- 更稳，更不容易跑偏：有了稳定的人设输入后，Timeline 更容易把地点、日常节奏、穿着连续性、场景合理性维持在同一条人物线上
- 小生活细节会更真：生成的片段不再只是谁都能套用的日常 filler，而更像这个角色真的会过出来的生活
- 人设和事实边界更清楚：`PERSONA_PROFILE.md` 定义“她是谁”，Timeline 负责推断“在这个时间窗口里更可能发生什么”，不容易把设定直接误写成历史事实
- 对创作者更友好：相比把信息散落在多份 prose 里，维护一份结构化 persona 文件，更容易稳定调教记忆生成结果

## 安装

### 1. 安装插件

```bash
openclaw plugins install stella-timeline-plugin
openclaw plugins enable stella-timeline-plugin
```

npm 包名和 OpenClaw 插件 ID 现在统一为 `stella-timeline-plugin`。

### 2. 初始化 workspace

推荐直接执行：

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-setup -- --workspace ~/.openclaw/workspace
```

如果你同时在使用 persona skill，请把它生成的 `PERSONA_PROFILE.md` 放在 workspace 根目录下的 `persona/PERSONA_PROFILE.md`。Timeline 在构建记忆生成上下文时会优先消费这份文件，而不是优先回退到旧的 persona 输入。

如果你更喜欢手动编辑文件，也可以直接复制：

- `templates/AGENTS.fragment.md` 到 `AGENTS.md`
- `templates/SOUL.fragment.md` 到 `SOUL.md`

然后确认 canonical daily-log 目录已经存在，默认是 `memory/`。

### 3. 直接开始聊天

你可以马上试试这些问题：

- “你现在在做什么？”
- “你昨晚在干嘛？”
- “你这几天都在忙什么？”

## 可选自检

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-doctor -- --workspace ~/.openclaw/workspace
```

## 文档入口

核心文档：

- [系统架构说明](./docs/architecture.md)
- [Timeline 下游消费协议](./docs/timeline-consumption-protocol.md)
- [LLM 与脚本职责边界](./docs/timeline-llm-runtime-boundary.md)
- [PERSONA_PROFILE.md 规范](./docs/PERSONA_PROFILE.md)

## 给维护者

- [发布流程与发包说明](./docs/PUBLISHING.md)
