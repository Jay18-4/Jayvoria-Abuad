import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { AppDatabase } from '../db/database.ts';

export const SESSION_COOKIE_NAME = 'savoria_sid';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
  phone: string;
  defaultAddress: string;
  authProvider: string;
  createdAt: string;
}

export interface SessionInfo {
  id: number;
  csrfToken: string;
  expiresAt: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
  sessionInfo?: SessionInfo;
  db?: AppDatabase;
}

export function hashSessionToken(rawToken: string): string {
  const secret = process.env.SESSION_SECRET || 'savoria-dev-session-pepper';
  return crypto.createHmac('sha256', secret).update(rawToken).digest('hex');
}

export function getCookieOptions(req: Request) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

export function getClearCookieOptions(req: Request) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
  };
}

export function extractSessionToken(req: Request): { rawToken: string; fromCookie: boolean } | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return { rawToken: cookieToken, fromCookie: true };
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length >= 32 && bearer.length <= 256) {
      return { rawToken: bearer, fromCookie: false };
    }
  }

  return null;
}

export function createSession(
  db: AppDatabase,
  userId: number,
  req: Request,
  ttlMs: number = SESSION_TTL_MS
): { rawToken: string; csrfToken: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, csrf_token, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    tokenHash,
    userId,
    csrfToken,
    req.ip || '',
    String(req.headers['user-agent'] || '').slice(0, 250),
    expiresAt
  );

  return { rawToken, csrfToken, expiresAt };
}

export function destroySessionByCookie(db: AppDatabase, req: Request): void {
  const extracted = extractSessionToken(req);
  if (extracted) {
    const tokenHash = hashSessionToken(extracted.rawToken);
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }
}

export function attachAuthContext(db: AppDatabase) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    req.db = db;
    const extracted = extractSessionToken(req);
    if (!extracted) {
      return next();
    }

    const tokenHash = hashSessionToken(extracted.rawToken);
    const row = db
      .prepare(
        `SELECT
          s.id as session_id,
          s.csrf_token,
          s.expires_at,
          u.id as user_id,
          u.name,
          u.email,
          u.phone,
          u.default_address,
          u.auth_provider,
          u.is_active,
          u.created_at,
          r.name as role_name
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        JOIN roles r ON r.id = u.role_id
        WHERE s.token_hash = ?`
      )
      .get(tokenHash) as
      | {
          session_id: number;
          csrf_token: string;
          expires_at: string;
          user_id: number;
          name: string;
          email: string;
          phone: string;
          default_address: string;
          auth_provider: string;
          is_active: number;
          created_at: string;
          role_name: 'CUSTOMER' | 'ADMIN';
        }
      | undefined;

    if (!row) {
      if (extracted.fromCookie) {
        res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions(req));
      }
      return next();
    }

    if (new Date(row.expires_at).getTime() <= Date.now() || row.is_active !== 1) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
      if (extracted.fromCookie) {
        res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions(req));
      }
      return next();
    }

    req.user = {
      id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role_name,
      phone: row.phone,
      defaultAddress: row.default_address,
      authProvider: row.auth_provider,
      createdAt: row.created_at,
    };

    req.sessionInfo = {
      id: row.session_id,
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
    };

    next();
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.sessionInfo) {
    return res.status(401).json({
      error: 'Authentication required. Please sign in to continue.',
    });
  }
  next();
}

export function requireRole(role: 'ADMIN' | 'CUSTOMER') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !req.sessionInfo) {
      return res.status(401).json({
        error: 'Authentication required. Please sign in to continue.',
      });
    }
    if (req.user.role !== role) {
      return res.status(403).json({
        error: 'Access denied. You do not have permission to perform this action.',
      });
    }
    next();
  };
}
