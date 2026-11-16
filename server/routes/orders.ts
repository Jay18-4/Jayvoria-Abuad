import { Router } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { createOrderSchema } from '../domain/validation.ts';
import { calculateOrderTotals, generateOrderReference } from '../domain/orders.ts';
import { PaymentService, PaymentServiceError } from '../services/paymentService.ts';

export function formatOrderWithItems(db: AppDatabase, orderRow: any) {
  const items = db
    .prepare(
      `SELECT id, menu_item_id, item_name, unit_price_cents, quantity, line_total_cents
       FROM order_items WHERE order_id = ? ORDER BY id ASC`
    )
    .all(orderRow.id) as any[];

  return {
    id: orderRow.id,
    orderReference: orderRow.order_reference,
    customerId: orderRow.customer_id,
    customerName: orderRow.customer_name,
    customerEmail: orderRow.customer_email,
    customerPhone: orderRow.customer_phone,
    fulfillmentType: orderRow.fulfillment_type,
    deliveryAddress: orderRow.delivery_address,
    orderNotes: orderRow.order_notes,
    paymentMethod: orderRow.payment_method,
    paymentStatus: orderRow.payment_status,
    paymentReference: orderRow.payment_reference || '',
    status: orderRow.status,
    subtotalCents: orderRow.subtotal_cents,
    deliveryFeeCents: orderRow.delivery_fee_cents,
    taxCents: orderRow.tax_cents,
    totalCents: orderRow.total_cents,
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at,
    items: items.map((it) => ({
      id: it.id,
      menuItemId: it.menu_item_id,
      itemName: it.item_name,
      unitPriceCents: it.unit_price_cents,
      quantity: it.quantity,
      lineTotalCents: it.line_total_cents,
    })),
  };
}

