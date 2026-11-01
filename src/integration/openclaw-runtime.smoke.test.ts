import * as path from 'path';
import { execFileSync } from 'child_process';

// Unit runs opt out; releases/CI always run the same mandatory standalone probe.
// An explicitly enabled smoke must fail if its host or Node is unavailable.
const describeIfSmoke = process.env.OPENCLAW_RUNTIME_SMOKE === '1' ? describe : describe.skip;
describeIfSmoke('OpenClaw fixed-host runtime smoke', () => {
  it('loads the publication tarball, gates hooks and recalls the shared daily log', () => {
    const root = path.resolve(__dirname, '../..');
    const output = execFileSync(process.env.OPENCLAW_NODE_BIN || process.execPath, [path.join(root, 'scripts/run-openclaw-smoke.mjs')], {
      cwd: root, encoding: 'utf8', timeout: 150000, maxBuffer: 4 * 1024 * 1024,
    });
    expect(output).toContain('"host":"2026.10.9"');
    expect(output).toContain('"hookPolicyGates":"passed"');
    expect(output).toContain('passed (real default memory_search, lexical mode)');
  }, 160000);
});
