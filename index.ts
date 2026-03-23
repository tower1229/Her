import {
  TIMELINE_PLUGIN_DESCRIPTION,
  TIMELINE_PLUGIN_ID,
  TIMELINE_PLUGIN_NAME,
  TIMELINE_PLUGIN_VERSION,
} from './src/plugin_metadata';
import {
  definePluginEntry,
  getTimelineHookRegistrations,
  makeTimelineRepairToolRegistration,
  makeTimelineStatusToolRegistration,
  makeTimelineToolRegistration,
  materializePlugin,
} from './src/openclaw-sdk-compat';

export const timelinePluginEntry = definePluginEntry({
  id: TIMELINE_PLUGIN_ID,
  name: TIMELINE_PLUGIN_NAME,
  description: TIMELINE_PLUGIN_DESCRIPTION,
  register(api) {
    api.registerTool(makeTimelineToolRegistration(), { optional: true });
    api.registerTool(makeTimelineStatusToolRegistration());
    api.registerTool(makeTimelineRepairToolRegistration(), { optional: true });
    for (const hook of getTimelineHookRegistrations()) {
      api.registerHook(hook);
    }
  },
});

export const timelinePlugin = materializePlugin(timelinePluginEntry);

const openClawTimelinePlugin = {
  id: TIMELINE_PLUGIN_ID,
  name: TIMELINE_PLUGIN_NAME,
  version: TIMELINE_PLUGIN_VERSION,
  description: TIMELINE_PLUGIN_DESCRIPTION,
  register(api: {
    registerTool: (tool: ReturnType<typeof makeTimelineToolRegistration>, options?: { optional?: boolean }) => void;
    registerHook?: (
      events: string | string[],
      handler: (...args: unknown[]) => unknown,
      options?: { name?: string; description?: string },
    ) => void;
  }) {
    api.registerTool(makeTimelineToolRegistration(), { optional: true });
    api.registerTool(makeTimelineStatusToolRegistration());
    api.registerTool(makeTimelineRepairToolRegistration(), { optional: true });
    if (typeof api.registerHook === 'function') {
      for (const hook of getTimelineHookRegistrations()) {
        api.registerHook(
          hook.event,
          async () => undefined,
          {
            name: hook.name,
            description: hook.description,
          },
        );
      }
    }
  },
};

export default openClawTimelinePlugin;
