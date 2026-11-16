import { Router, type Request } from 'express';
import type { AppDatabase } from '../db/database.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import { createOrderSchema, paystackVerifySchema } from '../domain/validation.ts';
import { calculateOrderTotals } from '../domain/orders.ts';
import { PaymentService, PaymentServiceError } from '../services/paymentService.ts';

export function createPaymentsRouter(db: AppDatabase, paymentService: PaymentService) {
  const router = Router();

  router.get('/config', (_req, res) => {
    return res.json(paymentService.getPublicConfig());
  });

  router.post('/paystack/initialize', requireAuth, async (req: AuthRequest, res) => {
    const parsed = createOrderSchema.safeParse({
      ...req.body,
      paymentMethod: 'PAYSTACK',
      // Placeholder reference/token for pre-initialization validation only
      paymentReference: 'INIT-PENDING',
      paymentVerificationToken: 'INIT-PENDING-TOKEN-PLACEHOLDER',
    });

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Please check your order details before paying.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    }

    const input = parsed.data;
    const mergedQuantities = new Map<number, number>();
    for (const line of input.items) {
      const nextQty = (mergedQuantities.get(line.menuItemId) || 0) + line.quantity;
      if (nextQty > 50) {
        return res.status(400).json({ error: 'Maximum quantity per item is 50.' });
      }
      mergedQuantities.set(line.menuItemId, nextQty);
    }

    const selectItem = db.prepare(
      'SELECT id, name, price_cents, is_available, is_deleted FROM menu_items WHERE id = ?'
    );

    const pricedLines: Array<{ unitPriceCents: number; quantity: number }> = [];
    for (const [menuItemId, quantity] of mergedQuantities.entries()) {
      const dbItem = selectItem.get(menuItemId) as
        | {
            id: number;
            name: string;
            price_cents: number;
            is_available: number;
            is_deleted: number;
          }
        | undefined;

      if (!dbItem || dbItem.is_deleted === 1) {
        return res.status(400).json({
          error: `Menu item #${menuItemId} is no longer on the menu.`,
        });
      }
      if (dbItem.is_available !== 1) {
        return res.status(400).json({
          error: `"${dbItem.name}" is currently unavailable. Please remove it from your bag before paying.`,
        });
      }
      pricedLines.push({ unitPriceCents: dbItem.price_cents, quantity });
    }

    const totals = calculateOrderTotals(pricedLines, input.fulfillmentType);

    const origin =
      req.headers.origin ||
      process.env.APP_URL ||
      `${req.protocol}://${req.get('host')}`;
    const callbackUrl = origin ? `${origin.replace(/\/+$/, '')}/checkout` : undefined;

    try {
      const initialized = await paymentService.initializePaystackTransaction({
        db,
        userId: req.user!.id,
        email: input.customerEmail,
        amountCents: totals.totalCents,
        callbackUrl,
        metadata: {
          customerName: input.customerName,
          fulfillmentType: input.fulfillmentType,
          subtotalCents: totals.subtotalCents,
          deliveryFeeCents: totals.deliveryFeeCents,
          taxCents: totals.taxCents,
        },
      });

      return res.status(201).json(initialized);
    } catch (err) {
      if (err instanceof PaymentServiceError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.error('Paystack initialization error:', err);
      return res.status(500).json({
        error: 'Unable to initialize Paystack payment. Please try again.',
      });
    }
  });

  router.post('/paystack/verify', requireAuth, async (req: AuthRequest, res) => {
    const parsed = paystackVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid verification payload.',
      });
    }

    const txRow = db
      .prepare('SELECT amount_cents FROM payment_transactions WHERE reference = ? AND user_id = ?')
      .get(parsed.data.reference, req.user!.id) as { amount_cents: number } | undefined;

    if (!txRow) {
      return res.status(404).json({ error: 'Payment transaction record not found.' });
    }

    try {
      const verified = await paymentService.verifyPaystackTransaction({
        db,
        reference: parsed.data.reference,
        verificationToken: parsed.data.verificationToken,
        userId: req.user!.id,
        expectedAmountCents: txRow.amount_cents,
      });

      return res.json({ verified });
    } catch (err) {
      if (err instanceof PaymentServiceError) {
        return res.status(err.statusCode).json({ error: err.message, code: err.code });
      }
      console.error('Paystack verification error:', err);
      return res.status(500).json({
        error: 'Unable to verify Paystack transaction.',
      });
    }
  });

  router.post('/paystack/webhook', (req: Request & { rawBody?: Buffer }, res) => {
    const signature = req.headers['x-paystack-signature'];
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');

    if (
      typeof signature !== 'string' ||
      !paymentService.verifyWebhookSignature(rawBody, signature)
    ) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    paymentService.handleWebhookEvent(db, req.body);
    return res.status(200).json({ received: true });
  });

  return router;
}
