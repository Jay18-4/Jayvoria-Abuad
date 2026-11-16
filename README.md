# Savoria — Haute Hospitality Full-Stack Restaurant Ordering System

A complete, secure full-stack restaurant ordering application and administrator operations suite built with **React**, **TypeScript**, **Tailwind CSS**, **React Router**, **Node.js / Express**, **SQLite (`node:sqlite`)** + **Firebase / Firestore** security integration.

> **Environment Note on Database:** Cloud SQL PostgreSQL provisioning is unavailable without an active billing-enabled GCP project (`NO_VALID_PROJECT` in this sandbox), so Firebase/Firestore was provisioned (`firebase-applet-config.json` + hardened `firestore.rules`) alongside a full relational SQL backend (`node:sqlite` with `PRAGMA foreign_keys = ON`, parameterized queries, ACID transactions, schema migrations, and seeding). All business logic, REST routes, sessions, RBAC, and repository queries remain cleanly decoupled.

## Architecture Overview

```
/
├── server.ts                  # Express + Vite full-stack entrypoint (port 3000)
├── server/
│   ├── app.ts                 # Express app factory (Helmet, CORS, CSRF, rate limit, routes)
│   ├── db/
│   │   ├── database.ts        # SQLite connection manager (foreign keys + WAL)
│   │   ├── migrations.ts      # Relational schema (roles, users, categories, menu_items, orders, order_items, sessions)
│   │   ├── seed.ts            # Idempotent realistic restaurant seed data
│   │   └── seed-cli.ts        # CLI seed runner
│   ├── domain/
│   │   ├── orders.ts          # Pure order pricing & status transition state machine
│   │   └── validation.ts      # Zod validation & XSS input sanitization
│   ├── middleware/
│   │   ├── auth.ts            # HMAC-hashed server sessions, HTTP-only cookies, RBAC
│   │   └── security.ts        # Helmet CSP, CORS, rate limiting, timing-safe CSRF
│   └── routes/                # auth, profile, menu, orders, admin REST endpoints
├── src/
│   ├── components/            # Navbar, DishCard, DishDetailModal, CartDrawer, FloatingCartPill
│   ├── context/               # AuthContext, CartContext, ToastContext
│   ├── lib/firebase.ts        # Firebase Client SDK + Google popup auth
│   ├── pages/                 # MenuPage, CheckoutPage, OrderConfirmationPage, OrdersPage, ProfilePage, AuthPages, AdminDashboardPage
│   ├── services/api.ts        # Fetch client with automatic CSRF token header injection
│   └── types/index.ts         # Shared TypeScript models
├── tests/
│   ├── domain.test.ts         # Node built-in runner unit tests
│   └── api.test.ts            # Vitest + Supertest API, RBAC, Auth, and Security tests
├── firestore.rules            # Hardened Firestore security rules
└── firebase-blueprint.json    # Firestore data schema blueprint
```

## Setup & Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment variables:**
   Copy `.env.example` to `.env` if running locally outside AI Studio and configure `SESSION_SECRET`:
   ```bash
   cp .env.example .env
   ```

3. **Database initialization & seeding:**
   Migrations and seed data run automatically on server start, or manually via:
   ```bash
   npm run db:seed
   ```

4. **Development startup:**
   ```bash
   npm run dev
   ```
   Opens at `http://localhost:3000`.

5. **Production build & start:**
   ```bash
   npm run build
   npm start
   ```

## Demo Accounts

- **Customer Account:** `guest@savoria.com` / `GuestSavoria2026!`
- **Administrator Account:** `admin@savoria.com` / `AdminSavoria2026!`

## Running Automated Tests

- **Domain unit tests:**
  ```bash
  npm run test:unit
  ```
- **Backend API, Auth, RBAC, Security & DB integration tests:**
  ```bash
  npm test
  ```
- **TypeScript typecheck:**
  ```bash
  npm run lint
  ```
