import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function resolveOpenClawBin() {
  if (process.env.OPENCLAW_BIN?.trim()) return process.env.OPENCLAW_BIN.trim();

  const whichResult = spawnSync('/bin/zsh', ['-lc', 'command -v openclaw'], {
    encoding: 'utf8',
  });
  const resolved = whichResult.status === 0 ? whichResult.stdout.trim() : '';
  if (resolved) return resolved;

  const homeCandidate = path.join(os.homedir(), '.nvm', 'versions', 'node', 'v24.9.0', 'bin', 'openclaw');
  if (fs.existsSync(homeCandidate)) return homeCandidate;

  throw new Error(
    [
      '无法定位 openclaw 可执行文件。',
      '请先确认 openclaw 已安装，或在执行前显式设置 OPENCLAW_BIN。',
      '例如：OPENCLAW_BIN=/Users/zangtao/.nvm/versions/node/v24.9.0/bin/openclaw npm run test:live-experience',
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
      ...process.env,
      OPENCLAW_LIVE_E2E: '1',
      OPENCLAW_BIN: openClawBin,
    },
  },
);

process.exit(result.status ?? 1);
