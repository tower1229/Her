import { HookSpec } from '../openclaw-sdk-compat';
import { timelineResolve, TimelineResolveOutput } from '../tools/timeline_resolve';

export const preCompactionFlushHook: HookSpec = {
  name: 'timeline_pre_compaction_flush',
  description:
    'Lifecycle hook placeholder for invoking timeline_resolve before compaction or reset boundaries.',
  event: 'pre_compaction_flush',
};

export async function runPreCompactionFlush(): Promise<TimelineResolveOutput> {
  return timelineResolve({
    target_time_range: 'now_today',
    mode: 'allow_generate',
    reason: 'compaction_flush',
    trace: true,
  });
}
