#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAgentsContract,
  buildSoulContract,
  detectAgentsContract,
  detectSoulContract,
  normalizeRootName,
  resolveCanonicalRootPath,
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
    buildAgentsContract(options.canonicalRootName),
    (content) => detectAgentsContract(content, options.canonicalRootName),
  );
  const soulResult = mergeSection(
    soulContent,
    buildSoulContract(),
    detectSoulContract,
  );

  writeFile(agentsPath, agentsResult.content);
  writeFile(soulPath, soulResult.content);

  if (options.createMemoryRoot) {
    fs.mkdirSync(canonicalRootPath, { recursive: true });
  }

  const updates = [
    `${agentsResult.changed ? 'updated' : 'kept'} ${agentsPath}`,
    `${soulResult.changed ? 'updated' : 'kept'} ${soulPath}`,
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
