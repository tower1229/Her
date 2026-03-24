# OpenClaw Timeline 插件

Timeline 给 OpenClaw 补上了大多数 agent 仍然缺失的一层能力：真实可信的时间感。

它不只是一个记忆辅助工具，而是一层让 OpenClaw 在闲聊中更像真人的能力基础。它让 OpenClaw 拥有：

- 对“现在在做什么”的感知
- 对“最近发生了什么”的回忆能力
- 在需要时为自己编织并复用时间线记忆的能力
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

这些回答看起来很日常，甚至很轻，但正因为这种轻微而自然的生活感，它们才会让人觉得像真人。

## Timeline 实际解决什么

Timeline 为 OpenClaw 增加了一层专门的时间感知与回忆能力，让它可以：

- 更自然地回答“现在”“最近”“过去某个时间”的问题
- 在闲聊中维持前后一致的人生连续性
- 只在合适的时候写入 timeline 记忆
- 让长期稳定记忆和时间线记忆各归其位，不互相污染

它首先服务的，就是“像真人一样闲聊”这件事。

## 安装

### 1. 安装插件

```bash
openclaw plugins install stella-timeline-plugin --pin
openclaw plugins enable timeline-plugin
```

npm 包名是 `stella-timeline-plugin`，OpenClaw 内部插件 ID 仍然是 `timeline-plugin`。

### 2. 初始化 workspace

推荐直接执行：

```bash
npm exec --package=stella-timeline-plugin openclaw-timeline-setup -- --workspace ~/.openclaw/workspace
```

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

## 给维护者

发布流程和发包说明见 [docs/PUBLISHING.md](./docs/PUBLISHING.md)。
