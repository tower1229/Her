import * as fs from 'fs';
import * as path from 'path';

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
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
    }
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }
}
