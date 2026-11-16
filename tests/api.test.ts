import crypto from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createDatabase, type AppDatabase } from '../server/db/database.ts';
import { seedDatabase, SEED_PASSWORDS } from '../server/db/seed.ts';
import { createApp } from '../server/app.ts';
import { PaymentService } from '../server/services/paymentService.ts';

function setupTestEnv(authRateLimitMax = 50, paymentService?: PaymentService) {
  const db: AppDatabase = createDatabase(':memory:');
  seedDatabase(db);
  const app = createApp(db, { authRateLimitMax, paymentService });
  return { db, app };
}

async function loginAs(app: any, email: string, password: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  return { agent, res, csrfToken: res.body.csrfToken as string };
}

describe('Savoria Full-Stack Restaurant API, Security & DB Integration Tests', () => {
  let db: AppDatabase;
  let app: any;

  beforeEach(() => {
    const setup = setupTestEnv();
    db = setup.db;
    app = setup.app;
  });

  describe('1. Menu & Filtering (Functional + SQLi Guard)', () => {
    it('lists seeded categories and menu items including unavailable status', async () => {
      const catRes = await request(app).get('/api/categories');
      expect(catRes.status).toBe(200);
      expect(catRes.body.categories.length).toBeGreaterThanOrEqual(5);

      const menuRes = await request(app).get('/api/menu');
      expect(menuRes.status).toBe(200);
      expect(menuRes.body.items.length).toBeGreaterThanOrEqual(10);
      const unavailable = menuRes.body.items.find((i: any) => !i.isAvailable);
      expect(unavailable).toBeDefined();
    });

    it('filters menu by search query and category slug', async () => {
      const searchRes = await request(app).get('/api/menu?search=Wagyu');
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.items.some((i: any) => i.name.includes('Wagyu'))).toBe(true);

      const catRes = await request(app).get('/api/menu?category=patisserie-desserts');
      expect(catRes.status).toBe(200);
      expect(catRes.body.items.every((i: any) => i.categorySlug === 'patisserie-desserts')).toBe(true);
    });

    it('neutralizes SQL injection attempts in search and menu item ID params', async () => {
      const sqliSearch = await request(app).get(
        `/api/menu?search=${encodeURIComponent("' OR '1'='1'; DROP TABLE users; --")}`
      );
      expect(sqliSearch.status).toBe(200);
      expect(sqliSearch.body.items.length).toBe(0);

      const usersCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
      expect(usersCount.c).toBeGreaterThanOrEqual(3);

      const badId = await request(app).get('/api/menu/1%20OR%201=1');
      expect(badId.status).toBe(400);
    });
  });

  describe('2. Authentication, Password Hashing, Session Security & Rate Limiting', () => {
    it('registers a customer, hashes password, enforces CUSTOMER role (blocks privilege escalation), and sets HTTP-only cookie', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Clara Monet',
        email: 'clara@example.com',
        password: 'Password123!',
        role: 'ADMIN', // Privilege escalation attempt must be ignored
      });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('CUSTOMER');
      expect(res.body.user.password_hash).toBeUndefined();
      expect(res.body.csrfToken).toBeTruthy();

      const setCookie = res.headers['set-cookie']?.[0] || '';
      expect(setCookie).toContain('savoria_sid=');
      expect(setCookie.toLowerCase()).toContain('httponly');

      const dbUser = db
        .prepare('SELECT password_hash FROM users WHERE email = ?')
        .get('clara@example.com') as { password_hash: string };
      expect(dbUser.password_hash).not.toBe('Password123!');
      expect(dbUser.password_hash.startsWith('$2')).toBe(true);
    });

    it('rejects duplicate registration with 409', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Duplicate Guest',
        email: 'guest@savoria.com',
        password: 'Password123!',
      });
      expect(res.status).toBe(409);
    });

    it('rejects wrong password, logs in valid credentials, and destroys session on logout', async () => {
      const bad = await request(app).post('/api/auth/login').send({
        email: 'guest@savoria.com',
        password: 'WrongPassword99',
      });
      expect(bad.status).toBe(401);

      const { agent, res, csrfToken } = await loginAs(
        app,
        'guest@savoria.com',
        SEED_PASSWORDS.customer
      );
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('guest@savoria.com');

      const meBefore = await agent.get('/api/auth/me');
      expect(meBefore.body.user.email).toBe('guest@savoria.com');

      const logoutRes = await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', csrfToken);
      expect(logoutRes.status).toBe(200);

      const meAfter = await agent.get('/api/auth/me');
      expect(meAfter.body.user).toBeNull();
    });

    it('rejects expired sessions automatically', async () => {
      const { agent } = await loginAs(app, 'guest@savoria.com', SEED_PASSWORDS.customer);
      db.prepare("UPDATE sessions SET expires_at = '2020-01-01T00:00:00.000Z'").run();

      const profileRes = await agent.get('/api/profile');
      expect(profileRes.status).toBe(401);
    });

    it('enforces login rate limiting after repeated failed attempts', async () => {
      const limitedSetup = setupTestEnv(3);
      for (let i = 0; i < 3; i++) {
        const res = await request(limitedSetup.app)
          .post('/api/auth/login')
          .send({ email: 'guest@savoria.com', password: 'WrongPassword1' });
        expect(res.status).toBe(401);
      }
      const blocked = await request(limitedSetup.app)
        .post('/api/auth/login')
        .send({ email: 'guest@savoria.com', password: 'WrongPassword1' });
      expect(blocked.status).toBe(429);
    });
  });

  describe('3. CSRF, Input Validation & XSS Protection', () => {
    it('blocks state-changing cookie requests without valid X-CSRF-Token', async () => {
      const { agent } = await loginAs(app, 'guest@savoria.com', SEED_PASSWORDS.customer);
      const res = await agent.patch('/api/profile').send({
        name: 'Julian Vance',
        phone: '+1 415 555 0000',
        defaultAddress: '123 Main St',
      });
      expect(res.status).toBe(403);
    });

    it('rejects XSS script injection payloads in inputs', async () => {
      const { agent, csrfToken } = await loginAs(
        app,
        'guest@savoria.com',
        SEED_PASSWORDS.customer
      );
      const res = await agent
        .patch('/api/profile')
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: '<script>alert(1)</script>',
          phone: '555-0100',
          defaultAddress: '100 Market St',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('4. Shopping Cart Checkout, Server Price Integrity & Order Workflow', () => {
    it('independently calculates prices on server (ignores client-tampered totals), rejects removed SIMULATED_CARD, and persists order', async () => {
      const { agent, csrfToken } = await loginAs(
        app,
        'guest@savoria.com',
        SEED_PASSWORDS.customer
      );

      const menuRes = await request(app).get('/api/menu');
      const burrata = menuRes.body.items.find((i: any) =>
        i.name.includes('Black Truffle & Fig Burrata')
      );

      const rejectedSimulated = await agent
        .post('/api/orders')
        .set('X-CSRF-Token', csrfToken)
        .send({
          items: [{ menuItemId: burrata.id, quantity: 1 }],
          customerName: 'Julian Vance',
          customerEmail: 'guest@savoria.com',
          customerPhone: '+1 (415) 555-0148',
          fulfillmentType: 'DELIVERY',
          deliveryAddress: '782 Pacific Heights Blvd, Apt 4B',
          paymentMethod: 'SIMULATED_CARD',
        });
      expect(rejectedSimulated.status).toBe(400);

      const orderRes = await agent
        .post('/api/orders')
        .set('X-CSRF-Token', csrfToken)
        .send({
          items: [{ menuItemId: burrata.id, quantity: 2, priceCents: 1 }], // attempted price tamper
          totalCents: 1, // attempted total tamper
          customerName: 'Julian Vance',
          customerEmail: 'guest@savoria.com',
          customerPhone: '+1 (415) 555-0148',
          fulfillmentType: 'COLLECTION',
          orderNotes: 'Collecting at host stand.',
          paymentMethod: 'PAY_ON_COLLECTION',
        });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.order;
      expect(order.orderReference).toMatch(/^SAV-/);
      expect(order.subtotalCents).toBe(burrata.priceCents * 2);
      expect(order.totalCents).toBeGreaterThan(burrata.priceCents * 2);
      expect(order.paymentMethod).toBe('PAY_ON_COLLECTION');
      expect(order.paymentStatus).toBe('PENDING_COLLECTION');
      expect(order.status).toBe('Pending');
    });

    it('prevents ordering unavailable items or invalid quantities', async () => {
      const { agent, csrfToken } = await loginAs(
        app,
        'guest@savoria.com',
        SEED_PASSWORDS.customer
      );

      const menuRes = await request(app).get('/api/menu');
      const unavailable = menuRes.body.items.find((i: any) => !i.isAvailable);

      const resUnavailable = await agent
        .post('/api/orders')
        .set('X-CSRF-Token', csrfToken)
        .send({
          items: [{ menuItemId: unavailable.id, quantity: 1 }],
          customerName: 'Julian Vance',
          customerEmail: 'guest@savoria.com',
          customerPhone: '4155550148',
          fulfillmentType: 'COLLECTION',
          paymentMethod: 'PAY_ON_COLLECTION',
        });
      expect(resUnavailable.status).toBe(400);

      const available = menuRes.body.items.find((i: any) => i.isAvailable);
      const resBadQty = await agent
        .post('/api/orders')
        .set('X-CSRF-Token', csrfToken)
        .send({
          items: [{ menuItemId: available.id, quantity: 0 }],
          customerName: 'Julian Vance',
          customerEmail: 'guest@savoria.com',
          customerPhone: '4155550148',
          fulfillmentType: 'COLLECTION',
          paymentMethod: 'PAY_ON_COLLECTION',
        });
      expect(resBadQty.status).toBe(400);
    });
  });

  describe('5. Role-Based Access Control (RBAC) & Admin Operations', () => {
    it('blocks unauthenticated users and CUSTOMER accounts from all /api/admin endpoints', async () => {
      const unauthStats = await request(app).get('/api/admin/stats');
      expect(unauthStats.status).toBe(401);

      const { agent, csrfToken } = await loginAs(
        app,
        'guest@savoria.com',
        SEED_PASSWORDS.customer
      );

      const custStats = await agent.get('/api/admin/stats');
      expect(custStats.status).toBe(403);

      const custCreateMenu = await agent
        .post('/api/admin/menu')
        .set('X-CSRF-Token', csrfToken)
        .send({ name: 'Hacked Dish' });
      expect(custCreateMenu.status).toBe(403);

      // Customer also cannot view another customer's order
      const elenaOrderRes = await agent.get('/api/orders/SAV-104855');
      expect(elenaOrderRes.status).toBe(403);
    });

    it('allows ADMIN to manage menu items, validate order status transitions, and preserve historical orders on delete', async () => {
      const { agent, csrfToken } = await loginAs(
        app,
        'admin@savoria.com',
        SEED_PASSWORDS.admin
      );

      const statsRes = await agent.get('/api/admin/stats');
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.stats.totalOrders).toBeGreaterThanOrEqual(3);

      // Update Pending order SAV-104855 -> Confirmed -> Preparing
      const ordersRes = await agent.get('/api/admin/orders');
      const pendingOrder = ordersRes.body.orders.find(
        (o: any) => o.orderReference === 'SAV-104855'
      );

      const badJump = await agent
        .patch(`/api/admin/orders/${pendingOrder.id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'Completed' });
      expect(badJump.status).toBe(400);

      const confirmRes = await agent
        .patch(`/api/admin/orders/${pendingOrder.id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'Confirmed' });
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.order.status).toBe('Confirmed');

      // Delete a menu item that has historical orders -> soft-deleted, historical order still intact!
      const menuRes = await request(app).get('/api/menu');
      const burrata = menuRes.body.items.find((i: any) =>
        i.name.includes('Black Truffle & Fig Burrata')
      );
      const delRes = await agent
        .delete(`/api/admin/menu/${burrata.id}`)
        .set('X-CSRF-Token', csrfToken);
      expect(delRes.status).toBe(200);
      expect(delRes.body.softDeleted).toBe(true);

      const orderCheck = await agent.get('/api/orders/SAV-104855');
      expect(orderCheck.status).toBe(200);
      expect(
        orderCheck.body.order.items.some((i: any) => i.itemName.includes('Burrata'))
      ).toBe(true);
    });
  });

  describe('6. Paystack PaymentService Integration & Verification Token Security', () => {
    it('reports unconfigured Paystack cleanly and blocks Paystack init when PAYSTACK_SECRET_KEY is absent', async () => {
      const cfg = await request(app).get('/api/payments/config');
      expect(cfg.status).toBe(200);
      expect(cfg.body.paystackConfigured).toBe(false);

      const { agent, csrfToken } = await loginAs(
        app,
        'guest@savoria.com',
        SEED_PASSWORDS.customer
      );
      const menuRes = await request(app).get('/api/menu');
      const dish = menuRes.body.items.find((i: any) => i.isAvailable);

      const initRes = await agent
        .post('/api/payments/paystack/initialize')
        .set('X-CSRF-Token', csrfToken)
        .send({
          items: [{ menuItemId: dish.id, quantity: 1 }],
          customerName: 'Julian Vance',
          customerEmail: 'guest@savoria.com',
          customerPhone: '4155550148',
          fulfillmentType: 'COLLECTION',
        });
      expect(initRes.status).toBe(503);
    });

    it('initializes Paystack checkout, validates verification token & gateway response, blocks tampering/replay, and creates PAID_PAYSTACK order', async () => {
      let initializedAmount = 0;
      let initializedRef = '';
      const secretKey = 'sk_test_mock_paystack_secret';

      const mockFetch = (async (url: string, init?: RequestInit) => {
        if (url.endsWith('/transaction/initialize')) {
          const payload = JSON.parse(String(init?.body || '{}'));
          initializedAmount = payload.amount;
          initializedRef = payload.reference;
          return new Response(
            JSON.stringify({
              status: true,
              message: 'Authorization URL created',
              data: {
                authorization_url: `https://checkout.paystack.com/${initializedRef}`,
                access_code: 'ac_test_999',
                reference: initializedRef,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (url.includes('/transaction/verify/')) {
          return new Response(
            JSON.stringify({
              status: true,
              message: 'Verification successful',
              data: {
                id: 888123,
                status: 'success',
                reference: initializedRef,
                amount: initializedAmount,
                currency: 'NGN',
                channel: 'card',
                paid_at: '2026-11-16T12:00:00.000Z',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(JSON.stringify({ status: false }), { status: 404 });
      }) as typeof fetch;

      const paySvc = new PaymentService({
        secretKey,
        publicKey: 'pk_test_mock_paystack_public',
        currency: 'NGN',
        tokenSigningSecret: 'test-token-signing-secret',
        fetchImpl: mockFetch,
      });

      const psEnv = setupTestEnv(50, paySvc);
      const cfg = await request(psEnv.app).get('/api/payments/config');
      expect(cfg.status).toBe(200);
      expect(cfg.body.paystackConfigured).toBe(true);
      expect(cfg.body.publicKey).toBe('pk_test_mock_paystack_public');

      const { agent, csrfToken } = await loginAs(
        psEnv.app,
        'guest@savoria.com',
        SEED_PASSWORDS.customer
      );

      const menuRes = await request(psEnv.app).get('/api/menu');
      const burrata = menuRes.body.items.find((i: any) =>
        i.name.includes('Black Truffle & Fig Burrata')
      );

      const baseOrderPayload = {
        items: [{ menuItemId: burrata.id, quantity: 2 }],
        customerName: 'Julian Vance',
        customerEmail: 'guest@savoria.com',
        customerPhone: '+1 (415) 555-0148',
        fulfillmentType: 'DELIVERY',
        deliveryAddress: '782 Pacific Heights Blvd, Apt 4B',
        orderNotes: 'Leave with concierge.',
      };

      const initRes = await agent
        .post('/api/payments/paystack/initialize')
        .set('X-CSRF-Token', csrfToken)
        .send(baseOrderPayload);

      expect(initRes.status).toBe(201);
      expect(initRes.body.accessCode).toBe('ac_test_999');
      expect(initRes.body.verificationToken).toBeTruthy();
      expect(initRes.body.amountCents).toBe(initializedAmount);

      // 1. Tampered verification token must be rejected
      const tamperedOrder = await agent
        .post('/api/orders')
        .set('X-CSRF-Token', csrfToken)
        .send({
          ...baseOrderPayload,
          paymentMethod: 'PAYSTACK',
          paymentReference: initRes.body.reference,
          paymentVerificationToken: `${initRes.body.verificationToken.slice(0, -3)}XYZ`,
        });
      expect(tamperedOrder.status).toBe(403);

      // 2. Cart tampering after initialization must be rejected (token amount != new total)
      const modifiedCartOrder = await agent
        .post('/api/orders')
        .set('X-CSRF-Token', csrfToken)
        .send({
          ...baseOrderPayload,
          items: [{ menuItemId: burrata.id, quantity: 3 }],
          paymentMethod: 'PAYSTACK',
          paymentReference: initRes.body.reference,
          paymentVerificationToken: initRes.body.verificationToken,
        });
      expect(modifiedCartOrder.status).toBe(400);

      // 3. Valid Paystack order succeeds and records PAID_PAYSTACK
      const validOrder = await agent
        .post('/api/orders')
        .set('X-CSRF-Token', csrfToken)
        .send({
          ...baseOrderPayload,
          paymentMethod: 'PAYSTACK',
          paymentReference: initRes.body.reference,
          paymentVerificationToken: initRes.body.verificationToken,
        });
      expect(validOrder.status).toBe(201);
      expect(validOrder.body.order.paymentMethod).toBe('PAYSTACK');
      expect(validOrder.body.order.paymentStatus).toBe('PAID_PAYSTACK');
      expect(validOrder.body.order.paymentReference).toBe(initRes.body.reference);

      // 4. Replay of the same Paystack reference/token must be rejected with 409
      const replayOrder = await agent
        .post('/api/orders')
        .set('X-CSRF-Token', csrfToken)
        .send({
          ...baseOrderPayload,
          paymentMethod: 'PAYSTACK',
          paymentReference: initRes.body.reference,
          paymentVerificationToken: initRes.body.verificationToken,
        });
      expect(replayOrder.status).toBe(409);

      // 5. Webhook verification: invalid signature rejected, valid HMAC-SHA512 accepted
      const webhookPayload = {
        event: 'charge.success',
        data: {
          id: 888123,
          reference: initRes.body.reference,
          amount: initializedAmount,
          currency: 'NGN',
          channel: 'card',
        },
      };
      const badWebhook = await request(psEnv.app)
        .post('/api/payments/paystack/webhook')
        .set('x-paystack-signature', 'invalid')
        .send(webhookPayload);
      expect(badWebhook.status).toBe(401);

      const raw = JSON.stringify(webhookPayload);
      const sig = crypto.createHmac('sha512', secretKey).update(raw).digest('hex');
      const okWebhook = await request(psEnv.app)
        .post('/api/payments/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', sig)
        .send(raw);
      expect(okWebhook.status).toBe(200);
      expect(okWebhook.body.received).toBe(true);
    });
  });

  describe('7. Cookie-less Bearer Session Fallback (Cross-Origin Preview Support)', () => {
    it('authenticates ADMIN via Authorization Bearer sessionToken when cookies are blocked, enforces CUSTOMER 403, and invalidates on logout', async () => {
      const adminLogin = await request(app).post('/api/auth/login').send({
        email: 'admin@savoria.com',
        password: SEED_PASSWORDS.admin,
      });
      expect(adminLogin.status).toBe(200);
      const adminToken = adminLogin.body.sessionToken as string;
      expect(adminToken).toBeTruthy();

      // Without cookies, Bearer token authenticates /api/auth/me and /api/admin/*
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.role).toBe('ADMIN');

      const statsRes = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.stats.totalMenuItems).toBeGreaterThanOrEqual(10);

      const catCreate = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Tasting Flights', description: 'Curated pairings', sortOrder: 9 });
      expect(catCreate.status).toBe(201);

      // CUSTOMER Bearer token must still get 403 on admin endpoints
      const custLogin = await request(app).post('/api/auth/login').send({
        email: 'guest@savoria.com',
        password: SEED_PASSWORDS.customer,
      });
      const custToken = custLogin.body.sessionToken as string;
      const custAdminRes = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${custToken}`);
      expect(custAdminRes.status).toBe(403);

      // Logout using Bearer token destroys server session
      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(logoutRes.status).toBe(200);

      const afterLogoutStats = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(afterLogoutStats.status).toBe(401);
    });
  });

  describe('8. Inventory Stock Quantity Management, Auto Sold-Out & Cancel Restore', () => {
    it('creates dish with stockQuantity, deducts atomically on order, auto-marks sold out at 0, blocks oversell, and restores stock on order cancellation', async () => {
      const { agent: adminAgent, csrfToken: adminCsrf } = await loginAs(
        app,
        'admin@savoria.com',
        SEED_PASSWORDS.admin
      );
      const { agent: custAgent, csrfToken: custCsrf } = await loginAs(
        app,
        'guest@savoria.com',
        SEED_PASSWORDS.customer
      );

      // Admin creates a limited seasonal dish with stockQuantity = 3
      const catRes = await request(app).get('/api/categories');
      const catId = catRes.body.categories[0].id;
      const createDish = await adminAgent
        .post('/api/admin/menu')
        .set('X-CSRF-Token', adminCsrf)
        .send({
          categoryId: catId,
          name: 'Limited Ember Lobster',
          description: 'Wood-roasted Atlantic lobster with herb butter.',
          priceCents: 4500000,
          imageUrl: '/src/assets/images/dish_branzino_crudo_1794832268780.jpg',
          dietaryTags: ['Gluten-Free'],
          prepTimeMins: 24,
          stockQuantity: 3,
          isAvailable: true,
        });
      expect(createDish.status).toBe(201);
      expect(createDish.body.item.stockQuantity).toBe(3);
      expect(createDish.body.item.isAvailable).toBe(true);
      const dishId = createDish.body.item.id;

      // Customer tries to order 4 (more than 3 in stock) -> rejected 400
      const oversellAttempt = await custAgent
        .post('/api/orders')
        .set('X-CSRF-Token', custCsrf)
        .send({
          items: [{ menuItemId: dishId, quantity: 4 }],
          customerName: 'Julian Vance',
          customerEmail: 'guest@savoria.com',
          customerPhone: '4155550148',
          fulfillmentType: 'COLLECTION',
          paymentMethod: 'PAY_ON_COLLECTION',
        });
      expect(oversellAttempt.status).toBe(400);
      expect(oversellAttempt.body.error).toMatch(/Only 3/);

      // Customer buys all 3 remaining portions -> succeeds, stock drops to 0, auto-marks unavailable
      const orderAll = await custAgent
        .post('/api/orders')
        .set('X-CSRF-Token', custCsrf)
        .send({
          items: [{ menuItemId: dishId, quantity: 3 }],
          customerName: 'Julian Vance',
          customerEmail: 'guest@savoria.com',
          customerPhone: '4155550148',
          fulfillmentType: 'COLLECTION',
          paymentMethod: 'PAY_ON_COLLECTION',
        });
      expect(orderAll.status).toBe(201);
      const createdOrderId = orderAll.body.order.id;

      const afterBuy = await request(app).get(`/api/menu/${dishId}`);
      expect(afterBuy.status).toBe(200);
      expect(afterBuy.body.item.stockQuantity).toBe(0);
      expect(afterBuy.body.item.isAvailable).toBe(false);

      // Admin cannot toggle availability on while stock is 0
      const badToggle = await adminAgent
        .patch(`/api/admin/menu/${dishId}`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ isAvailable: true });
      expect(badToggle.status).toBe(400);

      // Admin cancels the order -> stock is restored back to 3 & dish automatically becomes available again
      const cancelRes = await adminAgent
        .patch(`/api/admin/orders/${createdOrderId}/status`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ status: 'Cancelled' });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.order.status).toBe('Cancelled');

      const afterCancel = await request(app).get(`/api/menu/${dishId}`);
      expect(afterCancel.status).toBe(200);
      expect(afterCancel.body.item.stockQuantity).toBe(3);
      expect(afterCancel.body.item.isAvailable).toBe(true);

      // Admin adjusts stock manually to 12 via inline PATCH
      const restockRes = await adminAgent
        .patch(`/api/admin/menu/${dishId}`)
        .set('X-CSRF-Token', adminCsrf)
        .send({ stockQuantity: 12 });
      expect(restockRes.status).toBe(200);
      expect(restockRes.body.item.stockQuantity).toBe(12);
      expect(restockRes.body.item.isAvailable).toBe(true);
    });
  });
});

