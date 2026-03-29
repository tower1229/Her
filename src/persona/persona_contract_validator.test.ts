import { emptyPersonaContract } from './persona_contract';
import { normalizeCandidatePersonaContract, validatePersonaContract } from './persona_contract_validator';

describe('persona_contract_validator', () => {
  it('accepts a minimal well-formed contract', () => {
    const contract = {
      ...emptyPersonaContract(),
      identity: {
        ...emptyPersonaContract().identity,
        home_city: 'Shanghai',
      },
      soul: {
        ...emptyPersonaContract().soul,
        temperament: 'reflective',
      },
    };

    const result = validatePersonaContract(contract);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects temporal phrasing in stable persona fields', () => {
    const contract = normalizeCandidatePersonaContract({
      identity: { home_city: 'Shanghai' },
      memory: {
        long_term_preferences: ['she is currently at home'],
      },
    });

    const result = validatePersonaContract(contract);
    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toContain('temporal wording');
  });
});
