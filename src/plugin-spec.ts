export interface PluginConfigSchema {
  type: 'object';
  properties: Record<string, unknown>;
  additionalProperties?: boolean;
}

export interface ToolSpec<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: TInput) => Promise<TOutput>;
}

export interface HookSpec {
  name: string;
  description: string;
  event: string;
}

export interface PluginSpec {
  id: string;
  description: string;
  skillsDir: string;
  configSchema: PluginConfigSchema;
  tools: ToolSpec<any, any>[];
  hooks: HookSpec[];
}
