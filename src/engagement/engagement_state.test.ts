import * as fs from 'fs';
import * as path from 'path';
import {
  createDefaultEngagementState,
  loadEngagementState,
  resolveEngagementStatePath,
  updateEngagementState,
} from './engagement_state';

describe('engagement_state', () => {
  const tmpDir = path.join(__dirname, '__engagement_state_tmp__');
  const statePath = resolveEngagementStatePath(tmpDir);

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when the file is missing', () => {
    const state = loadEngagementState(statePath);
    expect(state.schema_version).toBe('1.0');
    expect(state.state_revision).toBe(0);
    expect(state.pending_proactive_send).toBe(false);
  });

  it('fills missing fields and recovers from malformed json via backup', () => {
    fs.writeFileSync(
      `${statePath}.bak`,
      JSON.stringify({
        schema_version: '1.0',
        state_revision: 4,
        last_user_message_at: '2026-04-03T00:00:00.000Z',
      }),
      'utf8',
    );
    fs.writeFileSync(statePath, '{not valid json', 'utf8');

    const state = loadEngagementState(statePath);
    expect(state.state_revision).toBe(4);
    expect(state.last_user_message_at).toBe('2026-04-03T00:00:00.000Z');
    expect(state.recent_inbound_dedupe_keys).toEqual([]);
  });

  it('writes atomically and increments the revision', async () => {
    const committed = await updateEngagementState(statePath, {}, (current) => ({
      ...current,
      last_user_message_at: '2026-04-03T00:00:00.000Z',
      pending_proactive_send: true,
      pending_proactive_send_started_at: '2026-04-03T00:00:00.000Z',
    }));

    expect(committed.state_revision).toBe(1);

    const reread = loadEngagementState(statePath);
    expect(reread.state_revision).toBe(1);
    expect(reread.pending_proactive_send).toBe(true);
    expect(fs.existsSync(`${statePath}.tmp`)).toBe(false);
  });

  it('preserves default timezone fallback when raw state is empty', async () => {
    await updateEngagementState(statePath, {}, (_current) => createDefaultEngagementState({}));
    const reread = loadEngagementState(statePath, {});
    expect(typeof reread.user_timezone).toBe('string');
  });
});
