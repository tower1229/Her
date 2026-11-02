import type { OpenClawPluginApi } from 'openclaw/plugin-sdk/core';
import {
  TIMELINE_PLUGIN_DESCRIPTION,
  TIMELINE_PLUGIN_ID,
  TIMELINE_PLUGIN_NAME,
  TIMELINE_PLUGIN_VERSION,
  TIMELINE_TOOL_NAMES,
} from './src/plugin_metadata';
import { materializePlugin, PluginEntryDefinition } from './src/openclaw-sdk-compat';
import {
  makeOpenClawTimelineBeforePromptBuildHook,
  makeOpenClawTimelineHeartbeatHook,
  makeOpenClawTimelineTypedSentHook,
  makeOpenClawTimelineMessagePreprocessedHook,
  makeOpenClawTimelineResolveToolFactory,
  makeOpenClawTimelineTransitionToolFactory
} from './src/runtime/openclaw_timeline_runtime';

function registerTimelineBeforePromptBuildHook(api: OpenClawPluginApi) {
  const beforePromptBuildHook = makeOpenClawTimelineBeforePromptBuildHook(api);
  if (typeof api.on === 'function') {
    api.on('before_prompt_build', beforePromptBuildHook, { priority: 0 });
    api.on('heartbeat_prompt_contribution', makeOpenClawTimelineHeartbeatHook(api));
    api.on('message_sent', makeOpenClawTimelineTypedSentHook(api));
  }
}

function registerTimelineEngagementHooks(api: OpenClawPluginApi) {
  if (typeof api.registerHook !== 'function') {
    return;
  }
  api.registerHook(['message:received', 'message:preprocessed'], makeOpenClawTimelineMessagePreprocessedHook(api), {
    name: `${TIMELINE_PLUGIN_ID}.message_preprocessed`,
    description: 'Maintain engagement from admitted inbound messages and their enriched content.',
  });

}

const openClawTimelinePlugin = {
  id: TIMELINE_PLUGIN_ID,
  name: TIMELINE_PLUGIN_NAME,
  version: TIMELINE_PLUGIN_VERSION,
  description: TIMELINE_PLUGIN_DESCRIPTION,
  tools: TIMELINE_TOOL_NAMES,
  register(api: OpenClawPluginApi) {
    api.registerTool(makeOpenClawTimelineResolveToolFactory(api));
    api.registerTool(makeOpenClawTimelineTransitionToolFactory(api));
    registerTimelineBeforePromptBuildHook(api);
    registerTimelineEngagementHooks(api);
  },
};

export const timelinePluginEntry = openClawTimelinePlugin;
export const timelinePlugin = materializePlugin(openClawTimelinePlugin as unknown as PluginEntryDefinition);
export default openClawTimelinePlugin;
