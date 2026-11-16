import type { AppDatabase } from './database.ts';

export function runMigrations(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE CHECK (name IN ('CUSTOMER', 'ADMIN')),
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      default_address TEXT NOT NULL DEFAULT '',
      auth_provider TEXT NOT NULL DEFAULT 'LOCAL',
      firebase_uid TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents > 0),
      image_url TEXT NOT NULL,
      dietary_tags TEXT NOT NULL DEFAULT '[]',
      prep_time_mins INTEGER NOT NULL DEFAULT 15,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_reference TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('DELIVERY', 'COLLECTION')),
      delivery_address TEXT NOT NULL DEFAULT '',
      order_notes TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL CHECK (payment_method IN ('PAYSTACK', 'PAY_ON_COLLECTION')),
      payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID_PAYSTACK', 'PAID_ON_COLLECTION', 'PENDING_PAYMENT', 'PENDING_COLLECTION', 'FAILED', 'REFUNDED')),
      payment_reference TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled')),
      subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
      delivery_fee_cents INTEGER NOT NULL CHECK (delivery_fee_cents >= 0),
      tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      line_total_cents INTEGER NOT NULL CHECK (line_total_cents > 0),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      order_id INTEGER,
      user_id INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'PAYSTACK',
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      verification_token_hash TEXT NOT NULL,
      paystack_access_code TEXT NOT NULL DEFAULT '',
      paystack_authorization_url TEXT NOT NULL DEFAULT '',
      gateway_status TEXT NOT NULL DEFAULT 'INITIALIZED',
      gateway_transaction_id TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT '',
      paid_at TEXT,
      verified_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      csrf_token TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_ref ON payment_transactions(reference);
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_user ON payment_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  `);

  // Safely upgrade pre-existing orders table to remove legacy simulated payment constraints
  const ordersSchemaRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'")
    .get() as { sql?: string } | undefined;

  if (
    ordersSchemaRow?.sql &&
    (!ordersSchemaRow.sql.includes('PAYSTACK') ||
      ordersSchemaRow.sql.includes('SIMULATED_CARD') ||
      !ordersSchemaRow.sql.includes('PAID_ON_COLLECTION'))
  ) {
    const hasPaymentRefColumn = ordersSchemaRow.sql.includes('payment_reference');
    const paymentRefSelect = hasPaymentRefColumn ? "COALESCE(payment_reference, '')" : "''";

    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;

      CREATE TABLE orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_reference TEXT NOT NULL UNIQUE,
        customer_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('DELIVERY', 'COLLECTION')),
        delivery_address TEXT NOT NULL DEFAULT '',
        order_notes TEXT NOT NULL DEFAULT '',
        payment_method TEXT NOT NULL CHECK (payment_method IN ('PAYSTACK', 'PAY_ON_COLLECTION')),
        payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID_PAYSTACK', 'PAID_ON_COLLECTION', 'PENDING_PAYMENT', 'PENDING_COLLECTION', 'FAILED', 'REFUNDED')),
        payment_reference TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled')),
        subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
        delivery_fee_cents INTEGER NOT NULL CHECK (delivery_fee_cents >= 0),
        tax_cents INTEGER NOT NULL CHECK (tax_cents >= 0),
        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT
      );

      INSERT INTO orders_new (
        id, order_reference, customer_id, customer_name, customer_email, customer_phone,
        fulfillment_type, delivery_address, order_notes, payment_method, payment_status,
        payment_reference, status, subtotal_cents, delivery_fee_cents, tax_cents,
        total_cents, created_at, updated_at
      )
      SELECT
        id, order_reference, customer_id, customer_name, customer_email, customer_phone,
        fulfillment_type, delivery_address, order_notes,
        CASE WHEN payment_method = 'SIMULATED_CARD' THEN 'PAYSTACK' ELSE payment_method END,
        CASE
          WHEN payment_status = 'PAID_SIMULATED' AND payment_method = 'PAY_ON_COLLECTION' THEN 'PAID_ON_COLLECTION'
          WHEN payment_status = 'PAID_SIMULATED' THEN 'PAID_PAYSTACK'
          ELSE payment_status
        END,
        ${paymentRefSelect}, status, subtotal_cents, delivery_fee_cents, tax_cents,
        total_cents, created_at, updated_at
      FROM orders;

      DROP TABLE orders;
      ALTER TABLE orders_new RENAME TO orders;

      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }
}
