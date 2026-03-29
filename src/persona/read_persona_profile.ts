import * as fs from 'fs';
import * as path from 'path';
import { ParsedPersonaProfile, PersonaStructuredSection, PersonaStructuredValue } from './persona_source_types';

const PROFILE_RELATIVE_PATH = path.join('persona', 'PERSONA_PROFILE.md');

type SupportedSectionName =
  | 'meta'
  | 'identity'
  | 'soul'
  | 'stable_memory'
  | 'daily_rhythm_tendencies'
  | 'appearance_tendencies'
  | 'scene_anchors'
  | 'constraint_rules';

const SECTION_NAME_MAP: Record<string, SupportedSectionName | undefined> = {
  meta: 'meta',
  identity: 'identity',
  soul: 'soul',
  'stable memory': 'stable_memory',
  'daily rhythm tendencies': 'daily_rhythm_tendencies',
  'appearance tendencies': 'appearance_tendencies',
  'scene anchors': 'scene_anchors',
  'constraint rules': 'constraint_rules',
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

function parseYamlScalar(raw: string): PersonaStructuredValue {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed === '[]') return [];
  return parseInlineValue(trimmed);
}

function parseYamlBlock(sectionName: SupportedSectionName, yamlText: string, warnings: string[]): PersonaStructuredSection {
  const entries: PersonaStructuredSection = {};
  const lines = yamlText.split(/\r?\n/);
  let currentListKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim()) continue;

    const listMatch = line.match(/^\s{2,}-\s+(.+)$/);
    if (listMatch && currentListKey) {
      const current = Array.isArray(entries[currentListKey]) ? entries[currentListKey] as string[] : [];
      current.push(listMatch[1].trim());
      entries[currentListKey] = current;
      continue;
    }

    const scalarMatch = line.match(/^([A-Za-z0-9_ -]+):\s*(.*)$/);
    if (!scalarMatch) {
      warnings.push(`Ignored malformed YAML line in section "${sectionName}": ${line.trim()}`);
      currentListKey = null;
      continue;
    }

    const key = normalizeEntryKey(scalarMatch[1]);
    const rawValue = scalarMatch[2];
    if (!rawValue.trim()) {
      entries[key] = [];
      currentListKey = key;
      continue;
    }
    entries[key] = parseYamlScalar(rawValue);
    currentListKey = null;
  }

  return entries;
}

function parseStructuredSection(
  sectionName: SupportedSectionName,
  lines: string[],
  warnings: string[],
): PersonaStructuredSection {
  const entries: PersonaStructuredSection = {};
  let pendingListKey: string | null = null;
  let activeFenceLines: string[] | null = null;

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      if (activeFenceLines) {
        const parsedBlock = parseYamlBlock(sectionName, activeFenceLines.join('\n'), warnings);
        Object.assign(entries, parsedBlock);
        activeFenceLines = null;
      } else {
        activeFenceLines = [];
      }
      pendingListKey = null;
      continue;
    }
    if (activeFenceLines) {
      activeFenceLines.push(line);
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

export function parsePersonaProfileMarkdown(rawText: string): ParsedPersonaProfile {
  const text = rawText.trim();
  if (!text) {
    return {
      found: false,
      raw_text: '',
      sections: {},
      parse_warnings: [],
    };
  }

  const sections: ParsedPersonaProfile['sections'] = {};
  const warnings: string[] = [];
  const lines = rawText.split(/\r?\n/);
  let currentSection: SupportedSectionName | undefined;
  let buffer: string[] = [];

  function flushCurrentSection(): void {
    if (!currentSection) return;
    sections[currentSection] = parseStructuredSection(currentSection, buffer, warnings);
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
      parse_warnings: [],
    };
  }
  return parsePersonaProfileMarkdown(rawText);
}
