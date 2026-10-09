import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { authController } from './auth.controller.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { requireAuth } from '../../middlewares/authenticate.js';
import { authRateLimiter, emailAuthRateLimiter } from '../../middlewares/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
} from './auth.schema.js';

const router = Router();

// Ensure uploads/avatars directory exists
const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, avatarsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueId = crypto.randomUUID();
    cb(null, `avatar-${Date.now()}-${uniqueId}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max avatar limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for avatars'));
    }
  },
});

// Public Authentication Routes (with strict rate limiting & validation)
router.post(
  '/register',
  authRateLimiter,
  emailAuthRateLimiter,
  validateRequest({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  authRateLimiter,
  emailAuthRateLimiter,
  validateRequest({ body: loginSchema }),
  authController.login
);

router.post('/refresh', authController.refresh);

router.post('/logout', authController.logout);

router.post(
  '/verify-email',
  validateRequest({ body: verifyEmailSchema }),
  authController.verifyEmail
);

router.post(
  '/forgot-password',
  authRateLimiter,
  emailAuthRateLimiter,
  validateRequest({ body: forgotPasswordSchema }),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authRateLimiter,
  validateRequest({ body: resetPasswordSchema }),
  authController.resetPassword
);

// Protected Auth Routes
router.get('/me', requireAuth, authController.me);
router.get('/events', requireAuth, authController.eventsStream);
router.post('/logout-all', requireAuth, authController.logoutAll);

router.patch(
  '/profile',
  requireAuth,
  validateRequest({ body: updateProfileSchema }),
  authController.updateProfile
);

router.post(
  '/avatar',
  requireAuth,
  avatarUpload.single('avatar'),
  authController.uploadAvatar
);

router.delete('/avatar', requireAuth, authController.deleteAvatar);

router.patch(
  '/change-password',
  requireAuth,
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword
);

export default router;
