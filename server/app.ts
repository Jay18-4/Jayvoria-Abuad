import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import type { AppDatabase } from './db/database.ts';
import { attachAuthContext } from './middleware/auth.ts';
import {
  buildAuthRateLimiter,
  buildCorsMiddleware,
  buildHelmetMiddleware,
  verifyCsrf,
} from './middleware/security.ts';
import { createAuthRouter } from './routes/auth.ts';
import { createProfileRouter } from './routes/profile.ts';
import { createMenuRouter } from './routes/menu.ts';
import { createOrdersRouter } from './routes/orders.ts';
import { createAdminRouter } from './routes/admin.ts';
import { createPaymentsRouter } from './routes/payments.ts';
import { PaymentService } from './services/paymentService.ts';

export interface CreateAppOptions {
  authRateLimitMax?: number;
  paymentService?: PaymentService;
}

export function createApp(db: AppDatabase, options: CreateAppOptions = {}) {
  const app = express();
  const paymentService = options.paymentService ?? new PaymentService();

  app.set('trust proxy', 1);
  app.use(buildHelmetMiddleware());
  app.use(buildCorsMiddleware());
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(cookieParser());
  app.use(attachAuthContext(db));
  app.use(verifyCsrf);

  const authLimiter = buildAuthRateLimiter(options.authRateLimitMax ?? 25);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', createAuthRouter(db, authLimiter));
  app.use('/api/profile', createProfileRouter(db));
  app.use('/api', createMenuRouter(db));
  app.use('/api/payments', createPaymentsRouter(db, paymentService));
  app.use('/api/orders', createOrdersRouter(db, paymentService));
  app.use('/api/admin', createAdminRouter(db));

  // API 404 handler
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global safe error handler (never exposes stack traces or SQL internals)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled server error:', err.message);
    if (res.headersSent) {
      return;
    }
    if (err.message === 'Not allowed by CORS policy.') {
      return res.status(403).json({ error: 'Origin not permitted.' });
    }
    return res.status(500).json({
      error: 'An unexpected error occurred. Please try again shortly.',
    });
  });

  return app;
}
