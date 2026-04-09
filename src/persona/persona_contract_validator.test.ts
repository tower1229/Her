import { emptyPersonaContract } from './persona_contract';
import {
  normalizeCandidatePersonaContract,
  validateCandidatePersonaContractPayload,
  validatePersonaContract,
} from './persona_contract_validator';

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

  it('rejects extractor payloads with missing schema_version or unknown fields', () => {
    const result = validateCandidatePersonaContractPayload({
      identity: { home_city: 'Shanghai', unsupported_field: 'x' },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.join(' ')).toContain('schema_version');
    expect(result.issues.join(' ')).toContain('unknown field "identity.unsupported_field"');
  });

  it('accepts extractor payloads with optional request_id matching subagent correlation', () => {
    const result = validateCandidatePersonaContractPayload({
      schema_version: '1.0',
      request_id: 'timeline-persona-extract-1-1',
      identity: { home_city: 'Shanghai' },
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects non-string or blank request_id when present', () => {
    const blank = validateCandidatePersonaContractPayload({
      schema_version: '1.0',
      request_id: '   ',
      identity: { home_city: 'Shanghai' },
    });
    expect(blank.ok).toBe(false);
    expect(blank.issues.join(' ')).toContain('request_id');

    const numeric = validateCandidatePersonaContractPayload({
      schema_version: '1.0',
      request_id: 123 as unknown as string,
      identity: { home_city: 'Shanghai' },
    });
    expect(numeric.ok).toBe(false);
    expect(numeric.issues.join(' ')).toContain('request_id');
  });
});
