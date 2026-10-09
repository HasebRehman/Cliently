import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// IP-based rate limiter for sensitive authentication endpoints (10 requests per 15 min per IP in production)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 10 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
    },
  },
});

// Email-based rate limiter for login & password reset requests (5 requests per 15 min per email in production)
export const emailAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 5 : 1000,
  keyGenerator: (req) => {
    const email = req.body?.email;
    return typeof email === 'string' ? `email:${email.toLowerCase().trim()}` : req.ip || 'unknown';
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'EMAIL_RATE_LIMIT_EXCEEDED',
      message: 'Too many attempts for this email address. Please try again after 15 minutes.',
    },
  },
});

// Stricter limiter for member invites (20 invites per hour per IP in production)
export const inviteRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 20 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'INVITE_RATE_LIMIT_EXCEEDED',
      message: 'Too many invite requests from this IP. Please try again later.',
    },
  },
});
