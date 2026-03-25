#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function syncPluginVersion() {
  const pkgPath = path.join(repoRoot, 'package.json');
  const pluginManifestPath = path.join(repoRoot, 'openclaw.plugin.json');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const pluginManifest = JSON.parse(fs.readFileSync(pluginManifestPath, 'utf8'));

  if (pluginManifest.version !== pkg.version) {
    pluginManifest.version = pkg.version;
    fs.writeFileSync(pluginManifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`, 'utf8');
  }
}

function syncPluginMetadataVersion() {
  const pkgPath = path.join(repoRoot, 'package.json');
  const metadataPath = path.join(repoRoot, 'src', 'plugin_metadata.ts');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const metadataSource = fs.readFileSync(metadataPath, 'utf8');
  const nextVersion = String(pkg.version);

  const updatedSource = metadataSource.replace(
    /export const TIMELINE_PLUGIN_VERSION\s*=\s*'[^']*';/,
    `export const TIMELINE_PLUGIN_VERSION = '${nextVersion}';`,
  );

  // If the regex doesn't match, don't silently proceed with a wrong release.
  if (updatedSource === metadataSource) {
    throw new Error(`Unable to sync TIMELINE_PLUGIN_VERSION in ${metadataPath}`);
  }

  fs.writeFileSync(metadataPath, `${updatedSource}\n`, 'utf8');
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(command, args) {
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: useShell,
    env: { ...process.env },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function printHelp() {
  console.log([
    'Usage: npm run release -- [npm publish args]',
    '',
    'Runs verify, then publishes the current package to npm.',
    'Uses the npm credentials from your local npm login (~/.npmrc).',
    'Examples:',
    '  npm run release',
    '  npm run release -- --tag next',
    '  npm run release -- --dry-run',
  ].join('\n'));
}

function main() {
  const publishArgs = process.argv.slice(2);
  if (publishArgs.includes('--help') || publishArgs.includes('-h')) {
    printHelp();
    return;
  }

  // Keep OpenClaw plugin manifest version aligned with the npm package version.
  syncPluginVersion();
  syncPluginMetadataVersion();

  run(npmCommand(), ['run', 'verify']);
  run(npmCommand(), ['publish', ...publishArgs]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
