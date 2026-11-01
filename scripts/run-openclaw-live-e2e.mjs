// Stable npm entry for the isolated README acceptance suite.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const result = spawnSync(
  process.env.OPENCLAW_NODE_BIN || process.execPath,
  [fileURLToPath(new URL('./verify-openclaw-live.mjs', import.meta.url))],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      OPENCLAW_LIVE_MODEL: process.env.OPENCLAW_LIVE_MODEL || 'google/gemini-3.8-flash',
      HER_LIVE_SCENARIOS: fileURLToPath(new URL('./readme-live-scenarios.mjs', import.meta.url)),
      HER_LIVE_REPORT: process.env.HER_LIVE_REPORT || fileURLToPath(new URL('../.timeline-cache/live-experience-results.json', import.meta.url)),
    },
  },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
