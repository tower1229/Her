#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeTempDir = process.platform === 'win32' ? os.tmpdir() : '/tmp';
const npmrcPath = path.join(repoRoot, '.npmrc');

function readDotEnv() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) return {};

  const env = {};
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) {
      env[key] = value;
    }
  }

  return env;
}

const dotEnv = readDotEnv();

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(command, args) {
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: useShell,
    env: {
      ...process.env,
      ...dotEnv,
      NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || dotEnv.NODE_AUTH_TOKEN || dotEnv.NPM_TOKEN,
      NPM_TOKEN: process.env.NPM_TOKEN || dotEnv.NPM_TOKEN || dotEnv.NODE_AUTH_TOKEN,
      NPM_CONFIG_USERCONFIG: npmrcPath,
      npm_config_cache: path.join(runtimeTempDir, 'stella-timeline-plugin-npm-cache'),
      TMPDIR: runtimeTempDir,
      TMP: runtimeTempDir,
      TEMP: runtimeTempDir,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function printHelp() {
  console.log([
    'Usage: npm run release -- [npm publish args]',
    '',
    'Runs verify, then publishes the current package to npm.',
    'Reads NPM_TOKEN/NODE_AUTH_TOKEN from the project .env when present.',
    'Examples:',
    '  npm run release',
    '  npm run release -- --tag next',
    '  npm run release -- --dry-run',
  ].join('\n'));
}

function main() {
  const publishArgs = process.argv.slice(2);
  if (publishArgs.includes('--help') || publishArgs.includes('-h')) {
    printHelp();
    return;
  }

  run(npmCommand(), ['run', 'verify']);
  run(npmCommand(), ['publish', ...publishArgs]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
