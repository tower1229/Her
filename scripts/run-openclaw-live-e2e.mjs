import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runtimeTempDir = process.platform === 'win32' ? os.tmpdir() : '/tmp';

function withRuntimeTemp(env = process.env) {
  return {
    ...env,
    TMPDIR: runtimeTempDir,
    TMP: runtimeTempDir,
    TEMP: runtimeTempDir,
  };
}

function resolveOnPath(binaryName) {
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, [binaryName], {
    encoding: 'utf8',
    env: withRuntimeTemp(),
  });
  if (result.status !== 0) return '';
  const firstLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine || '';
}

function resolveOpenClawBin() {
  if (process.env.OPENCLAW_BIN?.trim()) return process.env.OPENCLAW_BIN.trim();

  const resolved = resolveOnPath('openclaw');
  if (resolved) return resolved;

  const homeCandidate = path.join(os.homedir(), '.nvm', 'versions', 'node', 'v24.9.0', 'bin', 'openclaw');
  if (fs.existsSync(homeCandidate)) return homeCandidate;

  throw new Error(
    [
      'Could not locate the openclaw executable.',
      'Make sure openclaw is installed, or set OPENCLAW_BIN explicitly before running.',
      'Example: OPENCLAW_BIN=/Users/zangtao/.nvm/versions/node/v24.9.0/bin/openclaw npm run test:live-experience',
    ].join('\n'),
  );
}

const openClawBin = resolveOpenClawBin();

const result = spawnSync(
  process.execPath,
  ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', 'src/integration/openclaw-live-experience.e2e.test.ts'],
  {
    stdio: 'inherit',
    env: {
      ...withRuntimeTemp(),
      OPENCLAW_LIVE_E2E: '1',
      OPENCLAW_BIN: openClawBin,
    },
  },
);

process.exit(result.status ?? 1);
