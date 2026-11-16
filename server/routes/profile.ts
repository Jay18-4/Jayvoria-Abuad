import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { profileUpdateSchema } from '../domain/validation.ts';

export function createProfileRouter(db: AppDatabase) {
  const router = Router();

  router.get('/', requireAuth, (req: AuthRequest, res) => {
    return res.json({ user: req.user });
  });

  router.patch('/', requireAuth, (req: AuthRequest, res) => {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid profile data.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, phone, defaultAddress } = parsed.data;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE users SET name = ?, phone = ?, default_address = ?, updated_at = ? WHERE id = ?`
    ).run(name, phone || '', defaultAddress || '', now, req.user!.id);

    const updated = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.phone, u.default_address, u.auth_provider, u.created_at, r.name as role
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`
      )
      .get(req.user!.id) as {
      id: number;
      name: string;
      email: string;
      phone: string;
      default_address: string;
      auth_provider: string;
      created_at: string;
      role: 'CUSTOMER' | 'ADMIN';
    };

    return res.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        phone: updated.phone,
        defaultAddress: updated.default_address,
        authProvider: updated.auth_provider,
        createdAt: updated.created_at,
      },
    });
  });

  return router;
}
