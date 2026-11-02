import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

function isNodeErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === code);
}

export function readOptionalFile(filePath: string): string | null {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch (error: unknown) { if (isNodeErrorCode(error, 'ENOENT')) return null; throw error; }
}

// Optimistic external-change detection; other writers need not share our lock.
// The final comparison/rename is not an OS-level compare-and-swap.
export function commitFile(filePath: string, expected: string | null, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let owned = false;
  try {
    const mode = expected === null ? 0o600 : fs.statSync(filePath).mode;
    const fd = fs.openSync(temp, 'wx', mode);
    owned = true;
    try { fs.writeFileSync(fd, content); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (readOptionalFile(filePath) !== expected) throw new Error('Daily log changed before commit; retry from current contents.');
    fs.renameSync(temp, filePath);
    owned = false;
  } finally {
    if (owned) {
      try { fs.unlinkSync(temp); } catch (error: unknown) { if (!isNodeErrorCode(error, 'ENOENT')) throw error; }
    }
  }
}
