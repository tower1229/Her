import { spawnSync } from 'node:child_process';
import os from 'node:os';

const runtimeTempDir = process.platform === 'win32' ? os.tmpdir() : '/tmp';

const result = spawnSync(
  process.execPath,
  ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', 'src/integration/openclaw-runtime.smoke.test.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      TMPDIR: runtimeTempDir,
      TMP: runtimeTempDir,
      TEMP: runtimeTempDir,
      OPENCLAW_RUNTIME_SMOKE: '1',
    },
  },
);

process.exit(result.status ?? 1);
