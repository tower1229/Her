import { buildPersonaContractFromProfile } from './build_persona_contract_from_profile';
import { parsePersonaProfileMarkdown } from './read_persona_profile';

describe('buildPersonaContractFromProfile', () => {
  it('maps supported PERSONA_PROFILE fields into PersonaContractV1', () => {
    const parsed = parsePersonaProfileMarkdown([
      '# PERSONA_PROFILE',
      '',
      '## Meta',
      '- home_city: Shanghai',
      '- home_country: China',
      '- home_timezone: Asia/Shanghai',
      '',
      '## Identity',
      '- living_style: urban independent',
      '- base_environment: apartment home base',
      '- common_zones: [home study, neighborhood cafe]',
      '- routine_context: [often works from home]',
      '',
      '## Soul',
      '- temperament: reflective',
      '- values: [continuity, honesty]',
      '',
      '## Stable Memory',
      '- long_term_habits: [quiet desk work]',
      '',
      '## Appearance Tendencies',
      '- change_triggers: [exercise]',
      '',
      '## Scene Anchors',
      '- plausible_locations: [Home, Neighborhood cafe]',
      '',
      '## Constraint Rules',
      '- avoid: [inventing time facts]',
    ].join('\n'));

    const contract = buildPersonaContractFromProfile(parsed);

    expect(contract.identity.home_city).toBe('Shanghai');
    expect(contract.identity.common_zones).toEqual(['home study', 'neighborhood cafe']);
    expect(contract.soul.temperament).toBe('reflective');
    expect(contract.soul.values).toEqual(['continuity', 'honesty']);
    expect(contract.memory.long_term_habits).toEqual(['quiet desk work']);
    expect(contract.appearance.change_triggers).toEqual(['exercise']);
    expect(contract.scene.plausible_locations).toEqual(['Home', 'Neighborhood cafe']);
    expect(contract.constraints.avoid).toEqual(['inventing time facts']);
  });
});
