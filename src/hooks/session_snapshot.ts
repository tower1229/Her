import { HookSpec } from '../plugin-spec';

export const sessionSnapshotHook: HookSpec = {
  name: 'timeline_session_snapshot',
  description:
    'Lifecycle hook placeholder for recording timeline trace snapshots at stable session boundaries.',
  event: 'session_snapshot',
};
