#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');
const pluginManifestPath = path.join(repoRoot, 'openclaw.plugin.json');
const pluginMetadataPath = path.join(repoRoot, 'src', 'plugin_metadata.ts');
const releaseTempDir = process.platform === 'win32' ? os.tmpdir() : '/tmp';

function parseArgs(argv) {
  const options = {
    npmTag: 'latest',
    publish: false,
    gitTag: true,
    commit: true,
    push: false,
    allowDirty: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--npm-tag') {
      options.npmTag = argv[++i] || 'latest';
      continue;
    }
    if (arg === '--publish') {
      options.publish = true;
      continue;
    }
    if (arg === '--no-git-tag') {
      options.gitTag = false;
      continue;
    }
    if (arg === '--no-commit') {
      options.commit = false;
      continue;
    }
    if (arg === '--push') {
      options.push = true;
      continue;
    }
    if (arg === '--allow-dirty') {
      options.allowDirty = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.push && !options.commit) {
    throw new Error('--push requires commits to be enabled');
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage: npm run release -- [--npm-tag <tag>] [--publish] [--push]',
    '',
    'Reads package name and version from package.json, verifies the release, optionally publishes to npm, and can create/push the git tag.',
  ].join('\n'));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, extra = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_cache: path.join(releaseTempDir, 'stella-timeline-plugin-npm-cache'),
      TMPDIR: releaseTempDir,
      TMP: releaseTempDir,
      TEMP: releaseTempDir,
      ...extra.env,
    },
    ...extra,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `Command failed: ${command}`);
  }
  return result.stdout.trim();
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function gitStatusDirty() {
  return runCapture('git', ['status', '--porcelain']).trim().length > 0;
}

function updatePluginMetadata(content, version) {
  return content.replace(
    /export const TIMELINE_PLUGIN_VERSION = '.*?';/,
    `export const TIMELINE_PLUGIN_VERSION = '${version}';`,
  );
}

function validatePackageMetadata(packageJson) {
  const version = String(packageJson.version || '').trim();
  const packageName = String(packageJson.name || '').trim();

  if (!packageName) {
    throw new Error('package.json is missing a package name');
  }
  if (!version) {
    throw new Error('package.json is missing a version');
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`package.json has an invalid semver version: ${version}`);
  }

  return { version, packageName };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.allowDirty && gitStatusDirty()) {
    throw new Error('Working tree is not clean. Commit or stash changes first, or rerun with --allow-dirty.');
  }

  const originalFiles = new Map([
    [packageJsonPath, readText(packageJsonPath)],
    [packageLockPath, readText(packageLockPath)],
    [pluginManifestPath, readText(pluginManifestPath)],
    [pluginMetadataPath, readText(pluginMetadataPath)],
  ]);

  try {
    const packageJson = readJson(packageJsonPath);
    const packageLock = readJson(packageLockPath);
    const pluginManifest = readJson(pluginManifestPath);
    const { version, packageName } = validatePackageMetadata(packageJson);

    packageLock.version = version;
    packageLock.name = packageName;
    if (packageLock.packages && packageLock.packages['']) {
      packageLock.packages[''].version = version;
      packageLock.packages[''].name = packageName;
    }

    pluginManifest.version = version;

    writeJson(packageLockPath, packageLock);
    writeJson(pluginManifestPath, pluginManifest);
    writeText(pluginMetadataPath, updatePluginMetadata(readText(pluginMetadataPath), version));

    run(npmCommand(), ['run', 'verify']);
    run(npmCommand(), ['pack', '--dry-run']);

    if (options.publish) {
      const publishArgs = ['publish', '--tag', options.npmTag];
      if (packageName.startsWith('@')) {
        publishArgs.push('--access', 'public');
      }
      run(npmCommand(), publishArgs);
    }

    if (options.commit) {
      run('git', ['add', 'package.json', 'package-lock.json', 'openclaw.plugin.json', 'src/plugin_metadata.ts']);
      run('git', ['commit', '-m', `release: ${version}`]);
    }

    if (options.gitTag) {
      run('git', ['tag', `v${version}`]);
    }

    if (options.push) {
      run('git', ['push']);
      if (options.gitTag) {
        run('git', ['push', '--tags']);
      }
    }
  } catch (error) {
    for (const [filePath, content] of originalFiles.entries()) {
      writeText(filePath, content);
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
