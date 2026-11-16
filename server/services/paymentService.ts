import crypto from 'node:crypto';
import type { AppDatabase } from '../db/database.ts';

export class PaymentServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 400, code = 'PAYMENT_ERROR') {
    super(message);
    this.name = 'PaymentServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface PaymentVerificationTokenPayload {
  reference: string;
  userId: number;
  amountCents: number;
  currency: string;
  expiresAt: string;
  nonce: string;
}

export interface InitializePaystackInput {
  db: AppDatabase;
  userId: number;
  email: string;
  amountCents: number;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializePaystackResult {
  reference: string;
  accessCode: string;
  authorizationUrl: string;
  verificationToken: string;
  amountCents: number;
  currency: string;
  publicKey: string | null;
  expiresAt: string;
}

export interface VerifyPaystackInput {
  db: AppDatabase;
  reference: string;
  verificationToken: string;
  userId: number;
  expectedAmountCents: number;
}

export interface VerifiedPaystackTransaction {
  reference: string;
  transactionId: string;
  channel: string;
  amountCents: number;
  currency: string;
  paidAt: string;
  verifiedAt: string;
}

export interface PaymentServiceOptions {
  secretKey?: string;
  publicKey?: string;
  currency?: string;
  tokenSigningSecret?: string;
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  tokenTtlMs?: number;
}

function isPlaceholderKey(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.includes('your_paystack') ||
    lower.includes('placeholder') ||
    lower === 'sk_test_xxx' ||
    lower === 'pk_test_xxx'
  );
}

export function hashVerificationToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function normalizePaystackCurrency(raw?: string): string {
  const cleaned = (raw ?? '').trim().toUpperCase();
  if (!cleaned || cleaned === 'NAIRA' || cleaned === '₦') {
    return 'NGN';
  }
  return cleaned;
}

export class PaymentService {
  private readonly secretKey: string;
  private readonly publicKey: string;
  private readonly currency: string;
  private readonly tokenSigningSecret: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly tokenTtlMs: number;

  constructor(options: PaymentServiceOptions = {}) {
    this.secretKey = (options.secretKey ?? process.env.PAYSTACK_SECRET_KEY ?? '').trim();
    this.publicKey = (
      options.publicKey ??
      process.env.PAYSTACK_PUBLIC_KEY ??
      process.env.VITE_PAYSTACK_PUBLIC_KEY ??
      ''
    ).trim();
    this.currency = normalizePaystackCurrency(
      options.currency ?? process.env.PAYSTACK_CURRENCY ?? 'NGN'
    );
    this.tokenSigningSecret =
      options.tokenSigningSecret ??
      process.env.PAYMENT_TOKEN_SECRET ??
      process.env.SESSION_SECRET ??
      this.secretKey ??
      'dev-only-payment-token-secret-change-in-production';
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.paystack.co').replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.tokenTtlMs = options.tokenTtlMs ?? 15 * 60 * 1000;
  }

  isConfigured(): boolean {
    return !isPlaceholderKey(this.secretKey);
  }

  getPublicConfig() {
    return {
      provider: 'PAYSTACK' as const,
      paystackConfigured: this.isConfigured(),
      publicKey: isPlaceholderKey(this.publicKey) ? null : this.publicKey,
      currency: this.currency,
    };
  }

  private signPayload(encodedPayload: string): string {
    return crypto
      .createHmac('sha256', this.tokenSigningSecret)
      .update(encodedPayload, 'utf8')
      .digest('base64url');
  }

