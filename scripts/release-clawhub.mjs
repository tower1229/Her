#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
    env: { ...process.env },
  });

  if (result.status !== 0) {
    if (options.capture) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }

  return options.capture ? String(result.stdout || '').trim() : '';
}

function hasCommand(command) {
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  return spawnSync(lookup, [command], { stdio: 'ignore' }).status === 0;
}

function clawhubCommand() {
  if (hasCommand('clawhub')) {
    return { command: commandName('clawhub'), prefix: [] };
  }
  return {
    command: commandName('npx'),
    prefix: ['-y', 'clawhub'],
  };
}

function gitOutput(args) {
  return run('git', args, { capture: true });
}

function normalizedRepositoryUrl() {
  const remote = gitOutput(['config', '--get', 'remote.origin.url']);
  const sshMatch = remote.match(/^git@github\.com:(.+?)(?:\.git)?$/);
  if (sshMatch) return `https://github.com/${sshMatch[1].replace(/\.git$/, '')}`;
  return remote.replace(/^git\+/, '').replace(/\.git$/, '');
}

function parseArgs(argv) {
  const options = { publish: false, owner: process.env.CLAWHUB_OWNER || '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--publish') {
      options.publish = true;
      continue;
    }
    if (arg === '--owner') {
      options.owner = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log([
    'Usage: npm run release:clawhub -- [--owner <handle>] [--publish]',
    '',
    'Default behavior is a safe dry-run. Pass --publish for a live release.',
    'The live path requires a clean Git worktree so source attribution is exact.',
  ].join('\n'));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.publish && gitOutput(['status', '--porcelain'])) {
    throw new Error('Live ClawHub publishing requires a clean Git worktree. Commit the release first.');
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const validationDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stella-clawhub-validation-'));
  let artifactPath = '';

  try {
    run(commandName('npm'), ['run', 'generate:holidays']);
    run(commandName('npm'), ['run', 'verify']);

    if (options.publish && gitOutput(['status', '--porcelain'])) {
      throw new Error('Release preparation changed tracked files. Commit the generated output before publishing.');
    }

    const clawhub = clawhubCommand();
    run(clawhub.command, [
      ...clawhub.prefix,
      'package',
      'validate',
      '--out',
      validationDir,
      '.',
    ]);

    const packedName = run(commandName('npm'), ['pack', '--silent'], { capture: true })
      .split(/\r?\n/)
      .filter(Boolean)
      .at(-1);
    if (!packedName) throw new Error('npm pack did not return an artifact name.');
    artifactPath = path.join(repoRoot, packedName);

    const publishArgs = [
      ...clawhub.prefix,
      'package',
      'publish',
      '--family',
      'code-plugin',
      '--source-repo',
      normalizedRepositoryUrl(),
      '--source-commit',
      gitOutput(['rev-parse', 'HEAD']),
      '--source-ref',
      gitOutput(['branch', '--show-current']),
      '--json',
    ];
    if (options.owner) publishArgs.push('--owner', options.owner);
    if (!options.publish) publishArgs.push('--dry-run');
    publishArgs.push(artifactPath);

    console.log(`${options.publish ? 'Publishing' : 'Dry-running'} ${pkg.name}@${pkg.version} on ClawHub.`);
    run(clawhub.command, publishArgs);
  } finally {
    fs.rmSync(validationDir, { recursive: true, force: true });
    if (artifactPath) fs.rmSync(artifactPath, { force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
