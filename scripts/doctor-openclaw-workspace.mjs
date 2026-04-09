#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  detectAgentsContract,
  detectHeartbeatContract,
  detectCurrentSoulContract,
  detectLegacySoulContract,
  detectSoulContract,
  normalizeRootName,
  resolveCanonicalRootPath,
} from './workspace-contract.mjs';

function parseArgs(argv) {
  const options = {
    workspace: path.resolve(process.cwd()),
    canonicalRootName: 'memory',
    requireHeartbeat: false,
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
    if (arg === '--require-heartbeat') {
      options.requireHeartbeat = true;
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
    'Usage: openclaw-timeline-doctor [--workspace <dir>] [--canonical-root-name <name>] [--require-heartbeat]',
    '',
    'Checks whether the required Timeline workspace contracts are present.',
  ].join('\n'));
}

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function check(label, passed, successDetail, failureDetail) {
  const prefix = passed ? '[ok]' : '[missing]';
  console.log(`${prefix} ${label}: ${passed ? successDetail : failureDetail}`);
  return passed;
}

function checkSoulContract(filePath, content) {
  if (!fs.existsSync(filePath)) {
    console.log(`[missing] SOUL contract: ${filePath} is missing the Timeline recall contract`);
    return false;
  }
  if (detectCurrentSoulContract(content)) {
    console.log(`[ok] SOUL contract: ${filePath}`);
    return true;
  }
  if (detectLegacySoulContract(content)) {
    console.log(`[outdated] SOUL contract: ${filePath} has a legacy Timeline recall contract; rerun openclaw-timeline-setup to upgrade it`);
    return false;
  }
  if (detectSoulContract(content)) {
    console.log(`[outdated] SOUL contract: ${filePath} has an unrecognized older Timeline recall contract; rerun openclaw-timeline-setup to refresh it`);
    return false;
  }
  console.log(`[missing] SOUL contract: ${filePath} is missing the Timeline recall contract`);
  return false;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const agentsPath = path.join(options.workspace, 'AGENTS.md');
  const soulPath = path.join(options.workspace, 'SOUL.md');
  const heartbeatPath = path.join(options.workspace, 'HEARTBEAT.md');
  const canonicalRootPath = resolveCanonicalRootPath(options.workspace, options.canonicalRootName);
  const engagementStatePath = path.join(canonicalRootPath, 'engagement_state.json');

  const agentsContent = readText(agentsPath);
  const soulContent = readText(soulPath);
  const heartbeatContent = readText(heartbeatPath);

  let ok = true;
  ok = check(
    'AGENTS contract',
    fs.existsSync(agentsPath) && detectAgentsContract(agentsContent),
    agentsPath,
    `${agentsPath} is missing the Timeline daily-log contract`,
  ) && ok;
  ok = checkSoulContract(soulPath, soulContent) && ok;
  ok = check(
    'Canonical memory root',
    fs.existsSync(canonicalRootPath),
    canonicalRootPath,
    `${canonicalRootPath} does not exist`,
  ) && ok;
  if (options.requireHeartbeat) {
    ok = check(
      'HEARTBEAT contract',
      fs.existsSync(heartbeatPath) && detectHeartbeatContract(heartbeatContent),
      heartbeatPath,
      `${heartbeatPath} is missing the proactive greeting heartbeat contract`,
    ) && ok;
    ok = check(
      'Engagement state bootstrap',
      fs.existsSync(engagementStatePath),
      engagementStatePath,
      `${engagementStatePath} is missing; rerun openclaw-timeline-setup with heartbeat bootstrap enabled`,
    ) && ok;

    console.log('');
    console.log('Confirm OpenClaw heartbeat config (this is agent heartbeat, not a cron job):');
    console.log('- heartbeat.every = 30m');
    console.log('- heartbeat.target = "last"');
    console.log('- heartbeat.session = "proactive-greeting"');
    console.log('- heartbeat.isolatedSession = true');
    console.log('- heartbeat.lightContext = true');
  } else if (fs.existsSync(heartbeatPath) && detectHeartbeatContract(heartbeatContent)) {
    console.log(`[ok] HEARTBEAT contract (optional): ${heartbeatPath}`);
  } else {
    console.log(`[info] HEARTBEAT contract (optional): not configured; rerun with --require-heartbeat when proactive greeting is enabled`);
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
