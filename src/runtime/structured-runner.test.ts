import { createRuntimeJsonPromptRunner } from './openclaw_timeline_runtime';
import { buildTransitionPlannerMessage, buildTransitionPlannerSystemPrompt } from '../core/transition_planner';
import { PersonaContractV1 } from '../persona/persona_contract';

describe('structured runtime runner', () => {
  const input = { sessionKey: 'requested', requestId: 'r1', message: 'question', extraSystemPrompt: 'JSON', timeoutMs: 1000, sourceLabel: 'probe' };
  function runtime() {
    return { run: jest.fn(async () => ({ runId: 'run', sessionKey: 'accepted' })),
      waitForRun: jest.fn(async () => ({ status: 'ok' })),
      getSessionMessages: jest.fn(async () => ({ messages: [{ role: 'assistant', content: [{ type: 'text', text: '{"request_id":"r1","ok":true}' }] }] })),
      deleteSession: jest.fn(async () => {}) };
  }
  it('waits through pending and reads/cleans the accepted session', async () => {
    const subagent = runtime();
    subagent.waitForRun.mockResolvedValueOnce({ status: 'pending' });
    expect(await createRuntimeJsonPromptRunner({ runtime: { subagent } })(input)).toEqual({ request_id: 'r1', ok: true });
    expect(subagent.run).toHaveBeenCalledTimes(1);
    expect(subagent.getSessionMessages).toHaveBeenCalledWith({ sessionKey: 'accepted', limit: 24 });
    expect(subagent.deleteSession).toHaveBeenCalledWith({ sessionKey: 'accepted', deleteTranscript: true });
  });
  it('supplies the transition correlation ID to the model for strict response validation', async () => {
    const subagent = runtime();
    let response = {};
    subagent.run.mockImplementation(async (...args: unknown[]) => {
      const { message, extraSystemPrompt } = args[0] as { message: string; extraSystemPrompt: string };
      const payload = JSON.parse(message.slice(message.indexOf('{')));
      expect(extraSystemPrompt).toContain('request_id');
      response = { request_id: payload.request_id, summary: '休息十分钟' };
      return { runId: 'run', sessionKey: 'accepted' };
    });
    subagent.getSessionMessages.mockImplementation(async () => ({ messages: [{ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(response) }] }] }));
    const message = buildTransitionPlannerMessage({ directive: '休息十分钟' }, { now: '2026-11-01T20:00:00+08:00', timezone: 'Asia/Shanghai' }, {} as PersonaContractV1, [], input.requestId);
    expect(await createRuntimeJsonPromptRunner({ runtime: { subagent } })({ ...input, message, extraSystemPrompt: buildTransitionPlannerSystemPrompt() })).toEqual({ request_id: input.requestId, summary: '休息十分钟' });
  });
  it('does not read or delete a still-running timed-out session', async () => {
    const subagent = runtime(); subagent.waitForRun.mockResolvedValue({ status: 'timeout' });
    await expect(createRuntimeJsonPromptRunner({ runtime: { subagent } })(input)).rejects.toThrow('no decision');
    expect(subagent.getSessionMessages).not.toHaveBeenCalled();
    expect(subagent.deleteSession).not.toHaveBeenCalled();
  });
  it('does not retry rejected admission or clean an uncreated session', async () => {
    const subagent = runtime(); subagent.run.mockRejectedValue(new Error('denied'));
    await expect(createRuntimeJsonPromptRunner({ runtime: { subagent } })(input)).rejects.toThrow('denied');
    expect(subagent.run).toHaveBeenCalledTimes(1);
    expect(subagent.deleteSession).not.toHaveBeenCalled();
  });
  it('keeps a successful response when cleanup fails', async () => {
    const subagent = runtime(); subagent.deleteSession.mockRejectedValue(new Error('cleanup'));
    expect((await createRuntimeJsonPromptRunner({ runtime: { subagent } })(input)).ok).toBe(true);
  });

  it.each(['not JSON', '{"request_id":"wrong","ok":true}'])('rejects invalid or stale output: %s', async text => {
    const subagent = runtime();
    subagent.getSessionMessages.mockResolvedValue({ messages: [{ role: 'assistant', content: [{ type: 'text', text }] }] });
    await expect(createRuntimeJsonPromptRunner({ runtime: { subagent } })(input)).rejects.toThrow();
    expect(subagent.deleteSession).toHaveBeenCalledTimes(1);
  });

  it('reports a missing runtime without importing a private factory', async () => {
    await expect(createRuntimeJsonPromptRunner({})(input)).rejects.toThrow(/runtime|subagent/i);
  });

  it('does not read a completion returned after the total budget', async () => {
    const subagent = runtime();
    subagent.waitForRun.mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 20)); return { status: 'ok' }; });
    await expect(createRuntimeJsonPromptRunner({ runtime: { subagent } })({ ...input, timeoutMs: 5 })).rejects.toThrow('no decision');
    expect(subagent.getSessionMessages).not.toHaveBeenCalled();
  });
  it('bounds a stalled admission without treating timeout as cancellation', async () => {
    const subagent = runtime();
    subagent.run.mockImplementation(() => new Promise(() => {}));
    await expect(createRuntimeJsonPromptRunner({ runtime: { subagent } })({ ...input, timeoutMs: 10 })).rejects.toThrow('no decision');
    expect(subagent.waitForRun).not.toHaveBeenCalled();
    expect(subagent.deleteSession).not.toHaveBeenCalled();
  });
});
