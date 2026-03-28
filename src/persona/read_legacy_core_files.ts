import * as fs from 'fs';
import * as path from 'path';
import { LegacyCoreFiles } from './types';

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

export function readLegacyCoreFiles(workspaceDir: string): LegacyCoreFiles {
  const soul = readTextFile(path.join(workspaceDir, 'SOUL.md'));
  const memory = readTextFile(path.join(workspaceDir, 'MEMORY.md')) || readTextFile(path.join(workspaceDir, 'memory.md'));
  const identity = readTextFile(path.join(workspaceDir, 'IDENTITY.md')) || readTextFile(path.join(workspaceDir, 'IDENTITY'));

  return {
    soul,
    memory,
    identity,
    found: {
      soul: Boolean(soul.trim()),
      memory: Boolean(memory.trim()),
      identity: Boolean(identity.trim()),
    },
  };
}
