import bcrypt from 'bcryptjs';
import type { AppDatabase } from './database.ts';
import { runMigrations } from './migrations.ts';
import { calculateOrderTotals } from '../domain/orders.ts';

export const SEED_PASSWORDS = {
  admin: 'AdminSavoria2026!',
  customer: 'GuestSavoria2026!',
  elena: 'ElenaDining2026!',
};

export function seedDatabase(db: AppDatabase): void {
  runMigrations(db);

  const existingRoles = db.prepare('SELECT COUNT(*) as count FROM roles').get() as { count: number };
  if (existingRoles.count === 0) {
    db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run(
      'CUSTOMER',
      'Registered dining guest with ordering and order tracking access'
    );
    db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run(
      'ADMIN',
      'Restaurant administrator with full menu, order, and guest management access'
    );
  }

  const customerRole = db.prepare("SELECT id FROM roles WHERE name = 'CUSTOMER'").get() as { id: number };
  const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'ADMIN'").get() as { id: number };

  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (existingUsers.count === 0) {
    const adminHash = bcrypt.hashSync(SEED_PASSWORDS.admin, 10);
    const guestHash = bcrypt.hashSync(SEED_PASSWORDS.customer, 10);
    const elenaHash = bcrypt.hashSync(SEED_PASSWORDS.elena, 10);

    db.prepare(
      'INSERT INTO users (role_id, name, email, password_hash, phone, default_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      adminRole.id,
      'Marco Bellini',
      'admin@savoria.com',
      adminHash,
      '+1 (415) 555-0100',
      '420 Mercer Street, Culinary District'
    );

    db.prepare(
      'INSERT INTO users (role_id, name, email, password_hash, phone, default_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      customerRole.id,
      'Julian Vance',
      'guest@savoria.com',
      guestHash,
      '+1 (415) 555-0148',
      '782 Pacific Heights Blvd, Apt 4B'
    );

    db.prepare(
      'INSERT INTO users (role_id, name, email, password_hash, phone, default_address) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      customerRole.id,
      'Elena Rostova',
      'elena.rostova@example.com',
      elenaHash,
      '+1 (415) 555-0192',
      '119 Embarcadero Terrace, Suite 9'
    );
  }

  const existingCategories = db.prepare('SELECT COUNT(*) as count FROM categories').get() as {
    count: number;
  };
  if (existingCategories.count === 0) {
    const categories = [
      {
        name: 'Starters & Crudo',
        slug: 'starters-crudo',
        description: 'Bright seasonal openings, artisanal cheeses, and chilled plates.',
        sortOrder: 1,
      },
      {
        name: 'Artisan Pasta & Risotto',
        slug: 'artisan-pasta-risotto',
        description: 'Hand-rolled heritage grain pasta and slow-simmered Carnaroli rice.',
        sortOrder: 2,
      },
      {
        name: 'Wood-Fired Mains',
        slug: 'wood-fired-mains',
        description: 'Prime cuts and line-caught fish kissed by oak embers.',
        sortOrder: 3,
      },
      {
        name: 'Patisserie & Desserts',
        slug: 'patisserie-desserts',
        description: 'Single-origin chocolate confections and warm seasonal tarts.',
        sortOrder: 4,
      },
      {
        name: 'Cellar & Aperitifs',
        slug: 'cellar-aperitifs',
        description: 'Botanical spritzes and zero-proof house infusions.',
        sortOrder: 5,
      },
    ];

    const insertCat = db.prepare(
      'INSERT INTO categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)'
    );
    for (const c of categories) {
      insertCat.run(c.name, c.slug, c.description, c.sortOrder);
    }
  }

  const existingItems = db.prepare('SELECT COUNT(*) as count FROM menu_items').get() as {
    count: number;
  };
  if (existingItems.count === 0) {
    const getCatId = (slug: string) =>
      (db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug) as { id: number }).id;

    const startersId = getCatId('starters-crudo');
    const pastaId = getCatId('artisan-pasta-risotto');
    const mainsId = getCatId('wood-fired-mains');
    const dessertsId = getCatId('patisserie-desserts');
    const drinksId = getCatId('cellar-aperitifs');

    const items = [
      {
        categoryId: startersId,
        name: 'Black Truffle & Fig Burrata',
        description:
          'Creamy Pugliese burrata crowned with shaved Périgord black truffle, caramelized Mission figs, aged Saba glaze, and cold-pressed Tuscan olive oil.',
        priceCents: 2400,
        imageUrl: '/src/assets/images/dish_truffle_burrata_1794832267229.jpg',
        dietaryTags: JSON.stringify(["Chef's Selection", 'Vegetarian', 'Gluten-Free']),
        prepTimeMins: 10,
        isAvailable: 1,
        isFeatured: 1,
      },
      {
        categoryId: startersId,
        name: 'White Alba Truffle Carpaccio',
        description:
          'Paper-thin seasonal porcini and artichoke carpaccio finished with wild arugula, lemon oil, and shaved Alba truffle. Limited harvest.',
        priceCents: 3400,
        imageUrl: '/src/assets/images/dish_truffle_burrata_1794832267229.jpg',
        dietaryTags: JSON.stringify(['Vegan', 'Gluten-Free']),
        prepTimeMins: 12,
        isAvailable: 0,
        isFeatured: 0,
      },
      {
        categoryId: pastaId,
        name: 'Saffron Risotto & Diver Scallops',
        description:
          'Slow-simmered Acquerello Carnaroli rice infused with Iranian saffron, pan-seared Hokkaido diver scallops, crispy garden sage, and 24-month Parmigiano.',
        priceCents: 3800,
        imageUrl: '/src/assets/images/dish_saffron_risotto_1794832268605.jpg',
        dietaryTags: JSON.stringify(["Chef's Selection", 'Gluten-Free']),
        prepTimeMins: 22,
        isAvailable: 1,
        isFeatured: 1,
      },
      {
        categoryId: pastaId,
        name: 'Wild Chanterelle Tagliatelle',
        description:
          'Hand-cut egg yolk tagliatelle folded into roasted golden chanterelles, cultured thyme brown butter, black peppercorn, and aged Pecorino Romano.',
        priceCents: 3200,
        imageUrl: '/src/assets/images/dish_mushroom_tagliatelle_1794832269761.jpg',
        dietaryTags: JSON.stringify(['Vegetarian']),
        prepTimeMins: 18,
        isAvailable: 1,
        isFeatured: 1,
      },
      {
        categoryId: mainsId,
        name: 'Charcoal Wagyu Ribeye',
        description:
          '250g Miyazaki A5-cross ribeye seared over white oak embers, served with roasted bone-marrow herb butter, charred broccolini, and Barolo reduction.',
        priceCents: 6400,
        imageUrl: '/src/assets/images/dish_wagyu_ribeye_1794832267847.jpg',
        dietaryTags: JSON.stringify(["Chef's Selection", 'Gluten-Free']),
        prepTimeMins: 25,
        isAvailable: 1,
        isFeatured: 1,
      },
      {
        categoryId: mainsId,
        name: 'Crispy-Skin Mediterranean Branzino',
        description:
          'Line-caught sea bass fillet with blistered heirloom cherry tomatoes, fennel pollen, fresh garden dill, and warm saffron beurre blanc.',
        priceCents: 4200,
        imageUrl: '/src/assets/images/dish_branzino_crudo_1794832268780.jpg',
        dietaryTags: JSON.stringify(['Fresh', 'Gluten-Free']),
        prepTimeMins: 20,
        isAvailable: 1,
        isFeatured: 1,
      },
      {
        categoryId: mainsId,
        name: 'Calabrian Chili Ember Chicken',
        description:
          'Organic pasture-raised half chicken roasted under brick with smoky Calabrian chili glaze, Meyer lemon confit, and rosemary jus.',
        priceCents: 3400,
        imageUrl: '/src/assets/images/dish_wagyu_ribeye_1794832267847.jpg',
        dietaryTags: JSON.stringify(['Spicy', 'Gluten-Free']),
        prepTimeMins: 26,
        isAvailable: 1,
        isFeatured: 0,
      },
      {
        categoryId: dessertsId,
        name: 'Valrhona Espresso Mascarpone Torte',
        description:
          'Layered 70% Guanaja dark chocolate mousse and espresso-soaked sponge paired with whipped mascarpone quenelle and crisp cocoa lace tuile.',
        priceCents: 1800,
        imageUrl: '/src/assets/images/dish_chocolate_torte_1794832269166.jpg',
        dietaryTags: JSON.stringify(["Chef's Selection", 'Vegetarian']),
        prepTimeMins: 8,
        isAvailable: 1,
        isFeatured: 1,
      },
      {
        categoryId: drinksId,
        name: 'Blood Orange & Rosemary Spritz',
        description:
          'Zero-proof botanical aperitif blending Sicilian blood orange reduction, charred garden rosemary syrup, gentian root bitters, and sparkling mineral water.',
        priceCents: 1600,
        imageUrl: '/src/assets/images/dish_citrus_aperitif_1794832268754.jpg',
        dietaryTags: JSON.stringify(['Vegan', 'Gluten-Free']),
        prepTimeMins: 5,
        isAvailable: 1,
        isFeatured: 0,
      },
      {
        categoryId: drinksId,
        name: 'Amalfi Yuzu & Bergamot Tonic',
        description:
          'Bright coastal citrus tonic crafted with cold-pressed bergamot peel, yuzu juice, and tonic quinine over a hand-carved crystal sphere.',
        priceCents: 1500,
        imageUrl: '/src/assets/images/dish_citrus_aperitif_1794832268754.jpg',
        dietaryTags: JSON.stringify(['Vegan', 'Fresh']),
        prepTimeMins: 5,
        isAvailable: 1,
        isFeatured: 0,
      },
    ];

    const insertItem = db.prepare(`
      INSERT INTO menu_items (
        category_id, name, description, price_cents, image_url,
        dietary_tags, prep_time_mins, is_available, is_featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      insertItem.run(
        item.categoryId,
        item.name,
        item.description,
        item.priceCents,
        item.imageUrl,
        item.dietaryTags,
        item.prepTimeMins,
        item.isAvailable,
        item.isFeatured
      );
    }
  }

  const existingOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get() as { count: number };
  if (existingOrders.count === 0) {
    const guest = db
      .prepare("SELECT id, name, email, phone, default_address FROM users WHERE email = 'guest@savoria.com'")
      .get() as { id: number; name: string; email: string; phone: string; default_address: string };

    const elena = db
      .prepare(
        "SELECT id, name, email, phone, default_address FROM users WHERE email = 'elena.rostova@example.com'"
      )
      .get() as { id: number; name: string; email: string; phone: string; default_address: string };

    const burrata = db
      .prepare("SELECT id, name, price_cents FROM menu_items WHERE name = 'Black Truffle & Fig Burrata'")
      .get() as { id: number; name: string; price_cents: number };
    const risotto = db
      .prepare("SELECT id, name, price_cents FROM menu_items WHERE name = 'Saffron Risotto & Diver Scallops'")
      .get() as { id: number; name: string; price_cents: number };
    const wagyu = db
      .prepare("SELECT id, name, price_cents FROM menu_items WHERE name = 'Charcoal Wagyu Ribeye'")
      .get() as { id: number; name: string; price_cents: number };
    const torte = db
      .prepare("SELECT id, name, price_cents FROM menu_items WHERE name = 'Valrhona Espresso Mascarpone Torte'")
      .get() as { id: number; name: string; price_cents: number };

    const createSeedOrder = (
      ref: string,
      user: typeof guest,
      fulfillment: 'DELIVERY' | 'COLLECTION',
      status: string,
      notes: string,
      lines: Array<{ id: number; name: string; price_cents: number; qty: number }>,
      hoursAgo: number
    ) => {
      const totals = calculateOrderTotals(
        lines.map((l) => ({ unitPriceCents: l.price_cents, quantity: l.qty })),
        fulfillment
      );
      const createdAt = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();

      const res = db
        .prepare(
          `INSERT INTO orders (
            order_reference, customer_id, customer_name, customer_email, customer_phone,
            fulfillment_type, delivery_address, order_notes, payment_method, payment_status,
            status, subtotal_cents, delivery_fee_cents, tax_cents, total_cents, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          ref,
          user.id,
          user.name,
          user.email,
          user.phone,
          fulfillment,
          fulfillment === 'DELIVERY' ? user.default_address : '',
          notes,
          fulfillment === 'COLLECTION' ? 'PAY_ON_COLLECTION' : 'PAYSTACK',
          fulfillment === 'COLLECTION' ? 'PAID_ON_COLLECTION' : 'PAID_PAYSTACK',
          status,
          totals.subtotalCents,
          totals.deliveryFeeCents,
          totals.taxCents,
          totals.totalCents,
          createdAt,
          createdAt
        );

      const orderId = Number(res.lastInsertRowid);
      const insertOrderItem = db.prepare(
        `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity, line_total_cents)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const l of lines) {
        insertOrderItem.run(orderId, l.id, l.name, l.price_cents, l.qty, l.price_cents * l.qty);
      }
    };

    createSeedOrder(
      'SAV-104821',
      guest,
      'DELIVERY',
      'Preparing',
      'Extra sourdough if available, ring concierge.',
      [
        { ...burrata, qty: 1 },
        { ...risotto, qty: 2 },
      ],
      1
    );

    createSeedOrder(
      'SAV-104792',
      guest,
      'COLLECTION',
      'Completed',
      'Pick up at host stand.',
      [
        { ...wagyu, qty: 1 },
        { ...torte, qty: 1 },
      ],
      48
    );

    createSeedOrder(
      'SAV-104855',
      elena,
      'DELIVERY',
      'Pending',
      'Leave with building doorman.',
      [
        { ...wagyu, qty: 1 },
        { ...burrata, qty: 1 },
      ],
      0.25
    );
  }
}
