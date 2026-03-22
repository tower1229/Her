import { auditTraceHook } from './src/hooks/audit_trace';
import { preCompactionFlushHook } from './src/hooks/pre_compaction_flush';
import { sessionSnapshotHook } from './src/hooks/session_snapshot';
import {
  definePluginEntry,
  makeTimelineToolRegistration,
  materializePlugin,
} from './src/openclaw-sdk-compat';

export const timelinePluginEntry = definePluginEntry({
  id: 'timeline-plugin',
  name: 'Timeline Plugin',
  description:
    'OpenClaw timeline v2 runtime with a canonical timeline_resolve entrypoint and lifecycle helpers.',
  register(api) {
    api.registerTool(makeTimelineToolRegistration());
    api.registerHook(preCompactionFlushHook);
    api.registerHook(sessionSnapshotHook);
    api.registerHook(auditTraceHook);
  },
});

export const timelinePlugin = materializePlugin(timelinePluginEntry);

export default timelinePluginEntry;
