import { HookSpec } from '../plugin-spec';

export const preCompactionFlushHook: HookSpec = {
  name: 'timeline_pre_compaction_flush',
  description:
    'Lifecycle hook placeholder for invoking timeline_resolve before compaction or reset boundaries.',
  event: 'pre_compaction_flush',
};