export function createOrdersRouter(db: AppDatabase, paymentService = new PaymentService()) {
  const router = Router();

  router.post('/', requireAuth, async (req: AuthRequest, res) => {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Please check your order details.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const input = parsed.data;

    // Combine duplicate menuItemIds safely so quantity limits are respected
    const mergedQuantities = new Map<number, number>();
    for (const line of input.items) {
      const nextQty = (mergedQuantities.get(line.menuItemId) || 0) + line.quantity;
      if (nextQty > 50) {
        return res.status(400).json({ error: 'Maximum quantity per item is 50.' });
      }
      mergedQuantities.set(line.menuItemId, nextQty);
    }

    const resolvedLines: Array<{
      menuItemId: number;
      name: string;
      unitPriceCents: number;
      quantity: number;
      lineTotalCents: number;
    }> = [];

    const selectItem = db.prepare(
      `SELECT id, name, price_cents, is_available, stock_quantity, is_deleted FROM menu_items WHERE id = ?`
    );

    for (const [menuItemId, quantity] of mergedQuantities.entries()) {
      const dbItem = selectItem.get(menuItemId) as
        | {
            id: number;
            name: string;
            price_cents: number;
            is_available: number;
            stock_quantity: number;
            is_deleted: number;
          }
        | undefined;

      if (!dbItem || dbItem.is_deleted === 1) {
        return res.status(400).json({
          error: `Menu item #${menuItemId} is no longer on the menu.`,
        });
      }

      if (dbItem.is_available !== 1 || (dbItem.stock_quantity ?? 0) <= 0) {
        return res.status(400).json({
          error: `"${dbItem.name}" is currently sold out. Please remove it from your bag before ordering.`,
        });
      }

      if (quantity > dbItem.stock_quantity) {
        return res.status(400).json({
          error: `Only ${dbItem.stock_quantity} portion${dbItem.stock_quantity === 1 ? '' : 's'} of "${dbItem.name}" left in stock.`,
        });
      }

      resolvedLines.push({
        menuItemId: dbItem.id,
        name: dbItem.name,
        unitPriceCents: dbItem.price_cents,
        quantity,
        lineTotalCents: dbItem.price_cents * quantity,
      });
    }

    // Independently calculate totals on server
    const totals = calculateOrderTotals(
      resolvedLines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity })),
      input.fulfillmentType
    );

    if (input.paymentMethod === 'PAYSTACK') {
      try {
        await paymentService.verifyPaystackTransaction({
          db,
          reference: input.paymentReference,
          verificationToken: input.paymentVerificationToken,
          userId: req.user!.id,
          expectedAmountCents: totals.totalCents,
        });
      } catch (err) {
        if (err instanceof PaymentServiceError) {
          return res.status(err.statusCode).json({ error: err.message, code: err.code });
        }
        return res.status(400).json({
          error: 'Unable to verify Paystack payment.',
        });
      }
    }

    try {
      db.exec('BEGIN IMMEDIATE');

      const now = new Date().toISOString();
      const deductStock = db.prepare(
        `UPDATE menu_items
         SET stock_quantity = stock_quantity - ?,
             is_available = CASE WHEN (stock_quantity - ?) <= 0 THEN 0 ELSE is_available END,
             updated_at = ?
         WHERE id = ? AND is_deleted = 0 AND is_available = 1 AND stock_quantity >= ?`
      );

      // Atomically verify & deduct inventory inside the write lock before committing
      for (const line of resolvedLines) {
        const result = deductStock.run(
          line.quantity,
          line.quantity,
          now,
          line.menuItemId,
          line.quantity
        );
        if (result.changes !== 1) {
          const freshItem = selectItem.get(line.menuItemId) as
            | { is_available: number; stock_quantity: number; is_deleted: number }
            | undefined;
          db.exec('ROLLBACK');
          if (!freshItem || freshItem.is_deleted === 1 || freshItem.is_available !== 1 || freshItem.stock_quantity <= 0) {
            return res.status(400).json({
              error: `"${line.name}" is now sold out. Please review your bag.`,
            });
          }
          return res.status(400).json({
            error: `Only ${freshItem.stock_quantity} portion${freshItem.stock_quantity === 1 ? '' : 's'} of "${line.name}" left in stock.`,
          });
        }
      }

      let orderReference = generateOrderReference();
      while (db.prepare('SELECT id FROM orders WHERE order_reference = ?').get(orderReference)) {
        orderReference = generateOrderReference();
      }

      const paymentStatus =
        input.paymentMethod === 'PAYSTACK' ? 'PAID_PAYSTACK' : 'PENDING_COLLECTION';

      const paymentReference = input.paymentMethod === 'PAYSTACK' ? input.paymentReference : '';

      const orderInsert = db
        .prepare(
          `INSERT INTO orders (
            order_reference, customer_id, customer_name, customer_email, customer_phone,
            fulfillment_type, delivery_address, order_notes, payment_method, payment_status,
            payment_reference, status, subtotal_cents, delivery_fee_cents, tax_cents, total_cents,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?)`
        )
        .run(
          orderReference,
          req.user!.id,
          input.customerName,
          input.customerEmail,
          input.customerPhone,
          input.fulfillmentType,
          input.fulfillmentType === 'DELIVERY' ? input.deliveryAddress : '',
          input.orderNotes || '',
          input.paymentMethod,
          paymentStatus,
          paymentReference,
          totals.subtotalCents,
          totals.deliveryFeeCents,
          totals.taxCents,
          totals.totalCents,
          now,
          now
        );

      const orderId = Number(orderInsert.lastInsertRowid);
      const insertOrderItem = db.prepare(
        `INSERT INTO order_items (
          order_id, menu_item_id, item_name, unit_price_cents, quantity, line_total_cents
        ) VALUES (?, ?, ?, ?, ?, ?)`
      );

      for (const line of resolvedLines) {
        insertOrderItem.run(
          orderId,
          line.menuItemId,
          line.name,
          line.unitPriceCents,
          line.quantity,
          line.lineTotalCents
        );
      }

      if (input.paymentMethod === 'PAYSTACK') {
        paymentService.attachOrderToTransaction(db, input.paymentReference, orderId);
      }

      db.exec('COMMIT');

      const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      return res.status(201).json({
        order: formatOrderWithItems(db, createdOrder),
      });
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignore rollback error if transaction wasn't active
      }
      console.error('Order creation failed:', err);
      return res.status(500).json({
        error: 'Unable to complete your order right now. Please try again.',
      });
    }
  });

  router.get('/', requireAuth, (req: AuthRequest, res) => {
    const rows = db
      .prepare(`SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC, id DESC`)
      .all(req.user!.id);

    return res.json({
      orders: rows.map((row) => formatOrderWithItems(db, row)),
    });
  });

  router.get('/:reference', requireAuth, (req: AuthRequest, res) => {
    const reference = String(req.params.reference || '').trim();
    if (!reference || reference.length > 40) {
      return res.status(400).json({ error: 'Invalid order reference.' });
    }

    const row = db
      .prepare('SELECT * FROM orders WHERE order_reference = ?')
      .get(reference) as any | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (row.customer_id !== req.user!.id && req.user!.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'You do not have permission to view this order.',
      });
    }

    return res.json({ order: formatOrderWithItems(db, row) });
  });

  return router;
}
