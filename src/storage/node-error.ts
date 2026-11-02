export function isNodeErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code: unknown }).code === code);
}
