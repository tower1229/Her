import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export class FileLockError extends Error {
  code: 'LOCK_EXISTS';

  constructor(lockPath: string) {
    super(`Lock already held for ${lockPath}`);
    this.name = 'FileLockError';
    this.code = 'LOCK_EXISTS';
  }
}

export async function withFileLock<T>(targetPath: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = `${targetPath}.lock`;
  const dir = path.dirname(lockPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'wx');
  } catch (error: any) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new FileLockError(lockPath);
    }
    throw error;
  }
  const owner = randomUUID();
  const identity = fs.fstatSync(fd);
  let ownerWritten = false;
  try {
    fs.writeFileSync(fd, owner);
    ownerWritten = true;
    return await fn();
  } finally {
    fs.closeSync(fd);
    try {
      const current = fs.statSync(lockPath);
      const sameFile = current.dev === identity.dev && current.ino === identity.ino;
      const contents = fs.readFileSync(lockPath, 'utf8');
      if (sameFile && (contents === owner || (!ownerWritten && contents === ''))) fs.unlinkSync(lockPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export async function withFileLocks<T>(paths: string[], fn: () => Promise<T>): Promise<T> {
  const sorted = [...new Set(paths.map(p => path.resolve(p)))].sort();
  const acquire = (index: number): Promise<T> => index === sorted.length
    ? fn() : withFileLock(sorted[index], () => acquire(index + 1));
  return acquire(0);
}
