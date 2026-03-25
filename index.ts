import {
  TIMELINE_PLUGIN_DESCRIPTION,
  TIMELINE_PLUGIN_ID,
  TIMELINE_PLUGIN_NAME,
  TIMELINE_PLUGIN_VERSION,
} from './src/plugin_metadata';
import {
  definePluginEntry,
  makeTimelineToolRegistration,
  materializePlugin,
} from './src/openclaw-sdk-compat';
import { makeOpenClawTimelineResolveToolFactory } from './src/runtime/openclaw_timeline_runtime';

export const timelinePluginEntry = definePluginEntry({
  id: TIMELINE_PLUGIN_ID,
  name: TIMELINE_PLUGIN_NAME,
  description: TIMELINE_PLUGIN_DESCRIPTION,
  register(api) {
    api.registerTool(makeTimelineToolRegistration());
  },
});

export const timelinePlugin = materializePlugin(timelinePluginEntry);

const openClawTimelinePlugin = {
  id: TIMELINE_PLUGIN_ID,
  name: TIMELINE_PLUGIN_NAME,
  version: TIMELINE_PLUGIN_VERSION,
  description: TIMELINE_PLUGIN_DESCRIPTION,
  register(api: {
    pluginConfig?: Record<string, unknown>;
    config?: unknown;
    runtime?: unknown;
    workspaceDir?: string;
    logger?: unknown;
    resolvePath?: (input: string) => string;
    registerTool: (tool: unknown, options?: { optional?: boolean }) => void;
    registerHook?: (
      events: string | string[],
      handler: (...args: unknown[]) => unknown,
      options?: { name?: string; description?: string },
    ) => void;
  }) {
    const runtimeApi = api as any;
    api.registerTool(makeOpenClawTimelineResolveToolFactory(runtimeApi));
  },
};

export default openClawTimelinePlugin;
