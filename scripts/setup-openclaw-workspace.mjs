#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildAgentsContract,
  buildHeartbeatContract,
  buildSoulContract,
  detectAgentsContract,
  detectHeartbeatContract,
  detectCurrentSoulContract,
  detectLegacySoulContract,
  detectSoulContract,
  LEGACY_SOUL_SECTION_TITLE_V1,
  LEGACY_SOUL_SECTION_TITLE_V2,
  normalizeRootName,
  resolveCanonicalRootPath,
  SOUL_SECTION_TITLE,
} from './workspace-contract.mjs';

const TIMELINE_PLUGIN_ID = 'stella-timeline-plugin';
const PROACTIVE_SESSION_KEY = 'proactive-greeting';

function defaultOpenClawHome() {
  const envHome = process.env.OPENCLAW_HOME;
  if (typeof envHome === 'string' && envHome.trim()) {
    return path.resolve(envHome);
  }
  return path.join(os.homedir(), '.openclaw');
}

function parseArgs(argv) {
  const options = {
    workspace: path.resolve(process.cwd()),
    canonicalRootName: 'memory',
    createMemoryRoot: true,
    withHeartbeat: null,
    configureOpenClaw: null,
    openClawConfigPath: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace') {
      options.workspace = path.resolve(argv[++i] || '');
      continue;
    }
    if (arg === '--canonical-root-name') {
      options.canonicalRootName = normalizeRootName(argv[++i] || '');
      continue;
    }
    if (arg === '--no-create-memory-root') {
      options.createMemoryRoot = false;
      continue;
    }
    if (arg === '--with-heartbeat') {
      options.withHeartbeat = true;
      continue;
    }
    if (arg === '--no-heartbeat') {
      options.withHeartbeat = false;
      continue;
    }
    if (arg === '--configure-openclaw') {
      options.configureOpenClaw = true;
      continue;
    }
    if (arg === '--no-configure-openclaw') {
      options.configureOpenClaw = false;
      continue;
    }
    if (arg === '--openclaw-config') {
      options.openClawConfigPath = path.resolve(argv[++i] || '');
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage: openclaw-timeline-setup [--workspace <dir>] [--canonical-root-name <name>] [--no-create-memory-root] [--with-heartbeat|--no-heartbeat] [--configure-openclaw|--no-configure-openclaw] [--openclaw-config <path>]',
    '',
    'Idempotently appends the required Timeline contract blocks to AGENTS.md and SOUL.md.',
    'When the target workspace matches your OpenClaw workspace, setup also enables proactive greeting in openclaw.json by default.',
  ].join('\n'));
}

function readTextFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function ensureTrailingNewline(content) {
  if (!content) return '';
  return content.endsWith('\n') ? content : `${content}\n`;
}

function mergeSection(existingContent, sectionContent, predicate) {
  if (predicate(existingContent)) {
    return { changed: false, content: ensureTrailingNewline(existingContent) };
  }

  const prefix = existingContent.trimEnd();
  const merged = prefix
    ? `${prefix}\n\n${sectionContent}\n`
    : `${sectionContent}\n`;
  return { changed: true, content: merged };
}

