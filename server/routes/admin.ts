import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { requireAuth, requireRole, type AuthRequest } from '../middleware/auth.ts';
import {
  categorySchema,
  menuItemSchema,
  updateOrderStatusSchema,
} from '../domain/validation.ts';
import {
  ORDER_STATUSES,
  canTransitionOrderStatus,
  getAllowedNextStatuses,
  type OrderStatus,
} from '../domain/orders.ts';
import { formatOrderWithItems } from './orders.ts';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function createAdminRouter(db: AppDatabase) {
  const router = Router();

  router.use(requireAuth, requireRole('ADMIN'));

  // Dashboard Overview Statistics
  router.get('/stats', (_req, res) => {
    const orderStats = db
      .prepare(
        `SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(CASE WHEN status IN ('Pending', 'Confirmed', 'Preparing', 'Ready') THEN 1 ELSE 0 END), 0) as active_orders,
          COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) as pending_orders,
          COALESCE(SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END), 0) as completed_orders,
          COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN total_cents ELSE 0 END), 0) as total_revenue_cents
        FROM orders`
      )
      .get() as any;

    const customerCount = db
      .prepare(
        `SELECT COUNT(*) as count FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'CUSTOMER'`
      )
      .get() as { count: number };

    const menuStats = db
      .prepare(
        `SELECT
          COUNT(*) as total_items,
          COALESCE(SUM(CASE WHEN is_available = 1 AND stock_quantity > 0 THEN 1 ELSE 0 END), 0) as available_items
         FROM menu_items WHERE is_deleted = 0`
      )
      .get() as { total_items: number; available_items: number };

    const recentRows = db
      .prepare(`SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 8`)
      .all();

    return res.json({
      stats: {
        totalOrders: orderStats.total_orders,
        activeOrders: orderStats.active_orders,
        pendingOrders: orderStats.pending_orders,
        completedOrders: orderStats.completed_orders,
        totalRevenueCents: orderStats.total_revenue_cents,
        totalCustomers: customerCount.count,
        totalMenuItems: menuStats.total_items,
        availableMenuItems: menuStats.available_items,
      },
      recentOrders: recentRows.map((row) => formatOrderWithItems(db, row)),
    });
  });

  // Order Management
  router.get('/orders', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const dateFrom = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const dateTo = typeof req.query.to === 'string' ? req.query.to.trim() : '';

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (search) {
      conditions.push(
        '(LOWER(order_reference) LIKE LOWER(?) OR LOWER(customer_name) LIKE LOWER(?) OR LOWER(customer_email) LIKE LOWER(?))'
      );
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    if (status && status !== 'All' && (ORDER_STATUSES as readonly string[]).includes(status)) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
      conditions.push('substr(created_at, 1, 10) >= ?');
      params.push(dateFrom);
    }

    if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      conditions.push('substr(created_at, 1, 10) <= ?');
      params.push(dateTo);
    }

    const rows = db
      .prepare(`SELECT * FROM orders WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC, id DESC`)
      .all(...params);

    return res.json({
      orders: rows.map((row) => formatOrderWithItems(db, row)),
    });
  });

  router.patch('/orders/:id/status', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid order ID.' });
    }

    const parsed = updateOrderStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid order status value.' });
    }

    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const currentStatus = existing.status as OrderStatus;
    const nextStatus = parsed.data.status;

    if (!canTransitionOrderStatus(currentStatus, nextStatus)) {
      const allowed = getAllowedNextStatuses(currentStatus);
      return res.status(400).json({
        error:
          allowed.length === 0
            ? `Order ${existing.order_reference} is ${currentStatus} and cannot be changed.`
            : `Cannot transition order from ${currentStatus} to ${nextStatus}. Allowed next statuses: ${allowed.join(', ')}.`,
      });
    }

    const now = new Date().toISOString();
    let paymentStatus = existing.payment_status;
    if (nextStatus === 'Completed' && paymentStatus === 'PENDING_COLLECTION') {
      paymentStatus = 'PAID_ON_COLLECTION';
    } else if (
      nextStatus === 'Cancelled' &&
      (paymentStatus === 'PAID_ON_COLLECTION' || paymentStatus === 'PAID_PAYSTACK')
    ) {
      paymentStatus = 'REFUNDED';
    }

    try {
      db.exec('BEGIN IMMEDIATE');

      db.prepare(`UPDATE orders SET status = ?, payment_status = ?, updated_at = ? WHERE id = ?`).run(
        nextStatus,
        paymentStatus,
        now,
        id
      );

      if (nextStatus === 'Cancelled') {
        const itemsToRestore = db
          .prepare('SELECT menu_item_id, quantity FROM order_items WHERE order_id = ?')
          .all(id) as Array<{ menu_item_id: number; quantity: number }>;

        const restoreStock = db.prepare(
          `UPDATE menu_items
           SET stock_quantity = stock_quantity + ?,
               is_available = CASE
                 WHEN is_deleted = 0 AND (stock_quantity + ?) > 0 THEN 1
                 ELSE is_available
               END,
               updated_at = ?
           WHERE id = ?`
        );

        for (const item of itemsToRestore) {
          restoreStock.run(item.quantity, item.quantity, now, item.menu_item_id);
        }
      }

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error
      }
      console.error('Failed to update order status:', err);
      return res.status(500).json({ error: 'Unable to update order status.' });
    }

    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    return res.json({ order: formatOrderWithItems(db, updated) });
  });

  // Menu Items Management
  router.post('/menu', (req, res) => {
    const parsed = menuItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid menu item data.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const d = parsed.data;
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(d.categoryId);
    if (!cat) {
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    const effectiveAvailable = d.stockQuantity === 0 ? false : d.isAvailable;
    const now = new Date().toISOString();
    const resInsert = db
      .prepare(
        `INSERT INTO menu_items (
          category_id, name, description, price_cents, image_url, dietary_tags,
          prep_time_mins, is_available, stock_quantity, is_featured, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        d.categoryId,
        d.name,
        d.description,
        d.priceCents,
        d.imageUrl,
        JSON.stringify(d.dietaryTags),
        d.prepTimeMins,
        effectiveAvailable ? 1 : 0,
        d.stockQuantity,
        d.isFeatured ? 1 : 0,
        now,
        now
      );

    const itemRow = db
      .prepare(
        `SELECT m.*, c.name as category_name, c.slug as category_slug
         FROM menu_items m JOIN categories c ON c.id = m.category_id WHERE m.id = ?`
      )
      .get(Number(resInsert.lastInsertRowid)) as any;

    return res.status(201).json({
      item: {
        id: itemRow.id,
        categoryId: itemRow.category_id,
        categoryName: itemRow.category_name,
        categorySlug: itemRow.category_slug,
        name: itemRow.name,
        description: itemRow.description,
        priceCents: itemRow.price_cents,
        imageUrl: itemRow.image_url,
        dietaryTags: JSON.parse(itemRow.dietary_tags || '[]'),
        prepTimeMins: itemRow.prep_time_mins,
        isAvailable: itemRow.is_available === 1 && (itemRow.stock_quantity ?? 0) > 0,
        stockQuantity: itemRow.stock_quantity ?? 0,
        isFeatured: itemRow.is_featured === 1,
        createdAt: itemRow.created_at,
        updatedAt: itemRow.updated_at,
      },
    });
  });

  router.patch('/menu/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid menu item ID.' });
    }

    const existing = db
      .prepare('SELECT * FROM menu_items WHERE id = ? AND is_deleted = 0')
      .get(id) as any | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    // Allow quick stock adjustment, availability toggle, or full update
    const merged = {
      categoryId: req.body.categoryId ?? existing.category_id,
      name: req.body.name ?? existing.name,
      description: req.body.description ?? existing.description,
      priceCents: req.body.priceCents ?? existing.price_cents,
      imageUrl: req.body.imageUrl ?? existing.image_url,
      dietaryTags:
        req.body.dietaryTags ?? JSON.parse(existing.dietary_tags || '[]'),
      prepTimeMins: req.body.prepTimeMins ?? existing.prep_time_mins,
      isAvailable:
        typeof req.body.isAvailable === 'boolean'
          ? req.body.isAvailable
          : existing.is_available === 1,
      stockQuantity: req.body.stockQuantity ?? existing.stock_quantity ?? 0,
      isFeatured:
        typeof req.body.isFeatured === 'boolean'
          ? req.body.isFeatured
          : existing.is_featured === 1,
    };

    const parsed = menuItemSchema.safeParse(merged);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid menu item update.',
      });
    }

    const d = parsed.data;
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(d.categoryId);
    if (!cat) {
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    if (
      d.stockQuantity === 0 &&
      req.body.isAvailable === true &&
      req.body.stockQuantity === undefined
    ) {
      return res.status(400).json({
        error: 'Cannot mark dish available while stock quantity is 0. Increase stock first.',
      });
    }

    let effectiveAvailable = d.isAvailable;
    if (d.stockQuantity === 0) {
      effectiveAvailable = false;
    } else if ((existing.stock_quantity ?? 0) === 0 && d.stockQuantity > 0 && req.body.isAvailable === undefined) {
      effectiveAvailable = true;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE menu_items SET
        category_id = ?, name = ?, description = ?, price_cents = ?,
        image_url = ?, dietary_tags = ?, prep_time_mins = ?,
        is_available = ?, stock_quantity = ?, is_featured = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      d.categoryId,
      d.name,
      d.description,
      d.priceCents,
      d.imageUrl,
      JSON.stringify(d.dietaryTags),
      d.prepTimeMins,
      effectiveAvailable ? 1 : 0,
      d.stockQuantity,
      d.isFeatured ? 1 : 0,
      now,
      id
    );

    const itemRow = db
      .prepare(
        `SELECT m.*, c.name as category_name, c.slug as category_slug
         FROM menu_items m JOIN categories c ON c.id = m.category_id WHERE m.id = ?`
      )
      .get(id) as any;

    return res.json({
      item: {
        id: itemRow.id,
        categoryId: itemRow.category_id,
        categoryName: itemRow.category_name,
        categorySlug: itemRow.category_slug,
        name: itemRow.name,
        description: itemRow.description,
        priceCents: itemRow.price_cents,
        imageUrl: itemRow.image_url,
        dietaryTags: JSON.parse(itemRow.dietary_tags || '[]'),
        prepTimeMins: itemRow.prep_time_mins,
        isAvailable: itemRow.is_available === 1 && (itemRow.stock_quantity ?? 0) > 0,
        stockQuantity: itemRow.stock_quantity ?? 0,
        isFeatured: itemRow.is_featured === 1,
        createdAt: itemRow.created_at,
        updatedAt: itemRow.updated_at,
      },
    });
  });

  router.delete('/menu/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid menu item ID.' });
    }

    const existing = db
      .prepare('SELECT id FROM menu_items WHERE id = ? AND is_deleted = 0')
      .get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Menu item not found.' });
    }

    // Preserve historical order integrity: soft-delete if referenced by any order_items
    const refCount = db
      .prepare('SELECT COUNT(*) as count FROM order_items WHERE menu_item_id = ?')
      .get(id) as { count: number };

    if (refCount.count > 0) {
      db.prepare(
        `UPDATE menu_items SET is_deleted = 1, is_available = 0, updated_at = ? WHERE id = ?`
      ).run(new Date().toISOString(), id);
    } else {
      db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
    }

    return res.json({ success: true, softDeleted: refCount.count > 0 });
  });

  // Categories Management
  router.post('/categories', (req, res) => {
    const parsed = categorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid category data.',
      });
    }

    const slug = slugify(parsed.data.name);
    if (!slug) {
      return res.status(400).json({ error: 'Category name must contain letters or numbers.' });
    }

    const dup = db
      .prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) OR slug = ?')
      .get(parsed.data.name, slug);
    if (dup) {
      return res.status(409).json({ error: 'A category with this name already exists.' });
    }

    const insert = db
      .prepare(
        `INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)`
      )
      .run(parsed.data.name, slug, parsed.data.description || '', parsed.data.sortOrder);

    const category = db
      .prepare('SELECT id, name, slug, description, sort_order FROM categories WHERE id = ?')
      .get(Number(insert.lastInsertRowid)) as any;

    return res.status(201).json({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        sortOrder: category.sort_order,
        itemCount: 0,
      },
    });
  });

  router.patch('/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid category ID.' });
    }

    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as any | undefined;
    if (!existing) {
      return res.status(404).json({ error: 'Category not found.' });
    }

    const parsed = categorySchema.safeParse({
      name: req.body.name ?? existing.name,
      description: req.body.description ?? existing.description,
      sortOrder: req.body.sortOrder ?? existing.sort_order,
    });
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid category data.',
      });
    }

    const slug = slugify(parsed.data.name);
    const dup = db
      .prepare('SELECT id FROM categories WHERE (LOWER(name) = LOWER(?) OR slug = ?) AND id != ?')
      .get(parsed.data.name, slug, id);
    if (dup) {
      return res.status(409).json({ error: 'Another category already uses this name.' });
    }

    db.prepare(
      'UPDATE categories SET name = ?, slug = ?, description = ?, sort_order = ? WHERE id = ?'
    ).run(parsed.data.name, slug, parsed.data.description || '', parsed.data.sortOrder, id);

    const updated = db
      .prepare('SELECT id, name, slug, description, sort_order FROM categories WHERE id = ?')
      .get(id) as any;

    return res.json({
      category: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        sortOrder: updated.sort_order,
      },
    });
  });

  router.delete('/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid category ID.' });
    }

    const countRow = db
      .prepare('SELECT COUNT(*) as count FROM menu_items WHERE category_id = ? AND is_deleted = 0')
      .get(id) as { count: number };

    if (countRow.count > 0) {
      return res.status(409).json({
        error: 'Cannot delete a category that still has active menu items. Reassign or delete those dishes first.',
      });
    }

    const softCount = db
      .prepare('SELECT COUNT(*) as count FROM menu_items WHERE category_id = ?')
      .get(id) as { count: number };

    if (softCount.count > 0) {
      return res.status(409).json({
        error: 'Cannot delete a category linked to historical order records.',
      });
    }

    const del = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    if (del.changes === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    return res.json({ success: true });
  });

  // Customer Management
  router.get('/customers', (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const conditions = ["r.name = 'CUSTOMER'"];
    const params: any[] = [];

    if (search) {
      conditions.push('(LOWER(u.name) LIKE LOWER(?) OR LOWER(u.email) LIKE LOWER(?) OR LOWER(u.phone) LIKE LOWER(?))');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const rows = db
      .prepare(
        `SELECT
          u.id, u.name, u.email, u.phone, u.default_address, u.auth_provider, u.is_active, u.created_at,
          r.name as role,
          COUNT(o.id) as order_count,
          COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.total_cents ELSE 0 END), 0) as total_spent_cents
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN orders o ON o.customer_id = u.id
         WHERE ${conditions.join(' AND ')}
         GROUP BY u.id
         ORDER BY u.created_at DESC`
      )
      .all(...params) as any[];

    return res.json({
      customers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        defaultAddress: row.default_address,
        authProvider: row.auth_provider,
        isActive: row.is_active === 1,
        role: row.role,
        orderCount: row.order_count,
        totalSpentCents: row.total_spent_cents,
        createdAt: row.created_at,
      })),
    });
  });

  return router;
}
