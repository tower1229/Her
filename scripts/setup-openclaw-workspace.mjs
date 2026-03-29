#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAgentsContract,
  buildSoulContract,
  detectAgentsContract,
  detectCurrentSoulContract,
  detectLegacySoulContract,
  detectSoulContract,
  LEGACY_SOUL_SECTION_TITLE,
  normalizeRootName,
  resolveCanonicalRootPath,
  SOUL_SECTION_TITLE,
} from './workspace-contract.mjs';

function parseArgs(argv) {
  const options = {
    workspace: path.resolve(process.cwd()),
    canonicalRootName: 'memory',
    createMemoryRoot: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace') {
      options.workspace = path.resolve(argv[++i] || '');
      continue;
    }
    if (arg === '--canonical-root-name') {
      options.canonicalRootName = normalizeRootName(argv[++i] || '');
      continue;
    }
    if (arg === '--no-create-memory-root') {
      options.createMemoryRoot = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage: openclaw-timeline-setup [--workspace <dir>] [--canonical-root-name <name>] [--no-create-memory-root]',
    '',
    'Idempotently appends the required Timeline contract blocks to AGENTS.md and SOUL.md.',
  ].join('\n'));
}

function readTextFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function ensureTrailingNewline(content) {
  if (!content) return '';
  return content.endsWith('\n') ? content : `${content}\n`;
}

function mergeSection(existingContent, sectionContent, predicate) {
  if (predicate(existingContent)) {
    return { changed: false, content: ensureTrailingNewline(existingContent) };
  }

  const prefix = existingContent.trimEnd();
  const merged = prefix
    ? `${prefix}\n\n${sectionContent}\n`
    : `${sectionContent}\n`;
  return { changed: true, content: merged };
}

function replaceSectionByTitle(existingContent, sectionTitles, sectionContent) {
  const normalized = ensureTrailingNewline(existingContent);
  for (const title of sectionTitles) {
    const start = normalized.indexOf(title);
    if (start === -1) continue;
    const nextSectionMatch = normalized.slice(start + title.length).match(/\n##\s+/);
    const end = nextSectionMatch
      ? start + title.length + nextSectionMatch.index + 1
      : normalized.length;
    const replaced = `${normalized.slice(0, start).trimEnd()}\n\n${sectionContent}\n${normalized.slice(end).replace(/^\s+/, '')}`;
    return { changed: true, content: ensureTrailingNewline(replaced).replace(/^\n+/, '') };
  }
  return null;
}

function mergeSoulSection(existingContent, sectionContent) {
  if (detectCurrentSoulContract(existingContent)) {
    return { changed: false, content: ensureTrailingNewline(existingContent), status: 'kept-current' };
  }
  if (detectLegacySoulContract(existingContent)) {
    const replaced = replaceSectionByTitle(
      existingContent,
      [SOUL_SECTION_TITLE, LEGACY_SOUL_SECTION_TITLE],
      sectionContent,
    );
    if (replaced) {
      return { changed: true, content: replaced.content, status: 'upgraded-legacy' };
    }
  }
  const merged = mergeSection(existingContent, sectionContent, detectSoulContract);
  return {
    changed: merged.changed,
    content: merged.content,
    status: merged.changed ? 'added' : 'kept-unknown',
  };
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const agentsPath = path.join(options.workspace, 'AGENTS.md');
  const soulPath = path.join(options.workspace, 'SOUL.md');
  const canonicalRootPath = resolveCanonicalRootPath(options.workspace, options.canonicalRootName);

  const agentsContent = readTextFile(agentsPath);
  const soulContent = readTextFile(soulPath);

  const agentsResult = mergeSection(
    agentsContent,
    buildAgentsContract(),
    detectAgentsContract,
  );
  const soulResult = mergeSoulSection(
    soulContent,
    buildSoulContract(),
  );

  writeFile(agentsPath, agentsResult.content);
  writeFile(soulPath, soulResult.content);

  if (options.createMemoryRoot) {
    fs.mkdirSync(canonicalRootPath, { recursive: true });
  }

  const updates = [
    `${agentsResult.changed ? 'updated' : 'kept'} ${agentsPath}`,
    `${soulResult.status === 'upgraded-legacy' ? 'upgraded' : soulResult.changed ? 'updated' : 'kept'} ${soulPath}`,
    `${options.createMemoryRoot ? 'ensured' : 'skipped'} ${canonicalRootPath}`,
  ];

  console.log(updates.join('\n'));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
