import * as fs from 'fs';
import * as path from 'path';

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

  let fd: number | null = null;
  try {
    fd = fs.openSync(lockPath, 'wx');
    return await fn();
  } catch (error: any) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new FileLockError(lockPath);
    }
    throw error;
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }
}
