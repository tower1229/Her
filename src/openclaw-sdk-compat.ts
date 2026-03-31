import { timelineResolveToolSpec } from './tools/timeline_resolve';
import { timelineTransitionToolSpec } from './tools/timeline_transition';

export interface PluginToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  data?: unknown;
}

export interface PluginToolRegistration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (callId: string, params: unknown) => Promise<PluginToolResult>;
  optional?: boolean;
}

export interface PluginEntryApi {
  registerTool: (tool: PluginToolRegistration, options?: { optional?: boolean }) => void;
}

export interface PluginEntryDefinition {
  id: string;
  name: string;
  description: string;
  register: (api: PluginEntryApi) => void;
}

export interface RegisteredPluginShape {
  id: string;
  name: string;
  description: string;
  tools: PluginToolRegistration[];
}

export function definePluginEntry(definition: PluginEntryDefinition): PluginEntryDefinition {
  return definition;
}

export function materializePlugin(definition: PluginEntryDefinition): RegisteredPluginShape {
  const tools: PluginToolRegistration[] = [];

  definition.register({
    registerTool(tool, options) {
      tools.push({ ...tool, optional: options?.optional });
    },
  });

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    tools,
  };
}

function wrapToolData(data: unknown): PluginToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    data,
  };
}

export function makeTimelineToolRegistration(): PluginToolRegistration {
  return {
    name: timelineResolveToolSpec.name,
    description: timelineResolveToolSpec.description,
    parameters: timelineResolveToolSpec.inputSchema,
    async execute(_callId, params) {
      return wrapToolData(await timelineResolveToolSpec.run(params as never));
    },
  };
}

export function makeTimelineTransitionToolRegistration(): PluginToolRegistration {
  return {
    name: timelineTransitionToolSpec.name,
    description: timelineTransitionToolSpec.description,
    parameters: timelineTransitionToolSpec.inputSchema,
    async execute(_callId, params) {
      // Base usage; openclaw_timeline_runtime has the full implementation.
      return wrapToolData(await timelineTransitionToolSpec.run(params as never, {} as never));
    },
  };
}
