# Savoria Restaurant Ordering System — Automated & Browser Testing Report

## 1. Execution Summary

| Suite / Check | Runner | Scope | Passed | Failed |
| --- | --- | --- | --- | --- |
| Domain Unit Tests (`tests/domain.test.ts`) | `node:test` (`tsx --test`) | Order pricing totals, free-delivery threshold, collection fee waiver, status transition state machine, reference formatting | 5 | 0 |
| API, Auth, RBAC, Security & DB Integration (`tests/api.test.ts`) | Vitest + Supertest | Menu filtering, SQL injection defense, registration, bcrypt password hashing, privilege escalation prevention, duplicate email rejection, login/logout, session expiration, login rate limiting, CSRF enforcement, XSS input rejection, server price recalculation, unavailable item blocking, RBAC `/api/admin/*` enforcement, historical order preservation on menu deletion | 14 | 0 |
| TypeScript & Production Build | `tsc --noEmit` & `vite build` | Full frontend + backend typecheck & Vite production bundle | Passed | 0 |
| End-to-End Browser & Visual Verification | Playwright CLI (`chromium`) | Desktop (`1440x900`) & Mobile (`390x844`) rendering, category/dietary filtering, bag & checkout submission, `/orders` persistence, `/admin` 403 RBAC check for customer role, Admin KPI overview, Admin order status advancement (`Pending` → `Confirmed`), Menu & Customers tabs | Passed | 0 |

## 2. Detailed Test Coverage

### Functional Testing
- **Menu Browsing & Filtering**: Verified seeded categories (`Starters & Crudo`, `Artisan Pasta & Risotto`, `Wood-Fired Mains`, `Patisserie & Desserts`, `Cellar & Aperitifs`) and 10 dishes including unavailable seasonal item display. Verified search and category filtering via both API and browser UI.
- **Shopping Cart & Checkout**: Verified adding/incrementing items, bag drawer totals, checkout form validation (delivery address required for delivery), simulated payment disclosure, and server-side order creation (`POST /api/orders`).
- **Server-Side Price Integrity**: Verified `POST /api/orders` ignores tampered `priceCents` and `totalCents` from client payloads and recalculates subtotal, delivery fee, tax, and total strictly from database menu prices inside an ACID `BEGIN IMMEDIATE` transaction.
- **Order Management & History**: Verified `SAV-` reference generation, customer order history isolation (`/api/orders`), and admin status workflow enforcement (`Pending` → `Confirmed` → `Preparing` → `Ready` → `Completed`, blocking invalid jumps like `Pending` → `Completed`).

### Authentication & Authorisation Testing
- **Registration & Password Hashing**: Verified `POST /api/auth/register` hashes passwords with `bcryptjs` (`$2` prefix), sets HTTP-only `savoria_sid` cookie, and ignores injected `role: "ADMIN"` privilege escalation attempts.
- **Session Lifecycle**: Verified duplicate registration returns `409`, wrong password returns `401`, logout destroys DB session and clears cookie, and expired sessions are purged with `401`.
- **RBAC Enforcement**: Verified unauthenticated requests to `/api/admin/*` return `401`, `CUSTOMER` requests to `/api/admin/*` return `403`, cross-customer order access returns `403`, and browser navigation to `/admin` as a customer displays `403 · Access Restricted`.

### Security Testing
- **SQL Injection**: Tested parameterized queries with `' OR '1'='1'; DROP TABLE users; --` in search and `1 OR 1=1` in ID parameters; no data leaked and `users` table remained intact.
- **XSS Payload Handling**: Tested `<script>alert(1)</script>` in profile updates; rejected with `400` validation error alongside React escaped rendering and Helmet CSP headers.
- **CSRF Protection**: Tested mutating cookie-authenticated requests without `X-CSRF-Token`; rejected with `403`.
- **Rate Limiting**: Verified repeated failed login attempts trigger `429 Too Many Requests`.

## 3. Visual & Usability Critique Fixes Applied
1. **Badge Contrast on Dark Photography**: Replaced translucent floating dietary badge backgrounds on `DishCard` with high-contrast frosted surfaces (`bg-[#FFFBEB]/95`, `bg-[#ECFDF5]/95`, `bg-[#FFF5F2]/95`) so text meets WCAG AA contrast across all dish photographs.
2. **Toast Positioning**: Moved toast stack from `top-20 right-4` to `bottom-6 right-6` so notifications never obscure the Admin `Refresh` button.
3. **Admin KPI Baseline Alignment**: Normalized KPI labels and card flex layout so metric numerals align horizontally across all 6 overview cards.

## 4. Environment & Security Notes
- **Database Engine Note**: Because Cloud SQL PostgreSQL provisioning requires an active billing-enabled GCP project (`NO_VALID_PROJECT` in this sandbox), Firebase/Firestore (`firestore.rules` deployed) was provisioned alongside a local relational SQLite database (`node:sqlite` with `PRAGMA foreign_keys = ON` and ACID transactions) for full relational persistence.
- **Vite HMR WebSocket in Dev Mode**: Because HMR is disabled in this container (`DISABLE_HMR=true`), `@vite/client` logs a blocked `ws://localhost:24678` connection attempt under CSP in dev mode; production builds (`npm run build && npm start`) do not include `@vite/client`.
- **Firestore Rules**: Generated and deployed hardened `firestore.rules` with default-deny catch-all, strict field allowlisting, and role isolation; users should review and tailor rules before sharing externally.
