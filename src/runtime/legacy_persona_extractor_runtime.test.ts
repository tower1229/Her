import { createLegacyPersonaExtractorRuntime } from './legacy_persona_extractor_runtime';

describe('createLegacyPersonaExtractorRuntime', () => {
  it('builds an isolated extractor prompt without user query input', async () => {
    type RunJsonPrompt = (input: {
      sessionKey: string;
      requestId: string;
      message: string;
      extraSystemPrompt: string;
      timeoutMs: number;
      sourceLabel: string;
    }) => Promise<Record<string, unknown>>;
    const runJsonPrompt = jest.fn(async (_input: Parameters<RunJsonPrompt>[0]) => ({ schema_version: '1.0' })) as jest.MockedFunction<RunJsonPrompt>;
    const extractor = createLegacyPersonaExtractorRuntime({
      baseSessionKey: 'session-main',
      sessionPrefix: 'timeline-persona-extractor',
      timeoutMs: 60000,
      modelId: 'mock-model',
      extractorVersion: 'extractor-v1',
      runJsonPrompt,
    });

    await extractor.run({
      soul: 'She is reflective.',
      memory: 'She likes quiet desk work.',
      identity: 'She lives in Shanghai.',
      contractVersion: '1.0',
      validationFeedback: ['identity.home_city must not be temporal'],
    });

    expect(runJsonPrompt).toHaveBeenCalledTimes(1);
    const call = runJsonPrompt.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call.sessionKey).toContain('timeline-persona-extractor');
    expect(call.message).toContain('"soul": "She is reflective."');
    expect(call.message).toContain('"memory": "She likes quiet desk work."');
    expect(call.message).toContain('"identity": "She lives in Shanghai."');
    expect(call.message).not.toContain('"query"');
    expect(call.extraSystemPrompt).toContain('Do not use the user query');
  });
});
