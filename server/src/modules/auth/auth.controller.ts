import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { env } from '../../config/env.js';
import { registerRealtimeClient } from '../../lib/realtime.js';

const REFRESH_COOKIE_NAME = 'cliently_refresh_token';
const isProd = env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const meta = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const result = await authService.login(req.body, meta);

      // Set secure HTTP-only refresh token cookie
      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, cookieOptions);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
          organizations: result.organizations,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body.refreshToken;
      const meta = {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      };

      const result = await authService.refresh(rawRefreshToken, meta);

      // Rotate cookie
      res.cookie(REFRESH_COOKIE_NAME, result.newRawRefreshToken, cookieOptions);

      res.status(200).json({
        success: true,
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      // Clear cookie on failure
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body.refreshToken;
      const result = await authService.logout(rawRefreshToken);

      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.logoutAll(req.user!.userId);
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.verifyEmail(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.forgotPassword(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.resetPassword(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.changePassword(
        req.user!.userId,
        req.body,
        req.user!.sessionId
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.getCurrentUser(req.user!.userId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.updateProfile(req.user!.userId, req.body);
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE_UPLOADED',
            message: 'Please provide an image file to upload.',
          },
        });
        return;
      }

      const host = req.get('host');
      const protocol = req.protocol;
      const fileUrl = `${protocol}://${host}/uploads/avatars/${req.file.filename}`;

      const updatedUser = await authService.updateAvatar(req.user!.userId, fileUrl);

      res.status(200).json({
        success: true,
        message: 'Profile picture updated successfully.',
        data: {
          avatarUrl: fileUrl,
          user: updatedUser,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedUser = await authService.updateAvatar(req.user!.userId, null);
      res.status(200).json({
        success: true,
        message: 'Profile picture removed successfully.',
        data: {
          avatarUrl: null,
          user: updatedUser,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  eventsStream(req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const userId = req.user!.userId;
    const cleanup = registerRealtimeClient(userId, res);

    res.write(`event: connected\ndata: {"status":"connected","userId":"${userId}"}\n\n`);

    const keepaliveInterval = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(keepaliveInterval);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepaliveInterval);
      cleanup();
    });
  }
}

export const authController = new AuthController();
