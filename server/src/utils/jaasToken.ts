import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface JaasUserPayload {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl?: string | null;
  isHost?: boolean;
}

export interface GenerateJaasTokenOptions {
  roomName: string;
  user: JaasUserPayload;
}

/**
 * Generates an RS256 signed JWT for JaaS (Jitsi as a Service).
 * Follows official 8x8 / JaaS token specification.
 * Never logs or returns the private key.
 */
export function generateJaasToken(options: GenerateJaasTokenOptions): {
  token: string | null;
  appId: string;
} {
  const { roomName, user } = options;
  const appId = env.JAAS_APP_ID || '';
  const keyId = env.JAAS_KEY_ID || '';
  let privateKey = env.JAAS_PRIVATE_KEY || '';

  // Return empty/null token if JaaS credentials are not yet configured in environment
  if (!appId || !keyId || !privateKey) {
    return {
      token: null,
      appId,
    };
  }

  // Format private key properly if stored with escaped newlines in .env
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  // Ensure PEM headers exist if missing
  if (!privateKey.includes('-----BEGIN RSA PRIVATE KEY-----') && !privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  }

  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const isModerator = Boolean(user.isHost);
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    aud: 'jitsi',
    iss: 'chat',
    sub: appId,
    room: roomName,
    exp: now + 3600, // 1 hour expiration
    nbf: now - 10,
    context: {
      user: {
        id: user.id,
        name: displayName,
        email: user.email,
        ...(user.avatarUrl ? { avatar: user.avatarUrl } : {}),
        moderator: isModerator ? 'true' : 'false',
      },
      features: {
        livestreaming: true,
        recording: true,
        transcription: true,
        'outbound-call': false,
      },
    },
  };

  try {
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      header: {
        alg: 'RS256',
        typ: 'JWT',
        kid: keyId,
      },
    });

    return {
      token,
      appId,
    };
  } catch (error) {
    // Never expose or log the private key on error
    console.error('Failed to sign JaaS JWT token (verify key format):', error instanceof Error ? error.message : 'Unknown error');
    return {
      token: null,
      appId,
    };
  }
}
