export interface PluginToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  data?: unknown;
  details?: unknown;
}

export interface PluginHookRegistration {
  event: string;
  priority?: number;
  execute: (event: unknown, context: unknown) => Promise<unknown> | unknown;
  source?: 'typed' | 'internal';
}

export interface PluginToolRegistration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (callId: string, params: unknown) => Promise<PluginToolResult>;
  optional?: boolean;
}

export type PluginToolFactory = (context?: unknown) => PluginToolRegistration;

export interface PluginEntryApi {
  registerTool: (tool: PluginToolRegistration | PluginToolFactory, options?: { optional?: boolean }) => void;
  on?: (event: string, handler: PluginHookRegistration['execute'], options?: { priority?: number }) => void;
  registerHook?: (
    events: string | string[],
    handler: PluginHookRegistration['execute'],
    options?: { name?: string; description?: string },
  ) => void;
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
  hooks: PluginHookRegistration[];
}

export function materializePlugin(definition: PluginEntryDefinition): RegisteredPluginShape {
  const tools: PluginToolRegistration[] = [];
  const hooks: PluginHookRegistration[] = [];

  definition.register({
    registerTool(tool, options) {
      const resolved = typeof tool === 'function' ? tool({}) : tool;
      tools.push({ ...resolved, optional: options?.optional });
    },
    on(event, handler, options) {
      hooks.push({
        event,
        priority: options?.priority,
        execute: handler,
        source: 'typed',
      });
    },
    registerHook(events, handler) {
      for (const event of Array.isArray(events) ? events : [events]) {
        hooks.push({
          event,
          execute: handler,
          source: 'internal',
        });
      }
    },
  });

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    tools,
    hooks,
  };
}
