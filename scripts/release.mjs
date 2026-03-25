#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(command, args) {
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: useShell,
    env: { ...process.env },
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
    'Uses the npm credentials from your local npm login (~/.npmrc).',
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
