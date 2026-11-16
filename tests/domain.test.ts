import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateOrderTotals,
  canTransitionOrderStatus,
  DELIVERY_FEE_CENTS,
  generateOrderReference,
  getAllowedNextStatuses,
} from '../server/domain/orders.ts';
import { PaymentService, PaymentServiceError } from '../server/services/paymentService.ts';

test('calculateOrderTotals computes subtotal, delivery fee below threshold, 8% tax, and total', () => {
  const totals = calculateOrderTotals(
    [
      { unitPriceCents: 2400, quantity: 1 },
      { unitPriceCents: 1800, quantity: 2 },
    ],
    'DELIVERY'
  );
  // Subtotal = 2400 + 3600 = 6000 (< 8500 -> delivery fee 550)
  // Tax = Math.round(6000 * 0.08) = 480
  // Total = 6000 + 550 + 480 = 7030
  assert.equal(totals.subtotalCents, 6000);
  assert.equal(totals.deliveryFeeCents, DELIVERY_FEE_CENTS);
  assert.equal(totals.taxCents, 480);
  assert.equal(totals.totalCents, 7030);
});

test('calculateOrderTotals waives delivery fee at or above $85 threshold and for collection', () => {
  const freeDelivery = calculateOrderTotals([{ unitPriceCents: 9000, quantity: 1 }], 'DELIVERY');
  assert.equal(freeDelivery.deliveryFeeCents, 0);

  const collection = calculateOrderTotals([{ unitPriceCents: 2400, quantity: 1 }], 'COLLECTION');
  assert.equal(collection.deliveryFeeCents, 0);
});

test('calculateOrderTotals rejects empty items or invalid quantities/prices', () => {
  assert.throws(() => calculateOrderTotals([], 'DELIVERY'));
  assert.throws(() => calculateOrderTotals([{ unitPriceCents: -100, quantity: 1 }], 'DELIVERY'));
  assert.throws(() => calculateOrderTotals([{ unitPriceCents: 1000, quantity: 0 }], 'DELIVERY'));
  assert.throws(() => calculateOrderTotals([{ unitPriceCents: 1000, quantity: 51 }], 'DELIVERY'));
});

test('canTransitionOrderStatus enforces valid workflow and blocks backward/terminal transitions', () => {
  assert.equal(canTransitionOrderStatus('Pending', 'Confirmed'), true);
  assert.equal(canTransitionOrderStatus('Pending', 'Cancelled'), true);
  assert.equal(canTransitionOrderStatus('Pending', 'Completed'), false);
  assert.equal(canTransitionOrderStatus('Confirmed', 'Preparing'), true);
  assert.equal(canTransitionOrderStatus('Preparing', 'Ready'), true);
  assert.equal(canTransitionOrderStatus('Ready', 'Completed'), true);
  assert.equal(canTransitionOrderStatus('Completed', 'Pending'), false);
  assert.equal(canTransitionOrderStatus('Cancelled', 'Confirmed'), false);
  assert.deepEqual(getAllowedNextStatuses('Completed'), []);
  assert.deepEqual(getAllowedNextStatuses('Cancelled'), []);
});

test('generateOrderReference creates SAV- prefixed 10-char reference', () => {
  const ref = generateOrderReference();
  assert.match(ref, /^SAV-[A-Z0-9]{6}$/);
});

test('PaymentService validates signed verification tokens and rejects tampering, expiry, wrong user, and amount mismatches', () => {
  const svc = new PaymentService({
    secretKey: 'sk_test_unit_secret_key',
    publicKey: 'pk_test_unit_public_key',
    tokenSigningSecret: 'unit-test-hmac-secret',
    currency: 'USD',
  });

  const futureExpiry = new Date(Date.now() + 60_000).toISOString();
  const token = svc.issueVerificationToken({
    reference: 'PSK-UNIT-001',
    userId: 7,
    amountCents: 5400,
    currency: 'USD',
    expiresAt: futureExpiry,
  });

  const verified = svc.verifyVerificationToken(token, {
    reference: 'PSK-UNIT-001',
    userId: 7,
    amountCents: 5400,
    currency: 'USD',
  });
  assert.equal(verified.reference, 'PSK-UNIT-001');
  assert.equal(verified.amountCents, 5400);

  // Tampered signature
  const tampered = `${token.slice(0, -4)}AAAA`;
  assert.throws(
    () =>
      svc.verifyVerificationToken(tampered, {
        reference: 'PSK-UNIT-001',
        userId: 7,
        amountCents: 5400,
      }),
    PaymentServiceError
  );

  // Wrong owner
  assert.throws(
    () =>
      svc.verifyVerificationToken(token, {
        reference: 'PSK-UNIT-001',
        userId: 99,
        amountCents: 5400,
      }),
    /does not belong/
  );

  // Wrong amount
  assert.throws(
    () =>
      svc.verifyVerificationToken(token, {
        reference: 'PSK-UNIT-001',
        userId: 7,
        amountCents: 100,
      }),
    /amount does not match/
  );

  // Expired token
  const expiredToken = svc.issueVerificationToken({
    reference: 'PSK-UNIT-002',
    userId: 7,
    amountCents: 5400,
    currency: 'USD',
    expiresAt: new Date(Date.now() - 5_000).toISOString(),
  });
  assert.throws(
    () =>
      svc.verifyVerificationToken(expiredToken, {
        reference: 'PSK-UNIT-002',
        userId: 7,
        amountCents: 5400,
      }),
    /expired/
  );
});

test('PaymentService verifies Paystack HMAC-SHA512 webhook signatures safely', () => {
  const secretKey = 'sk_test_webhook_secret';
  const svc = new PaymentService({ secretKey });
  const rawBody = Buffer.from(
    JSON.stringify({ event: 'charge.success', data: { reference: 'PSK-123' } }),
    'utf8'
  );
  const validSig = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');

  assert.equal(svc.verifyWebhookSignature(rawBody, validSig), true);
  assert.equal(svc.verifyWebhookSignature(rawBody, '0'.repeat(validSig.length)), false);
  assert.equal(svc.verifyWebhookSignature(rawBody, undefined), false);
});

