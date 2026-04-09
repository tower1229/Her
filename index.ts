import {
  TIMELINE_PLUGIN_DESCRIPTION,
  TIMELINE_PLUGIN_ID,
  TIMELINE_PLUGIN_NAME,
  TIMELINE_PLUGIN_VERSION,
  TIMELINE_TOOL_NAMES,
} from './src/plugin_metadata';
import {
  definePluginEntry,
  makeTimelineToolRegistration,
  makeTimelineTransitionToolRegistration,
  materializePlugin,
} from './src/openclaw-sdk-compat';
import {
  makeOpenClawTimelineBeforePromptBuildHook,
  makeOpenClawTimelineMessagePreprocessedHook,
  makeOpenClawTimelineMessageSentHook,
  makeOpenClawTimelineResolveToolFactory,
  makeOpenClawTimelineTransitionToolFactory
} from './src/runtime/openclaw_timeline_runtime';

function registerTimelineBeforePromptBuildHook(api: {
  on?: (
    hookName: string,
    handler: (...args: unknown[]) => unknown,
    options?: { priority?: number },
  ) => void;
  registerHook?: (
    events: string | string[],
    handler: (...args: unknown[]) => unknown,
    options?: { name?: string; description?: string },
  ) => void;
}) {
  const runtimeApi = api as any;
  const beforePromptBuildHook =
    makeOpenClawTimelineBeforePromptBuildHook(runtimeApi) as (...args: unknown[]) => unknown;
  if (typeof api.on === 'function') {
    api.on('before_prompt_build', beforePromptBuildHook, { priority: 0 });
  } else if (typeof api.registerHook === 'function') {
    api.registerHook('before_prompt_build', beforePromptBuildHook, {
      name: `${TIMELINE_PLUGIN_ID}.before_prompt_build`,
      description: 'Inject timeline prompt context before prompt build.',
    });
  }
}

function registerTimelineEngagementHooks(api: {
  registerHook?: (
    events: string | string[],
    handler: (...args: unknown[]) => unknown,
    options?: { name?: string; description?: string },
  ) => void;
  pluginConfig?: Record<string, unknown>;
  config?: unknown;
  runtime?: unknown;
  workspaceDir?: string;
  logger?: unknown;
}) {
  if (typeof api.registerHook !== 'function') {
    return;
  }
  const runtimeApi = api as any;
  api.registerHook('message:preprocessed', makeOpenClawTimelineMessagePreprocessedHook(runtimeApi), {
    name: `${TIMELINE_PLUGIN_ID}.message_preprocessed`,
    description: 'Maintain proactive engagement state from enriched inbound messages.',
  });
  api.registerHook('message:sent', makeOpenClawTimelineMessageSentHook(runtimeApi), {
    name: `${TIMELINE_PLUGIN_ID}.message_sent`,
    description: 'Maintain proactive engagement state from outbound delivery results.',
  });
}

export const timelinePluginEntry = definePluginEntry({
  id: TIMELINE_PLUGIN_ID,
  name: TIMELINE_PLUGIN_NAME,
  description: TIMELINE_PLUGIN_DESCRIPTION,
  register(api) {
    api.registerTool(makeTimelineToolRegistration());
    api.registerTool(makeTimelineTransitionToolRegistration());
    registerTimelineBeforePromptBuildHook(api as any);
    registerTimelineEngagementHooks(api as any);
  },
});

export const timelinePlugin = materializePlugin(timelinePluginEntry);

const openClawTimelinePlugin = {
  id: TIMELINE_PLUGIN_ID,
  name: TIMELINE_PLUGIN_NAME,
  version: TIMELINE_PLUGIN_VERSION,
  description: TIMELINE_PLUGIN_DESCRIPTION,
  tools: TIMELINE_TOOL_NAMES,
  register(api: {
    pluginConfig?: Record<string, unknown>;
    config?: unknown;
    runtime?: unknown;
    workspaceDir?: string;
    logger?: unknown;
    resolvePath?: (input: string) => string;
    registerTool: (tool: unknown, options?: { optional?: boolean }) => void;
    on?: (
      hookName: string,
      handler: (...args: unknown[]) => unknown,
      options?: { priority?: number },
    ) => void;
    registerHook?: (
      events: string | string[],
      handler: (...args: unknown[]) => unknown,
      options?: { name?: string; description?: string },
    ) => void;
  }) {
    const runtimeApi = api as any;
    api.registerTool(makeOpenClawTimelineResolveToolFactory(runtimeApi));
    api.registerTool(makeOpenClawTimelineTransitionToolFactory(runtimeApi));
    registerTimelineBeforePromptBuildHook(api);
    registerTimelineEngagementHooks(api as any);
  },
};

export default openClawTimelinePlugin;
