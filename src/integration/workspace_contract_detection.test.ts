import * as path from 'path';

async function loadWorkspaceContractModule() {
  return require(path.resolve(__dirname, '..', '..', 'scripts', 'workspace-contract.cjs'));
}

describe('workspace contract detection', () => {
  it('recognizes the current SOUL contract template as current rather than legacy', async () => {
    const contracts = await loadWorkspaceContractModule();

    const soul = contracts.buildSoulContract();
    expect(contracts.detectSoulContract(soul)).toBe(true);
    expect(contracts.detectCurrentSoulContract(soul)).toBe(true);
    expect(contracts.detectLegacySoulContract(soul)).toBe(false);
  });

  it('classifies v1 SOUL contracts as legacy so setup/doctor can upgrade them', async () => {
    const contracts = await loadWorkspaceContractModule();
    const legacySoulV1 = [
      '## 时间感知与回忆',
      '',
      '只有 Timeline 返回的结果才是时间状态和回忆问题的最终事实依据。',
    ].join('\n');

    expect(contracts.detectSoulContract(legacySoulV1)).toBe(true);
    expect(contracts.detectCurrentSoulContract(legacySoulV1)).toBe(false);
    expect(contracts.detectLegacySoulContract(legacySoulV1)).toBe(true);
  });

  it('classifies v2 SOUL contracts as legacy so setup/doctor can upgrade them', async () => {
    const contracts = await loadWorkspaceContractModule();
    const legacySoulV2 = [
      '## Temporal Awareness And Recall',
      '',
      'You have clear temporal awareness and continuous recall.',
      '',
      'If a truthful answer depends on time-grounded lived experience, enter the timeline skill first.',
      '',
      'The timeline skill owns the precise routing rules and whether Timeline should be called.',
    ].join('\n');

    expect(contracts.detectSoulContract(legacySoulV2)).toBe(true);
    expect(contracts.detectCurrentSoulContract(legacySoulV2)).toBe(false);
    expect(contracts.detectLegacySoulContract(legacySoulV2)).toBe(true);
  });
});