  issueVerificationToken(
    input: Omit<PaymentVerificationTokenPayload, 'nonce'>
  ): string {
    const payload: PaymentVerificationTokenPayload = {
      ...input,
      currency: input.currency.toUpperCase(),
      nonce: crypto.randomBytes(12).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.signPayload(encoded);
    return `${encoded}.${signature}`;
  }

  verifyVerificationToken(
    token: string,
    expected: {
      reference: string;
      userId: number;
      amountCents: number;
      currency?: string;
    }
  ): PaymentVerificationTokenPayload {
    if (!token || typeof token !== 'string') {
      throw new PaymentServiceError(
        'Missing payment verification token.',
        400,
        'MISSING_VERIFICATION_TOKEN'
      );
    }

    const parts = token.trim().split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new PaymentServiceError(
        'Malformed payment verification token.',
        400,
        'MALFORMED_VERIFICATION_TOKEN'
      );
    }

    const [encodedPayload, providedSig] = parts;
    const expectedSig = this.signPayload(encodedPayload);

    const providedBuf = Buffer.from(providedSig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new PaymentServiceError(
        'Invalid payment verification token signature.',
        403,
        'INVALID_VERIFICATION_TOKEN'
      );
    }

    let payload: PaymentVerificationTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8')
      ) as PaymentVerificationTokenPayload;
    } catch {
      throw new PaymentServiceError(
        'Unreadable payment verification token payload.',
        400,
        'MALFORMED_VERIFICATION_TOKEN'
      );
    }

    if (
      !payload ||
      typeof payload.reference !== 'string' ||
      typeof payload.userId !== 'number' ||
      typeof payload.amountCents !== 'number' ||
      typeof payload.currency !== 'string' ||
      typeof payload.expiresAt !== 'string'
    ) {
      throw new PaymentServiceError(
        'Incomplete payment verification token payload.',
        400,
        'INVALID_VERIFICATION_TOKEN'
      );
    }

    const expiresMs = Date.parse(payload.expiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
      throw new PaymentServiceError(
        'Payment verification token has expired. Please restart Paystack checkout.',
        401,
        'EXPIRED_VERIFICATION_TOKEN'
      );
    }

    if (payload.userId !== expected.userId) {
      throw new PaymentServiceError(
        'Payment verification token does not belong to the authenticated customer.',
        403,
        'TOKEN_OWNER_MISMATCH'
      );
    }

    if (payload.reference !== expected.reference) {
      throw new PaymentServiceError(
        'Payment verification token does not match the payment reference.',
        400,
        'TOKEN_REFERENCE_MISMATCH'
      );
    }

    if (payload.amountCents !== expected.amountCents) {
      throw new PaymentServiceError(
        'Payment verification token amount does not match the server-computed order total.',
        400,
        'TOKEN_AMOUNT_MISMATCH'
      );
    }

    const expectedCurrency = (expected.currency ?? this.currency).toUpperCase();
    if (payload.currency.toUpperCase() !== expectedCurrency) {
      throw new PaymentServiceError(
        'Payment verification token currency mismatch.',
        400,
        'TOKEN_CURRENCY_MISMATCH'
      );
    }

    return payload;
  }

  async initializePaystackTransaction(
    input: InitializePaystackInput
  ): Promise<InitializePaystackResult> {
    if (!this.isConfigured()) {
      throw new PaymentServiceError(
        'Paystack is not configured on this server. Set PAYSTACK_SECRET_KEY in environment variables to enable live Paystack payments.',
        503,
        'PAYSTACK_NOT_CONFIGURED'
      );
    }

    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new PaymentServiceError('Invalid payment amount.', 400, 'INVALID_AMOUNT');
    }

    const reference = `PSK-${Date.now().toString(36).toUpperCase()}-${crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase()}`;

    const requestBody: Record<string, unknown> = {
      email: input.email,
      amount: input.amountCents,
      currency: this.currency,
      reference,
      metadata: {
        userId: input.userId,
        ...(input.metadata ?? {}),
      },
    };
    if (input.callbackUrl) {
      requestBody.callback_url = input.callbackUrl;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
    } catch {
      throw new PaymentServiceError(
        'Unable to reach Paystack payment gateway. Please try again shortly.',
        502,
        'PAYSTACK_NETWORK_ERROR'
      );
    }

    const json = (await response.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: {
        authorization_url?: string;
        access_code?: string;
        reference?: string;
      };
    } | null;

    if (!response.ok || !json?.status || !json.data?.access_code || !json.data?.authorization_url) {
      throw new PaymentServiceError(
        json?.message || 'Paystack rejected transaction initialization.',
        response.status >= 400 && response.status < 500 ? 400 : 502,
        'PAYSTACK_INIT_FAILED'
      );
    }

    const resolvedReference = json.data.reference || reference;
    const expiresAt = new Date(Date.now() + this.tokenTtlMs).toISOString();
    const verificationToken = this.issueVerificationToken({
      reference: resolvedReference,
      userId: input.userId,
      amountCents: input.amountCents,
      currency: this.currency,
      expiresAt,
    });
    const tokenHash = hashVerificationToken(verificationToken);
    const now = new Date().toISOString();

    input.db
      .prepare(
        `INSERT INTO payment_transactions (
          reference, user_id, provider, amount_cents, currency, verification_token_hash,
          paystack_access_code, paystack_authorization_url, gateway_status, expires_at,
          created_at, updated_at
        ) VALUES (?, ?, 'PAYSTACK', ?, ?, ?, ?, ?, 'INITIALIZED', ?, ?, ?)`
      )
      .run(
        resolvedReference,
        input.userId,
        input.amountCents,
        this.currency,
        tokenHash,
        json.data.access_code,
        json.data.authorization_url,
        expiresAt,
        now,
        now
      );

    return {
      reference: resolvedReference,
      accessCode: json.data.access_code,
      authorizationUrl: json.data.authorization_url,
      verificationToken,
      amountCents: input.amountCents,
      currency: this.currency,
      publicKey: isPlaceholderKey(this.publicKey) ? null : this.publicKey,
      expiresAt,
    };
  }

  async verifyPaystackTransaction(
    input: VerifyPaystackInput
  ): Promise<VerifiedPaystackTransaction> {
    if (!this.isConfigured()) {
      throw new PaymentServiceError(
        'Paystack is not configured on this server. Set PAYSTACK_SECRET_KEY in environment variables.',
        503,
        'PAYSTACK_NOT_CONFIGURED'
      );
    }

    // 1. Validate HMAC signature, expiration, owner, reference, amount, and currency
    this.verifyVerificationToken(input.verificationToken, {
      reference: input.reference,
      userId: input.userId,
      amountCents: input.expectedAmountCents,
      currency: this.currency,
    });

    // 2. Verify stored transaction record & prevent replay attacks
    const txRow = input.db
      .prepare('SELECT * FROM payment_transactions WHERE reference = ?')
      .get(input.reference) as
      | {
          id: number;
          reference: string;
          order_id: number | null;
          user_id: number;
          amount_cents: number;
          currency: string;
          verification_token_hash: string;
          gateway_status: string;
          expires_at: string;
        }
      | undefined;

    if (!txRow) {
      throw new PaymentServiceError(
        'Payment transaction record not found on server.',
        400,
        'PAYMENT_RECORD_NOT_FOUND'
      );
    }

    if (txRow.user_id !== input.userId) {
      throw new PaymentServiceError(
        'You are not authorized to verify this payment reference.',
        403,
        'PAYMENT_OWNER_MISMATCH'
      );
    }

    if (txRow.order_id !== null) {
      throw new PaymentServiceError(
        'This Paystack payment reference has already been used for an order.',
        409,
        'PAYMENT_ALREADY_CONSUMED'
      );
    }

    const providedHash = Buffer.from(hashVerificationToken(input.verificationToken), 'utf8');
    const storedHash = Buffer.from(txRow.verification_token_hash, 'utf8');
    if (
      providedHash.length !== storedHash.length ||
      !crypto.timingSafeEqual(providedHash, storedHash)
    ) {
      throw new PaymentServiceError(
        'Payment verification token does not match the initialized transaction.',
        403,
        'TOKEN_HASH_MISMATCH'
      );
    }

    if (txRow.amount_cents !== input.expectedAmountCents) {
      throw new PaymentServiceError(
        'Initialized payment amount does not match the current order total.',
        400,
        'PAYMENT_AMOUNT_MISMATCH'
      );
    }

    // 3. Authoritative server-to-server verification with Paystack API
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.apiBaseUrl}/transaction/verify/${encodeURIComponent(input.reference)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );
    } catch {
      throw new PaymentServiceError(
        'Unable to verify payment with Paystack right now. Please try again.',
        502,
        'PAYSTACK_VERIFY_NETWORK_ERROR'
      );
    }

    const json = (await response.json().catch(() => null)) as {
      status?: boolean;
      message?: string;
      data?: {
        id?: number | string;
        status?: string;
        reference?: string;
        amount?: number;
        currency?: string;
        channel?: string;
        paid_at?: string;
      };
    } | null;

    if (!response.ok || !json?.status || !json.data) {
      throw new PaymentServiceError(
        json?.message || 'Paystack could not verify this transaction.',
        400,
        'PAYSTACK_VERIFY_FAILED'
      );
    }

    if (json.data.status !== 'success') {
      input.db
        .prepare(`UPDATE payment_transactions SET gateway_status = ?, updated_at = ? WHERE id = ?`)
        .run(String(json.data.status || 'failed').toUpperCase(), new Date().toISOString(), txRow.id);

      throw new PaymentServiceError(
        `Paystack transaction is not completed (status: ${json.data.status || 'unknown'}).`,
        400,
        'PAYMENT_NOT_SUCCESSFUL'
      );
    }

    if (json.data.reference !== input.reference) {
      throw new PaymentServiceError(
        'Paystack returned a mismatched transaction reference.',
        400,
        'PAYSTACK_REFERENCE_MISMATCH'
      );
    }

    if (Number(json.data.amount) !== input.expectedAmountCents) {
      throw new PaymentServiceError(
        'Verified Paystack amount does not match the order total.',
        400,
        'PAYSTACK_AMOUNT_MISMATCH'
      );
    }

    if (String(json.data.currency || '').toUpperCase() !== this.currency) {
      throw new PaymentServiceError(
        'Verified Paystack currency does not match store currency.',
        400,
        'PAYSTACK_CURRENCY_MISMATCH'
      );
    }

    const now = new Date().toISOString();
    const paidAt = json.data.paid_at || now;
    const transactionId = String(json.data.id ?? '');
    const channel = String(json.data.channel ?? 'card');

    input.db
      .prepare(
        `UPDATE payment_transactions
         SET gateway_status = 'success',
             gateway_transaction_id = ?,
             channel = ?,
             paid_at = ?,
             verified_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(transactionId, channel, paidAt, now, now, txRow.id);

    return {
      reference: input.reference,
      transactionId,
      channel,
      amountCents: input.expectedAmountCents,
      currency: this.currency,
      paidAt,
      verifiedAt: now,
    };
  }

  attachOrderToTransaction(db: AppDatabase, reference: string, orderId: number): void {
    db.prepare(
      `UPDATE payment_transactions SET order_id = ?, updated_at = ? WHERE reference = ?`
    ).run(orderId, new Date().toISOString(), reference);
  }

  verifyWebhookSignature(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
    if (!this.isConfigured() || !signatureHeader) {
      return false;
    }
    const expected = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const providedBuf = Buffer.from(signatureHeader.trim().toLowerCase(), 'utf8');
    if (expectedBuf.length !== providedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  handleWebhookEvent(db: AppDatabase, eventBody: any): boolean {
    if (eventBody?.event !== 'charge.success' || !eventBody?.data?.reference) {
      return false;
    }

    const reference = String(eventBody.data.reference);
    const txRow = db
      .prepare('SELECT id, amount_cents, currency FROM payment_transactions WHERE reference = ?')
      .get(reference) as { id: number; amount_cents: number; currency: string } | undefined;

    if (!txRow) {
      return false;
    }

    if (
      Number(eventBody.data.amount) !== txRow.amount_cents ||
      String(eventBody.data.currency || '').toUpperCase() !== txRow.currency
    ) {
      return false;
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE payment_transactions
       SET gateway_status = 'success',
           gateway_transaction_id = ?,
           channel = ?,
           paid_at = COALESCE(paid_at, ?),
           verified_at = COALESCE(verified_at, ?),
           updated_at = ?
       WHERE id = ?`
    ).run(
      String(eventBody.data.id ?? ''),
      String(eventBody.data.channel ?? 'card'),
      String(eventBody.data.paid_at || now),
      now,
      now,
      txRow.id
    );

    return true;
  }
}
