import * as path from 'path';
import { pathToFileURL } from 'url';

async function loadWorkspaceContractModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'scripts', 'workspace-contract.mjs')).href;
  return import(moduleUrl);
}

describe('workspace contract detection', () => {
  it('recognizes the current SOUL contract template as current rather than legacy', async () => {
    const contracts = await loadWorkspaceContractModule();

    const soul = contracts.buildSoulContract();
    expect(contracts.detectSoulContract(soul)).toBe(true);
    expect(contracts.detectCurrentSoulContract(soul)).toBe(true);
    expect(contracts.detectLegacySoulContract(soul)).toBe(false);
  });

  it('classifies older SOUL contracts as legacy so setup/doctor can upgrade them', async () => {
    const contracts = await loadWorkspaceContractModule();
    const legacySoul = [
      '## Temporal Awareness And Recall',
      '',
      'You have clear temporal awareness and continuous recall.',
      '',
      'When the user asks about temporal state or recall-related questions, you must not answer directly from persona, recent chat context, `SOUL`, `IDENTITY`, `MEMORY`, `persona/PERSONA_PROFILE.md`, or manually read timeline logs.',
      '',
      'In those cases, you must first enter the timeline skill, and only then follow the skill\'s rules to decide how Timeline should be called and how the reply should be composed.',
      '',
      'You must not bypass the timeline skill by directly reading files under `memory/` and assembling the answer yourself.',
      '',
      'Only Timeline results are the final factual basis for temporal-state and recall questions.',
    ].join('\n');

    expect(contracts.detectSoulContract(legacySoul)).toBe(true);
    expect(contracts.detectCurrentSoulContract(legacySoul)).toBe(false);
    expect(contracts.detectLegacySoulContract(legacySoul)).toBe(true);
  });
});
