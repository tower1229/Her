export type PersonaStructuredValue = string | string[];
export type PersonaStructuredSection = Record<string, PersonaStructuredValue>;

export interface ParsedPersonaProfile {
  found: boolean;
  raw_text: string;
  sections: {
    meta?: PersonaStructuredSection;
    identity?: PersonaStructuredSection;
    soul?: PersonaStructuredSection;
    stable_memory?: PersonaStructuredSection;
    daily_rhythm_tendencies?: PersonaStructuredSection;
    appearance_tendencies?: PersonaStructuredSection;
    scene_anchors?: PersonaStructuredSection;
    constraint_rules?: PersonaStructuredSection;
  };
  parse_warnings: string[];
}

export interface LegacyCoreFiles {
  soul: string;
  memory: string;
  identity: string;
  found: {
    soul: boolean;
    memory: boolean;
    identity: boolean;
  };
}
