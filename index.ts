import { auditTraceHook } from './src/hooks/audit_trace';
import { preCompactionFlushHook } from './src/hooks/pre_compaction_flush';
import { sessionSnapshotHook } from './src/hooks/session_snapshot';
import {
  TIMELINE_PLUGIN_DESCRIPTION,
  TIMELINE_PLUGIN_ID,
  TIMELINE_PLUGIN_NAME,
} from './src/plugin_metadata';
import {
  definePluginEntry,
  makeTimelineStatusToolRegistration,
  makeTimelineToolRegistration,
  materializePlugin,
} from './src/openclaw-sdk-compat';

export const timelinePluginEntry = definePluginEntry({
  id: TIMELINE_PLUGIN_ID,
  name: TIMELINE_PLUGIN_NAME,
  description: TIMELINE_PLUGIN_DESCRIPTION,
  register(api) {
    api.registerTool(makeTimelineToolRegistration());
    api.registerTool(makeTimelineStatusToolRegistration());
    api.registerHook(preCompactionFlushHook);
    api.registerHook(sessionSnapshotHook);
    api.registerHook(auditTraceHook);
  },
});

export const timelinePlugin = materializePlugin(timelinePluginEntry);

export default timelinePluginEntry;
