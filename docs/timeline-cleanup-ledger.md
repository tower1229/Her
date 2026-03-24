# Timeline 冗余清理记录

> 状态：持续维护
> 目的：在重构过程中记录待清理的冗余文件与过时残留，避免最后遗漏

## 1. 已确认待处理

- 当前暂无已确认但未处理完的冗余文件。

## 2. 已完成清理

- `now_today` 公开查询名已从代码主路径和文档主路径移除，改为公开 `now`。
- [src/core/generation_prompt.ts](/Users/zangtao/Workspace/tower1229/Her/src/core/generation_prompt.ts) 已删除。
  该文件未接入任何主流程，继续保留只会制造“还有另一套生成路径”的误导。
- [docs/timeline-integration-test-cases.md](/Users/zangtao/Workspace/tower1229/Her/docs/timeline-integration-test-cases.md) 已同步到 `now / past_point / past_range` 查询模型。

## 3. 清理原则

- 只要文件已经不再服务当前北极星目标，就不保留。
- 如果一个文件只是旧阶段过渡产物，但当前主流程已经不用，应优先删除而不是继续兼容。
- 如果一个文件仍有潜在用途，但当前没有接入主路径，先记录，再在对应阶段结束时决定保留或删除。
