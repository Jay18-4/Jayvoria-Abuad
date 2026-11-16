import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';

function formatMenuItemRow(row: any) {
  let dietaryTags: string[] = [];
  try {
    dietaryTags = JSON.parse(row.dietary_tags || '[]');
  } catch {
    dietaryTags = [];
  }

  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    imageUrl: row.image_url,
    dietaryTags,
    prepTimeMins: row.prep_time_mins,
    isAvailable: row.is_available === 1,
    isFeatured: row.is_featured === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createMenuRouter(db: AppDatabase) {
  const router = Router();

  router.get('/categories', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.id, c.name, c.slug, c.description, c.sort_order,
                COUNT(CASE WHEN m.is_deleted = 0 THEN 1 END) as item_count
         FROM categories c
         LEFT JOIN menu_items m ON m.category_id = c.id
         GROUP BY c.id
         ORDER BY c.sort_order ASC, c.name ASC`
      )
      .all() as any[];

    return res.json({
      categories: rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        sortOrder: r.sort_order,
        itemCount: r.item_count,
      })),
    });
  });

  router.get('/menu', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const availableOnly = req.query.availableOnly === 'true';

    const conditions: string[] = ['m.is_deleted = 0'];
    const params: any[] = [];

    if (search) {
      conditions.push('(LOWER(m.name) LIKE LOWER(?) OR LOWER(m.description) LIKE LOWER(?))');
      const likePattern = `%${search}%`;
      params.push(likePattern, likePattern);
    }

    if (category && category !== 'all') {
      if (/^\d+$/.test(category)) {
        conditions.push('m.category_id = ?');
        params.push(Number(category));
      } else {
        conditions.push('c.slug = ?');
        params.push(category);
      }
    }

    if (availableOnly) {
      conditions.push('m.is_available = 1');
    }

    const sql = `
      SELECT m.*, c.name as category_name, c.slug as category_slug
      FROM menu_items m
      JOIN categories c ON c.id = m.category_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY m.is_featured DESC, c.sort_order ASC, m.name ASC
    `;

    const rows = db.prepare(sql).all(...params);
    return res.json({ items: rows.map(formatMenuItemRow) });
  });

  router.get('/menu/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid menu item identifier.' });
    }

    const row = db
      .prepare(
        `SELECT m.*, c.name as category_name, c.slug as category_slug
         FROM menu_items m
         JOIN categories c ON c.id = m.category_id
         WHERE m.id = ? AND m.is_deleted = 0`
      )
      .get(id);

    if (!row) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    return res.json({ item: formatMenuItemRow(row) });
  });

  return router;
}
