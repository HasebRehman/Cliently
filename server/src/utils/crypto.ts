import crypto from 'crypto';

/**
 * Generate a cryptographically secure random hexadecimal token
 */
export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Compute SHA-256 hash of a raw token for safe database storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');

  if (aBuf.length !== bBuf.length) {
    // Perform a dummy timingSafeEqual to avoid timing side-channels
    const dummy = Buffer.alloc(aBuf.length, 0);
    crypto.timingSafeEqual(aBuf, dummy);
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}
