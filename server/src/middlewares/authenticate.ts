import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';
import { AuthUser } from '../types/express.js';

interface AccessTokenPayload {
  userId: string;
  sessionId: string;
  iat: number;
  exp: number;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;

    let token: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (queryToken) {
      token = queryToken;
    }

    if (!token) {
      throw new AppError('Authentication required. Missing Bearer token.', 401, 'UNAUTHORIZED');
    }

    let decoded: AccessTokenPayload;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Access token has expired. Please refresh your session.', 401, 'TOKEN_EXPIRED');
      }
      throw new AppError('Invalid access token.', 401, 'INVALID_TOKEN');
    }

    // Verify session validity against DB (not revoked, not expired)
    const session = await prisma.refreshToken.findUnique({
      where: { id: decoded.sessionId },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
      },
    });

    if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
      throw new AppError('Session has been revoked or expired. Please log in again.', 401, 'SESSION_REVOKED');
    }

    req.user = {
      userId: decoded.userId,
      sessionId: decoded.sessionId,
    } as AuthUser;

    next();
  } catch (error) {
    next(error);
  }
}
