import * as fs from 'fs';
import * as path from 'path';
import { ParsedPersonaProfile, ParsedRetrievalUnit, PersonaStructuredSection, PersonaStructuredValue } from './types';

const PROFILE_RELATIVE_PATH = path.join('persona', 'PERSONA_PROFILE.md');

type SupportedSectionName =
  | 'meta'
  | 'identity'
  | 'soul'
  | 'stable_memory'
  | 'daily_rhythm_tendencies'
  | 'appearance_tendencies'
  | 'scene_anchors'
  | 'constraint_rules'
  | 'retrieval_units';

const SECTION_NAME_MAP: Record<string, SupportedSectionName | undefined> = {
  meta: 'meta',
  identity: 'identity',
  soul: 'soul',
  'stable memory': 'stable_memory',
  'daily rhythm tendencies': 'daily_rhythm_tendencies',
  'appearance tendencies': 'appearance_tendencies',
  'scene anchors': 'scene_anchors',
  'constraint rules': 'constraint_rules',
  'retrieval units': 'retrieval_units',
};

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function normalizeSectionHeading(raw: string): SupportedSectionName | undefined {
  return SECTION_NAME_MAP[raw.trim().toLowerCase()];
}

function normalizeEntryKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

function parseInlineValue(raw: string): PersonaStructuredValue {
  const trimmed = raw.trim();
  const arrayMatch = trimmed.match(/^\[(.*)\]$/);
  if (!arrayMatch) return trimmed;
  return arrayMatch[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseStructuredSection(
  sectionName: SupportedSectionName,
  lines: string[],
  warnings: string[],
): PersonaStructuredSection {
  const entries: PersonaStructuredSection = {};
  let pendingListKey: string | null = null;
  let fencedBlockWarningIssued = false;

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (!fencedBlockWarningIssued) {
        warnings.push(`Ignored fenced block while parsing section "${sectionName}".`);
        fencedBlockWarningIssued = true;
      }
      pendingListKey = null;
      continue;
    }

    if (!line.trim()) continue;

    const nestedListMatch = line.match(/^\s{2,}-\s+(.+)$/);
    if (pendingListKey && nestedListMatch) {
      const existing = entries[pendingListKey];
      const current = Array.isArray(existing) ? existing : [];
      current.push(nestedListMatch[1].trim());
      entries[pendingListKey] = current;
      continue;
    }
    if (nestedListMatch) {
      warnings.push(`Ignored malformed line in section "${sectionName}": ${line.trim()}`);
      continue;
    }

    const bulletMatch = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!bulletMatch) {
      warnings.push(`Ignored malformed line in section "${sectionName}": ${line.trim()}`);
      pendingListKey = null;
      continue;
    }

    const key = normalizeEntryKey(bulletMatch[1]);
    const rawValue = bulletMatch[2];
    if (!rawValue.trim()) {
      entries[key] = [];
      pendingListKey = key;
      continue;
    }

    entries[key] = parseInlineValue(rawValue);
    pendingListKey = null;
  }

  return entries;
}

function parseRetrievalUnits(lines: string[], warnings: string[]): ParsedRetrievalUnit[] {
  const units: ParsedRetrievalUnit[] = [];
  let current: ParsedRetrievalUnit | null = null;
  let fencedBlockWarningIssued = false;

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (!fencedBlockWarningIssued) {
        warnings.push('Ignored fenced block while parsing section "retrieval_units".');
        fencedBlockWarningIssued = true;
      }
      continue;
    }

    const unitMatch = line.match(/^###\s+unit:\s+(.+)$/i);
    if (unitMatch) {
      if (current?.id) units.push(current);
      current = { id: unitMatch[1].trim() };
      continue;
    }

    if (!current) {
      if (line.trim()) {
        warnings.push(`Ignored malformed line in section "retrieval_units": ${line.trim()}`);
      }
      continue;
    }

    const bulletMatch = line.match(/^- ([^:]+):\s*(.*)$/);
    if (!bulletMatch) {
      warnings.push(`Ignored malformed line in section "retrieval_units": ${line.trim()}`);
      continue;
    }
    const key = normalizeEntryKey(bulletMatch[1]);
    const value = bulletMatch[2].trim();
    if (!value) continue;
    if (key === 'type') current.type = value;
    if (key === 'priority') current.priority = value;
    if (key === 'summary') current.summary = value;
  }

  if (current?.id) units.push(current);
  return units;
}

export function parsePersonaProfileMarkdown(rawText: string): ParsedPersonaProfile {
  const text = rawText.trim();
  if (!text) {
    return {
      found: false,
      raw_text: '',
      sections: {},
      retrieval_units: [],
      parse_warnings: [],
    };
  }

  const sections: ParsedPersonaProfile['sections'] = {};
  const retrievalUnits: ParsedRetrievalUnit[] = [];
  const warnings: string[] = [];
  const lines = rawText.split(/\r?\n/);
  let currentSection: SupportedSectionName | undefined;
  let buffer: string[] = [];

  function flushCurrentSection(): void {
    if (!currentSection) return;
    if (currentSection === 'retrieval_units') {
      retrievalUnits.push(...parseRetrievalUnits(buffer, warnings));
    } else {
      sections[currentSection] = parseStructuredSection(currentSection, buffer, warnings);
    }
    buffer = [];
  }

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      flushCurrentSection();
      currentSection = normalizeSectionHeading(sectionMatch[1]);
      buffer = [];
      continue;
    }
    if (currentSection) {
      buffer.push(line);
    }
  }
  flushCurrentSection();

  return {
    found: true,
    raw_text: rawText,
    sections,
    retrieval_units: retrievalUnits,
    parse_warnings: warnings,
  };
}

export function readPersonaProfile(workspaceDir: string): ParsedPersonaProfile {
  const filePath = path.join(workspaceDir, PROFILE_RELATIVE_PATH);
  const rawText = readTextFile(filePath);
  if (!rawText.trim()) {
    return {
      found: false,
      raw_text: '',
      sections: {},
      retrieval_units: [],
      parse_warnings: [],
    };
  }
  return parsePersonaProfileMarkdown(rawText);
}
