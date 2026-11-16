import crypto from 'node:crypto';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME, type AuthRequest } from './auth.ts';

export function buildHelmetMiddleware() {
  const isProd = process.env.NODE_ENV === 'production';
  return helmet({
    frameguard: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isProd
          ? ["'self'", 'https://apis.google.com', 'https://js.paystack.co']
          : [
              "'self'",
              "'unsafe-inline'",
              "'unsafe-eval'",
              'https://apis.google.com',
              'https://js.paystack.co',
            ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'https://*.googleapis.com',
          'wss://*.googleapis.com',
          'https://*.firebaseio.com',
          'wss://*.firebaseio.com',
          'https://*.firebaseapp.com',
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'https://api.paystack.co',
          'https://standard.paystack.co',
          'https://checkout.paystack.com',
          ...(!isProd ? ['ws://localhost:*', 'ws://127.0.0.1:*', 'wss://localhost:*'] : []),
        ],
        frameSrc: [
          "'self'",
          'https://*.firebaseapp.com',
          'https://accounts.google.com',
          'https://checkout.paystack.com',
          'https://js.paystack.co',
        ],
        frameAncestors: ["'self'", 'https://aistudio.google.com', 'https://*.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  });
}

export function buildCorsMiddleware() {
  const allowedRaw = [
    process.env.APP_URL,
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]
    .map((s) => (s || '').trim())
    .filter(Boolean);

  const allowedSet = new Set(allowedRaw);

  return cors({
    origin: (origin, callback) => {
      if (!origin || allowedSet.has(origin)) {
        return callback(null, true);
      }
      if (/^https:\/\/[a-z0-9-]+\.run\.app$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS policy.'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Authorization'],
  });
}

export function buildAuthRateLimiter(maxAttempts: number = 20) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: maxAttempts,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many authentication attempts. Please wait a few minutes and try again.',
    },
  });
}

const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/google',
]);

export function verifyCsrf(req: AuthRequest, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  const hasSessionCookie = Boolean(req.cookies?.[SESSION_COOKIE_NAME]);
  if (!hasSessionCookie || !req.sessionInfo) {
    return next();
  }

  const headerToken = req.headers['x-csrf-token'];
  if (typeof headerToken !== 'string' || !headerToken) {
    return res.status(403).json({
      error: 'Security verification failed: missing CSRF token.',
    });
  }

  const expected = Buffer.from(req.sessionInfo.csrfToken, 'utf8');
  const provided = Buffer.from(headerToken, 'utf8');

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(403).json({
      error: 'Security verification failed: invalid CSRF token.',
    });
  }

  next();
}
