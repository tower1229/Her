#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  detectAgentsContract,
  detectSoulContract,
  normalizeRootName,
  resolveCanonicalRootPath,
} from './workspace-contract.mjs';

function parseArgs(argv) {
  const options = {
    workspace: path.resolve(process.cwd()),
    canonicalRootName: 'memory',
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
    'Usage: openclaw-timeline-doctor [--workspace <dir>] [--canonical-root-name <name>]',
    '',
    'Checks whether the required Timeline workspace contracts are present.',
  ].join('\n'));
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function check(label, passed, successDetail, failureDetail) {
  const prefix = passed ? '[ok]' : '[missing]';
  console.log(`${prefix} ${label}: ${passed ? successDetail : failureDetail}`);
  return passed;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const agentsPath = path.join(options.workspace, 'AGENTS.md');
  const soulPath = path.join(options.workspace, 'SOUL.md');
  const canonicalRootPath = resolveCanonicalRootPath(options.workspace, options.canonicalRootName);

  const agentsContent = readText(agentsPath);
  const soulContent = readText(soulPath);

  let ok = true;
  ok = check(
    'AGENTS contract',
    fs.existsSync(agentsPath) && detectAgentsContract(agentsContent, options.canonicalRootName),
    agentsPath,
    `${agentsPath} is missing the Timeline daily-log contract`,
  ) && ok;
  ok = check(
    'SOUL contract',
    fs.existsSync(soulPath) && detectSoulContract(soulContent),
    soulPath,
    `${soulPath} is missing the Timeline recall contract`,
  ) && ok;
  ok = check(
    'Canonical memory root',
    fs.existsSync(canonicalRootPath),
    canonicalRootPath,
    `${canonicalRootPath} does not exist`,
  ) && ok;

  if (!ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
