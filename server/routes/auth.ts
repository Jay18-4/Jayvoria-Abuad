import crypto from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import type { AppDatabase } from '../db/database.ts';
import {
  SESSION_COOKIE_NAME,
  createSession,
  destroySessionByCookie,
  getClearCookieOptions,
  getCookieOptions,
  type AuthRequest,
} from '../middleware/auth.ts';
import { loginSchema, registerSchema } from '../domain/validation.ts';

if (!getApps().length) {
  initializeApp({ projectId: firebaseConfig.projectId });
}
const adminAuth = getAuth();

export function createAuthRouter(db: AppDatabase, authLimiter: RequestHandler) {
  const router = Router();

  router.post('/register', authLimiter, (req: AuthRequest, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid registration details.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, email, password, phone, defaultAddress } = parsed.data;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({
        error: 'An account with this email address already exists.',
      });
    }

    const customerRole = db.prepare("SELECT id FROM roles WHERE name = 'CUSTOMER'").get() as {
      id: number;
    };

    const passwordHash = bcrypt.hashSync(password, 12);

    const insertResult = db
      .prepare(
        `INSERT INTO users (role_id, name, email, password_hash, phone, default_address, auth_provider)
         VALUES (?, ?, ?, ?, ?, ?, 'LOCAL')`
      )
      .run(customerRole.id, name, email, passwordHash, phone || '', defaultAddress || '');

    const userId = Number(insertResult.lastInsertRowid);

    destroySessionByCookie(db, req);
    const session = createSession(db, userId, req);
    res.cookie(SESSION_COOKIE_NAME, session.rawToken, getCookieOptions(req));

    const user = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.phone, u.default_address, u.auth_provider, u.created_at, r.name as role
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
      )
      .get(userId) as {
      id: number;
      name: string;
      email: string;
      phone: string;
      default_address: string;
      auth_provider: string;
      created_at: string;
      role: 'CUSTOMER' | 'ADMIN';
    };

    return res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        defaultAddress: user.default_address,
        authProvider: user.auth_provider,
        createdAt: user.created_at,
      },
      csrfToken: session.csrfToken,
      sessionToken: session.rawToken,
    });
  });

  router.post('/login', authLimiter, (req: AuthRequest, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Please enter a valid email and password.',
      });
    }

    const { email, password } = parsed.data;

    const row = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.password_hash, u.phone, u.default_address, u.auth_provider, u.is_active, u.created_at, r.name as role
         FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.email = ?`
      )
      .get(email) as
      | {
          id: number;
          name: string;
          email: string;
          password_hash: string;
          phone: string;
          default_address: string;
          auth_provider: string;
          is_active: number;
          created_at: string;
          role: 'CUSTOMER' | 'ADMIN';
        }
      | undefined;

    if (!row || row.is_active !== 1 || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Regenerate session on login to prevent session fixation
    destroySessionByCookie(db, req);
    const session = createSession(db, row.id, req);
    res.cookie(SESSION_COOKIE_NAME, session.rawToken, getCookieOptions(req));

    return res.json({
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        phone: row.phone,
        defaultAddress: row.default_address,
        authProvider: row.auth_provider,
        createdAt: row.created_at,
      },
      csrfToken: session.csrfToken,
      sessionToken: session.rawToken,
    });
  });

  router.post('/google', authLimiter, async (req: AuthRequest, res) => {
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
    if (!idToken) {
      return res.status(400).json({ error: 'Missing Google sign-in token.' });
    }

    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      const email = (decoded.email || '').toLowerCase();
      if (!email || !decoded.email_verified) {
        return res.status(400).json({ error: 'A verified email is required for Google sign-in.' });
      }

      const displayName = (decoded.name || email.split('@')[0] || 'Guest').slice(0, 100);
      let userRow = db
        .prepare(
          `SELECT u.id, u.name, u.email, u.phone, u.default_address, u.auth_provider, u.created_at, r.name as role
           FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`
        )
        .get(email) as
        | {
            id: number;
            name: string;
            email: string;
            phone: string;
            default_address: string;
            auth_provider: string;
            created_at: string;
            role: 'CUSTOMER' | 'ADMIN';
          }
        | undefined;

      if (!userRow) {
        const customerRole = db.prepare("SELECT id FROM roles WHERE name = 'CUSTOMER'").get() as {
          id: number;
        };
        const randomHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
        const inserted = db
          .prepare(
            `INSERT INTO users (role_id, name, email, password_hash, auth_provider, firebase_uid)
             VALUES (?, ?, ?, ?, 'GOOGLE', ?)`
          )
          .run(customerRole.id, displayName, email, randomHash, decoded.uid);

        userRow = db
          .prepare(
            `SELECT u.id, u.name, u.email, u.phone, u.default_address, u.auth_provider, u.created_at, r.name as role
             FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
          )
          .get(Number(inserted.lastInsertRowid)) as typeof userRow;
      }

      destroySessionByCookie(db, req);
      const session = createSession(db, userRow!.id, req);
      res.cookie(SESSION_COOKIE_NAME, session.rawToken, getCookieOptions(req));

      return res.json({
        user: {
          id: userRow!.id,
          name: userRow!.name,
          email: userRow!.email,
          role: userRow!.role,
          phone: userRow!.phone,
          defaultAddress: userRow!.default_address,
          authProvider: userRow!.auth_provider,
          createdAt: userRow!.created_at,
        },
        csrfToken: session.csrfToken,
        sessionToken: session.rawToken,
      });
    } catch {
      return res.status(401).json({ error: 'Unable to verify Google authentication token.' });
    }
  });

  router.post('/logout', (req: AuthRequest, res) => {
    destroySessionByCookie(db, req);
    res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions(req));
    return res.json({ success: true });
  });

  router.get('/me', (req: AuthRequest, res) => {
    if (!req.user || !req.sessionInfo) {
      return res.json({ user: null, csrfToken: null });
    }
    return res.json({
      user: req.user,
      csrfToken: req.sessionInfo.csrfToken,
    });
  });

  return router;
}