function replaceSectionByTitle(existingContent, sectionTitles, sectionContent) {
  const normalized = ensureTrailingNewline(existingContent);
  for (const title of sectionTitles) {
    const start = normalized.indexOf(title);
    if (start === -1) continue;
    const nextSectionMatch = normalized.slice(start + title.length).match(/\n##\s+/);
    const end = nextSectionMatch
      ? start + title.length + nextSectionMatch.index + 1
      : normalized.length;
    const replaced = `${normalized.slice(0, start).trimEnd()}\n\n${sectionContent}\n${normalized.slice(end).replace(/^\s+/, '')}`;
    return { changed: true, content: ensureTrailingNewline(replaced).replace(/^\n+/, '') };
  }
  return null;
}

function mergeSoulSection(existingContent, sectionContent) {
  if (detectCurrentSoulContract(existingContent)) {
    return { changed: false, content: ensureTrailingNewline(existingContent), status: 'kept-current' };
  }
  if (detectLegacySoulContract(existingContent)) {
    const replaced = replaceSectionByTitle(
      existingContent,
      [SOUL_SECTION_TITLE, LEGACY_SOUL_SECTION_TITLE_V1, LEGACY_SOUL_SECTION_TITLE_V2],
      sectionContent,
    );
    if (replaced) {
      return { changed: true, content: replaced.content, status: 'upgraded-legacy' };
    }
  }
  const merged = mergeSection(existingContent, sectionContent, detectSoulContract);
  return {
    changed: merged.changed,
    content: merged.content,
    status: merged.changed ? 'added' : 'kept-unknown',
  };
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createJsonSnapshot(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizePath(value) {
  return path.resolve(value);
}

function shouldConfigureOpenClaw(options, config, fallbackWorkspacePath) {
  if (typeof options.configureOpenClaw === 'boolean') {
    return options.configureOpenClaw;
  }
  const workspace = normalizePath(options.workspace);
  if (workspace === fallbackWorkspacePath) {
    return true;
  }
  const configuredWorkspace = readString(
    ((config?.agents ?? {}).defaults ?? {}).workspace,
  );
  return configuredWorkspace ? workspace === normalizePath(configuredWorkspace) : false;
}

function patchOpenClawConfig(config, workspace) {
  const next = JSON.parse(JSON.stringify(config ?? {}));
  next.agents ??= {};
  next.agents.defaults ??= {};
  next.agents.defaults.workspace = workspace;
  next.agents.defaults.heartbeat = {
    ...(next.agents.defaults.heartbeat ?? {}),
    every: '30m',
    target: 'last',
    session: PROACTIVE_SESSION_KEY,
    isolatedSession: true,
    lightContext: true,
  };
  next.plugins ??= {};
  next.plugins.entries ??= {};
  next.plugins.entries[TIMELINE_PLUGIN_ID] ??= { enabled: true, config: {} };
  next.plugins.entries[TIMELINE_PLUGIN_ID].enabled = true;
  next.plugins.entries[TIMELINE_PLUGIN_ID].config ??= {};
  next.plugins.entries[TIMELINE_PLUGIN_ID].config.proactiveGreeting = {
    ...(next.plugins.entries[TIMELINE_PLUGIN_ID].config.proactiveGreeting ?? {}),
    enabled: true,
    sessionKey: PROACTIVE_SESSION_KEY,
    singleUserGuard: true,
  };
  return next;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const openClawHome = defaultOpenClawHome();
  const defaultWorkspacePath = normalizePath(path.join(openClawHome, 'workspace'));
  const openClawConfigPath = options.openClawConfigPath
    ? normalizePath(options.openClawConfigPath)
    : normalizePath(path.join(openClawHome, 'openclaw.json'));
  const existingConfig = readJsonFile(openClawConfigPath);
  const configureOpenClaw = shouldConfigureOpenClaw(options, existingConfig, defaultWorkspacePath);
  const writeHeartbeat = typeof options.withHeartbeat === 'boolean'
    ? options.withHeartbeat
    : configureOpenClaw;
  const agentsPath = path.join(options.workspace, 'AGENTS.md');
  const soulPath = path.join(options.workspace, 'SOUL.md');
  const heartbeatPath = path.join(options.workspace, 'HEARTBEAT.md');
  const canonicalRootPath = resolveCanonicalRootPath(options.workspace, options.canonicalRootName);

  const agentsContent = readTextFile(agentsPath);
  const soulContent = readTextFile(soulPath);
  const heartbeatContent = writeHeartbeat ? readTextFile(heartbeatPath) : '';

  const agentsResult = mergeSection(
    agentsContent,
    buildAgentsContract(),
    detectAgentsContract,
  );
  const soulResult = mergeSoulSection(
    soulContent,
    buildSoulContract(),
  );
  const heartbeatResult = writeHeartbeat
    ? mergeSection(
      heartbeatContent,
      buildHeartbeatContract(options.canonicalRootName),
      detectHeartbeatContract,
    )
    : null;

  writeFile(agentsPath, agentsResult.content);
  writeFile(soulPath, soulResult.content);
  if (heartbeatResult) {
    writeFile(heartbeatPath, heartbeatResult.content);
  }

  if (options.createMemoryRoot) {
    fs.mkdirSync(canonicalRootPath, { recursive: true });
  }

  let configResult = `skipped OpenClaw config wiring ${openClawConfigPath}`;
  if (configureOpenClaw) {
    if (!existingConfig) {
      configResult = `skipped OpenClaw config wiring ${openClawConfigPath} (file not found)`;
    } else {
      const patchedConfig = patchOpenClawConfig(existingConfig, normalizePath(options.workspace));
      const before = createJsonSnapshot(existingConfig);
      const after = createJsonSnapshot(patchedConfig);
      if (before !== after) {
        writeFile(openClawConfigPath, after);
        configResult = `updated OpenClaw config ${openClawConfigPath}`;
      } else {
        configResult = `kept OpenClaw config ${openClawConfigPath}`;
      }
    }
  }

  const updates = [
    `${agentsResult.changed ? 'updated' : 'kept'} ${agentsPath}`,
    `${soulResult.status === 'upgraded-legacy' ? 'upgraded' : soulResult.changed ? 'updated' : 'kept'} ${soulPath}`,
    heartbeatResult
      ? `${heartbeatResult.changed ? 'updated' : 'kept'} ${heartbeatPath}`
      : `skipped optional heartbeat contract ${heartbeatPath}`,
    `${options.createMemoryRoot ? 'ensured' : 'skipped'} ${canonicalRootPath}`,
    configResult,
  ];

  console.log(updates.join('\n'));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
