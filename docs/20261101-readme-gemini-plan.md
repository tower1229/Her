# 原版 README 的 Gemini 验收范围

基线：`feda99284ff7695d68dc283cb6f5295e8b3ccc91` 的 `README.md` 与 `README_ZH.md`，取两者使用场景的并集。模型固定为本机配置的 `google/gemini-3.8-flash`，不允许自动退到其他模型。

| 编号 | README 场景 | 验收依据 |
| --- | --- | --- |
| R01 | 你现在在做什么 | 已有记录优先；自然回复；日记不变 |
| R02 | 刚刚／现在的空白补全 | 真实模型补全人格经历，写入每日文件；再问不重复写 |
| R03 | 昨晚八点／过去某个时间 | 时间归一化准确，复用该时点已有记录 |
| R04 | 昨晚在干嘛 | 正确查询昨晚范围，回答与晚饭、沙发等既有经历一致 |
| R05 | 这几天都在忙什么／最近趣事 | 跨日召回；概括有事实支持，不覆盖已有记录 |
| R06 | 最近一次知道自己错了 | 通过 Timeline 处理反思回忆，定位相符经历而非泛泛谈价值观 |
| R07 | 周末生活节奏 | 使用真实日期／时区，周末补全符合设定和当天已过时间 |
| R08 | 家居服→健身运动装→回家 | 无场景变化不随意换装；合理触发后允许变化；记忆可复用 |
| R09 | 安静书房与热闹咖啡馆 | 场景上下文实际注入；两种回复自然，不展示内部字段；人工审阅语气 |
| R10 | 搬家长事件 | 长事件保留为背景，查询能给出合理当前阶段；预计时长不等于已完成 |
| R11 | 旅行／跨日出行 | 当前阶段不违反地点和时间约束；保留跨日背景与一致性 |
| R12 | Persona profile 优先 | 有结构化 profile 时不调用 legacy 提取；冲突 legacy 不盖过 profile |
| R13 | SOUL＋MEMORY＋IDENTITY 降级及缓存 | 缺 profile 时用真实 Gemini 提取；未变更输入复用缓存 |
| R14 | 适时写入、长期记忆分工 | 普通闲聊、已有事实和只读请求不额外写经历；补全不污染 MEMORY/profile |
| R15 | 多轮及不同聊天连续性 | 同一 workspace 的不同 session 复用同一条日记，保持事件和衣着一致 |
| R16 | 主动问候 | 开关、空闲预检、真实生成、pending 抑制及无投递不计成功 |

安装/setup/doctor 另做隔离文件与配置验收；Persona Skill 自身的自动同步、WSL 同步和外部消息送达属于外部依赖，不能用 fixture 或 mocks 宣称已验收。

## 已授权的 Gemini 凭证使用方式

本机模型引用 `store/default/GEMINI_API_KEY`。使用固定版本的官方命令：

```text
openclaw backup sqlite create --global --repository <private-temp>/snapshots --json
openclaw backup sqlite restore <snapshot-directory> --target <private-temp>/state/state/openclaw.sqlite --json
```

只备份全局状态，不备份 workspace 或单独的 Agent 会话数据库。该全局快照仍包含密钥库和其他私有元数据，属于敏感文件。测试保持 SecretRef，由隔离 OpenClaw 正常解析；不查询数据库、不导出密钥、不把快照或凭证写进代码仓库或测试报告。测试使用合成人设和日记、独立配置和端口，关闭继承的调度工作；结束后删除本次临时目录。

自动审批最初拒绝创建这个快照，理由是当时请求尚未授权复制真实私有状态。用户随后明确回复“允许创建并使用临时快照”；后续仅在上述范围内执行。现有 Gateway、模型配置和日记保持不变。
