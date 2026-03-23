import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.execPath,
  ['node_modules/jest/bin/jest.js', '--runInBand', '--runTestsByPath', 'src/integration/openclaw-runtime.smoke.test.ts'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENCLAW_RUNTIME_SMOKE: '1',
    },
  },
);

process.exit(result.status ?? 1);
