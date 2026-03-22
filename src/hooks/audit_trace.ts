import { HookSpec } from '../plugin-spec';

export const auditTraceHook: HookSpec = {
  name: 'timeline_audit_trace',
  description:
    'Lifecycle hook placeholder for persisting timeline tool invocation trace summaries.',
  event: 'audit_trace',
};
