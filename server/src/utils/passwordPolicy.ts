import argon2 from 'argon2';

// Blocklist of the most common / easily guessable passwords
const COMMON_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234',
  '1234567890',
  '123456789',
  '12345678',
  'qwerty1234',
  'qwertyuiop',
  'letmein123',
  'welcome123',
  'admin12345',
  'iloveyou123',
  'passcode123',
  'changeme123',
  'cliently123',
]);

// Pre-computed argon2id hash for timing side-channel protection when user is not found
let DUMMY_HASH: string | null = null;

export async function getDummyHash(): Promise<string> {
  if (!DUMMY_HASH) {
    DUMMY_HASH = await argon2.hash('DummyTimingDefenseSecret123!', {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }
  return DUMMY_HASH;
}

export function validatePasswordStrength(password: string): { isValid: boolean; message?: string } {
  if (!password || password.length < 10) {
    return {
      isValid: false,
      message: 'Password must be at least 10 characters long.',
    };
  }

  const normalized = password.toLowerCase().trim();
  if (COMMON_PASSWORDS.has(normalized)) {
    return {
      isValid: false,
      message: 'This password is too common and insecure. Please choose a stronger password.',
    };
  }

  return { isValid: true };
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, plainText: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainText);
  } catch {
    return false;
  }
}
