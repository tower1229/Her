import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

describe('workspace setup heartbeat contract', () => {
  const tmpDir = path.join(__dirname, '__workspace_setup_tmp__');
  const scriptPath = path.resolve(__dirname, '../../scripts/setup-openclaw-workspace.mjs');
  const doctorPath = path.resolve(__dirname, '../../scripts/doctor-openclaw-workspace.mjs');
  const openClawHome = path.join(tmpDir, '.openclaw');
  const defaultWorkspaceDir = path.join(openClawHome, 'workspace');
  const openClawConfigPath = path.join(openClawHome, 'openclaw.json');

  beforeEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(openClawHome, { recursive: true });
    fs.writeFileSync(openClawConfigPath, JSON.stringify({
      agents: {
        defaults: {},
      },
      plugins: {
        entries: {},
      },
    }, null, 2), 'utf8');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not create HEARTBEAT.md unless explicitly requested', () => {
    execFileSync(process.execPath, [scriptPath, '--workspace', tmpDir], {
      stdio: 'pipe',
      env: { ...process.env, OPENCLAW_HOME: openClawHome },
    });

    expect(fs.existsSync(path.join(tmpDir, 'HEARTBEAT.md'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'memory', 'engagement_state.json'))).toBe(false);
  });

  it('creates HEARTBEAT.md idempotently when opted in and includes the canonical root', () => {
    execFileSync(process.execPath, [scriptPath, '--workspace', tmpDir, '--with-heartbeat'], {
      stdio: 'pipe',
      env: { ...process.env, OPENCLAW_HOME: openClawHome },
    });
    execFileSync(process.execPath, [scriptPath, '--workspace', tmpDir, '--with-heartbeat'], {
      stdio: 'pipe',
      env: { ...process.env, OPENCLAW_HOME: openClawHome },
    });

    const heartbeat = fs.readFileSync(path.join(tmpDir, 'HEARTBEAT.md'), 'utf8');
    const engagementState = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'memory', 'engagement_state.json'), 'utf8'),
    );
    expect(heartbeat).toContain('## Proactive Greeting Heartbeat');
    expect(heartbeat).toContain('memory/engagement_state.json');
    expect(heartbeat.match(/## Proactive Greeting Heartbeat/g)).toHaveLength(1);
    expect(engagementState).toEqual(expect.objectContaining({
      schema_version: '1.0',
      state_revision: 0,
      proactive_greeting_enabled: true,
    }));
  });

  it('treats heartbeat bootstrap as optional unless explicitly required', () => {
    execFileSync(process.execPath, [scriptPath, '--workspace', tmpDir], {
      stdio: 'pipe',
      env: { ...process.env, OPENCLAW_HOME: openClawHome },
    });

    expect(() => {
      execFileSync(process.execPath, [doctorPath, '--workspace', tmpDir], {
        stdio: 'pipe',
        env: { ...process.env, OPENCLAW_HOME: openClawHome },
      });
    }).not.toThrow();

    expect(() => {
      execFileSync(process.execPath, [doctorPath, '--workspace', tmpDir, '--require-heartbeat'], {
        stdio: 'pipe',
        env: { ...process.env, OPENCLAW_HOME: openClawHome },
      });
    }).toThrow();
  });

  it('auto-configures the default OpenClaw workspace for proactive greeting', () => {
    execFileSync(process.execPath, [scriptPath, '--workspace', defaultWorkspaceDir], {
      stdio: 'pipe',
      env: { ...process.env, OPENCLAW_HOME: openClawHome },
    });

    const heartbeat = fs.readFileSync(path.join(defaultWorkspaceDir, 'HEARTBEAT.md'), 'utf8');
    const config = JSON.parse(fs.readFileSync(openClawConfigPath, 'utf8'));
    const engagementState = JSON.parse(
      fs.readFileSync(path.join(defaultWorkspaceDir, 'memory', 'engagement_state.json'), 'utf8'),
    );

    expect(heartbeat).toContain('## Proactive Greeting Heartbeat');
    expect(engagementState.proactive_greeting_enabled).toBe(true);
    expect(config.agents.defaults.workspace).toBe(defaultWorkspaceDir);
    expect(config.agents.defaults.heartbeat).toEqual(expect.objectContaining({
      every: '30m',
      target: 'last',
      session: 'proactive-greeting',
      isolatedSession: true,
      lightContext: true,
    }));
    expect(config.plugins.entries['stella-timeline-plugin']).toEqual(expect.objectContaining({
      enabled: true,
    }));
    expect(config.plugins.entries['stella-timeline-plugin'].config.proactiveGreeting).toEqual(expect.objectContaining({
      enabled: true,
      sessionKey: 'proactive-greeting',
      singleUserGuard: true,
    }));
  });

  it('passes doctor --require-heartbeat after heartbeat bootstrap is initialized', () => {
    execFileSync(process.execPath, [scriptPath, '--workspace', tmpDir, '--with-heartbeat'], {
      stdio: 'pipe',
      env: { ...process.env, OPENCLAW_HOME: openClawHome },
    });

    expect(() => {
      execFileSync(process.execPath, [doctorPath, '--workspace', tmpDir, '--require-heartbeat'], {
        stdio: 'pipe',
        env: { ...process.env, OPENCLAW_HOME: openClawHome },
      });
    }).not.toThrow();
  });
});
