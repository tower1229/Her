#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homeDir = os.homedir();
const defaultExtensionDir = path.join(homeDir, '.openclaw', 'extensions', 'stella-timeline-plugin');
const defaultWorkspaceDir = path.join(homeDir, '.openclaw', 'workspace');
const defaultWorkspaceSkillDir = path.join(defaultWorkspaceDir, 'skills', 'timeline');
const defaultConfigPath = path.join(homeDir, '.openclaw', 'openclaw.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
    shell: options.shell ?? false,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function syncPluginVersion() {
  const pkgPath = path.join(repoRoot, 'package.json');
  const pluginManifestPath = path.join(repoRoot, 'openclaw.plugin.json');
  const metadataPath = path.join(repoRoot, 'src', 'plugin_metadata.ts');
  const pkg = readJson(pkgPath);
  const version = String(pkg.version);

  const pluginManifest = readJson(pluginManifestPath);
  if (pluginManifest.version !== version) {
    pluginManifest.version = version;
    writeJson(pluginManifestPath, pluginManifest);
  }

  const metadataSource = fs.readFileSync(metadataPath, 'utf8');
  const versionDeclRegex = /export const TIMELINE_PLUGIN_VERSION\s*=\s*'[^']*';/;
  if (!versionDeclRegex.test(metadataSource)) {
    throw new Error(`Unable to sync TIMELINE_PLUGIN_VERSION in ${metadataPath}`);
  }
  const updatedSource = metadataSource.replace(
    versionDeclRegex,
    `export const TIMELINE_PLUGIN_VERSION = '${version}';`,
  );
  if (updatedSource !== metadataSource) {
    fs.writeFileSync(metadataPath, updatedSource, 'utf8');
  }

  return version;
}

function shouldExclude(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  if (!normalized) return false;
  const topLevel = normalized.split('/')[0];
  return topLevel === '.git' || topLevel === 'node_modules';
}

function copyTree(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    const relativePath = path.relative(repoRoot, sourcePath);
    if (shouldExclude(relativePath)) {
      continue;
    }
    if (entry.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      copyTree(sourcePath, targetPath);
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const targetPath = path.join(targetDir, entry.name);
    const sourcePath = path.join(sourceDir, entry.name);
    const relativePath = path.relative(repoRoot, sourcePath);
    if (shouldExclude(relativePath)) continue;
    if (!fs.existsSync(sourcePath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  }
}

function backupDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return null;
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backupPath = `${dirPath}.backup-${timestamp}`;
  fs.cpSync(dirPath, backupPath, { recursive: true });
  return backupPath;
}

function applySafePermissions(rootDir, topMode) {
  if (!fs.existsSync(rootDir)) return;
  fs.chmodSync(rootDir, topMode);
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        fs.chmodSync(fullPath, 0o755);
        stack.push(fullPath);
      } else if (entry.isFile()) {
        fs.chmodSync(fullPath, 0o644);
      }
    }
  }
  fs.chmodSync(rootDir, topMode);
}

function syncWorkspaceSkill(extensionDir, workspaceSkillDir) {
  const sourceSkillDir = path.join(extensionDir, 'skills', 'timeline-skill');
  fs.rmSync(workspaceSkillDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(workspaceSkillDir), { recursive: true });
  fs.cpSync(sourceSkillDir, workspaceSkillDir, { recursive: true });
}

function updateInstallMetadata(configPath, extensionDir, version) {
  if (!fs.existsSync(configPath)) {
    return;
  }
  const config = readJson(configPath);
  if (!config.plugins) config.plugins = {};
  if (!config.plugins.installs) config.plugins.installs = {};
  const current = config.plugins.installs['stella-timeline-plugin'] || {};
  config.plugins.installs['stella-timeline-plugin'] = {
    ...current,
    source: 'path',
    sourcePath: extensionDir,
    installPath: extensionDir,
    version,
    installedAt: new Date().toISOString(),
  };
  writeJson(configPath, config);
}

function printHelp() {
  console.log([
    'Usage: npm run sync:local-openclaw -- [--no-build] [--no-backup] [--workspace <dir>] [--extension-dir <dir>]',
    '',
    'Builds the plugin, syncs it into the local WSL OpenClaw extension directory,',
    'updates the workspace timeline-skill skill and SOUL/AGENTS contracts, and tightens permissions.',
  ].join('\n'));
}

function parseArgs(argv) {
  const options = {
    build: true,
    backup: true,
    extensionDir: defaultExtensionDir,
    workspaceDir: defaultWorkspaceDir,
    configPath: defaultConfigPath,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-build') {
      options.build = false;
      continue;
    }
    if (arg === '--no-backup') {
      options.backup = false;
      continue;
    }
    if (arg === '--workspace') {
      options.workspaceDir = path.resolve(argv[++index] || '');
      continue;
    }
    if (arg === '--extension-dir') {
      options.extensionDir = path.resolve(argv[++index] || '');
      continue;
    }
    if (arg === '--config') {
      options.configPath = path.resolve(argv[++index] || '');
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  const version = syncPluginVersion();
  const workspaceSkillDir = path.join(options.workspaceDir, 'skills', 'timeline-skill');

  if (options.build) {
    run(npmCommand(), ['run', 'build']);
  }

  let backupPath = null;
  if (options.backup) {
    backupPath = backupDirectory(options.extensionDir);
  }

  copyTree(repoRoot, options.extensionDir);
  syncWorkspaceSkill(options.extensionDir, workspaceSkillDir);
  run(process.execPath, ['scripts/setup-openclaw-workspace.mjs', '--workspace', options.workspaceDir]);
  updateInstallMetadata(options.configPath, options.extensionDir, version);
  applySafePermissions(options.extensionDir, 0o700);
  applySafePermissions(workspaceSkillDir, 0o700);

  console.log([
    `Synced stella-timeline-plugin ${version} to ${options.extensionDir}`,
    `Workspace updated: ${options.workspaceDir}`,
    `Backup: ${backupPath || 'skipped'}`,
    'Permissions: extension root 700, nested dirs 755, files 644',
  ].join('\n'));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
