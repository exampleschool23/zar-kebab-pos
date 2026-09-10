# Database, Migrations, Tests, and Verification

## Entry points

- Database client and health inventory: `src/lib/db.js`, `src/lib/dbHealth.js`
- Migration runner and health commands: `supabase/migrate.js`, `scripts/check-db-health.js`
- SQL migrations: `supabase/`
- Navigator implementation and checks: `mcp/`, `tests/repoNavigatorMcp.test.js`, `scripts/benchmark-repo-nav.js`
- Source guards: `tests/sourceGuards.*.test.js`

## Database workflow

- Apply migrations in numeric order, even with `src/lib/db.js` compatibility fallbacks.
- Run `npm run db:health` first when a page loads forever or the console reports missing tables, columns, or RPCs.
- Kitchen migrations do not replace earlier settings/payment migrations.
- Migration families:
  - settings, payments, kitchen submit, tables/reservations: `011`, `012`, `018`–`020`
  - kitchen idempotency and durable receipts: `096`, `128`
  - Bazaar, costs, fines, media, stock: `097`–`106`
  - salary/Telegram tracking and historical financial freezing: `107`–`119`
  - menu permissions, estimates, archival, stale-item rejection, Team catalog events: `121`–`127`, `167`–`168`
  - KPI and Tourist service: `129`–`130`
  - Tech Cards, access, components, stock, variant recipes, and fractional included-dish quantities: `139`–`140`, `149`–`151`, `154`–`156`, `159`
  - menu/expense notifications and financial snapshots: `142`–`147`
  - absence notification cleanup and daily-report cron: `148`, `152`
  - Dashboard monthly income snapshots, break-even target, and completed-day live average: `157`–`158`, `174`
  - authoritative Daily Bazaar ingredient catalog, clean reset, owner-only catalog writes, and immutable price-variance snapshots: `160`–`163`
  - immutable sold-item Tech Card ingredient snapshots and duplicate-safe daily ingredient image delivery: `164`–`165`
  - Tashkent-calendar expense backdate enforcement: `166`
  - salary/KPI accrual, notifications, Tech Card catalog access, and Team queue repair: `169`–`172`
  - paid-order correction feature access: `173`
  - Investor alerts for order deletes and payment corrections, including the shared-trigger row-type repair: `175`–`176`
  - compact all-time Accounting remainder: `177`
  - employee lifecycle Investor notification queue: `178`
  - Game Club order type, off-premise permission and service checks: `179`
  - Game Club immutable per-round Team queue and cron: `180`
  - Daily Team KPI image claims and legacy-delivery suppression: `181`
- Tech Card cost-sync batching and convergence: `183` (apply to enable faster saves). Coverage: `tests/techCardCostSyncMigration.test.js`; isolated PostgreSQL benchmark: `scripts/check-tech-card-cost-sync.mjs` (pass a PGlite module path).
- Ingredient name editing with stable catalog keys and unchanged purchase snapshots: `182`.

## Database invariants

- Report reads retry network/502/503/504 errors: 3 attempts, 15s each, 500/1000ms backoff; only table GET/HEAD and pending-date RPCs. No write/send retries. Tests: `tests/reportReadFetch.test.js`.

- Use atomic RPCs for multi-table writes such as kitchen submission, menu item + protected cost, Tech Cards, Daily Bazaar, and payment corrections.
- Pair frontend access checks with RLS/RPC enforcement.
- Preserve immutable historical order, cost, category, payroll-calculation, notification, and audit snapshots.
- Retries of externally uncertain writes reuse request/round ids and reconcile durable receipts before issuing another mutation.
- Archive referenced catalog records instead of physically deleting them.

## Tests

Node test coverage:

- `tests/orderPayment.test.js`: totals, service, loyalty, cart, split payments, cashier, take-away, reporting.
- `tests/dbRealtime.test.js`: realtime, settings reload, connection notices.
- `tests/dashboardAnalytics.test.js`: dashboard periods and ranking behavior.
- `tests/profit.test.js`: cost snapshots, missing legacy coverage, cancellation, net profit.
- `tests/bazaar.test.js`: exact money, quantities, filters, analytics.
- `tests/salaryTransactions.test.js`: salary ledger and deterministic history ordering.
- `tests/sourceGuards.*.test.js`: domain-split source-level protection for regressions that reached users.

Validate focused tests, then:

```bash
npm test
npm run build
```

For guide, navigator, map, or source-guard changes, also run `npm run docs:check` and `npm run mcp:benchmark`.

## Source-guard policy

Understand each guard’s protected regression before changing it. Guards cover:

- stable `ProfileSync`, `dbDispatch`, and unique realtime channels;
- parent-owned kitchen sending state and snapshot-only cart removal;
- exact, idempotent kitchen rounds and paid/unavailable-order rejection;
- operational loading boundaries and waiter-table refresh;
- disabled/reserved table behavior and history-safe table management;
- variant-specific cart rows, table price-mode entry, and submitted-round display;
- touch-safe product archival and stale archived-cart rejection;
- correct component ownership for menu upload errors;
- no debugging `console.log()`, blocking `alert()`, or native operational confirmation dialogs in `src`.

## Browser/build verification

- Protected routes require an authorized profile for visual checks.
- Vite large-chunk warnings are non-fatal.
- Preserve unrelated edits; report unrun checks.

- Migration `179_game_club_orders.sql` must precede the Game Club frontend release. It extends order/item constraints and current permission/settlement functions without changing historical rows. Never require the reopening function retired by `090`. Focused coverage: `tests/gameClubOrders.test.js`.

- Optional isolated SQL check: `scripts/check-game-club-migration.mjs` accepts a PGlite module path and tests migration `180` without production access.

- Migration `184` requires deletion reasons and snapshots them for Investor alerts. Apply before frontend deployment.

- `185`: independent status-message tracking and minute cleanup retries. Apply before the Telegram sender. Tests: `tests/orderStatusDelivery.test.js`.

- `186`–`188`: Ingredients access, writes, snapshot keys, and movement totals. Tests: `tests/ingredientsFeature.test.js`; SQL: `scripts/check-ingredient-movement.mjs`.
- `189`: ingredient Investor queue and minute dispatch. Tests: `tests/ingredientNotifications.test.js`; SQL: `scripts/check-ingredient-notifications.mjs` (PGlite path). Deploy the sender before applying.

- `190`–`191`: ten-day income indexes/RPCs; apply before UI.
