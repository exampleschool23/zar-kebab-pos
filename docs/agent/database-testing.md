# Database, Migrations, Tests, and Verification

Read this guide for SQL migrations, schema compatibility, database health, regression tests, source guards, and deployment verification.

## Database workflow

- Run migrations in numeric order. Production should have all migrations applied even when `src/lib/db.js` has rolling-deployment fallbacks.
- Run `npm run db:health` first when a page loads forever or the console reports missing tables, columns, or RPCs.
- Do not assume applying the kitchen RPC migration means earlier settings or split-payment migrations exist.
- Important migration families:
  - settings, payments, kitchen submit, tables/reservations: `011`, `012`, `018`–`020`
  - kitchen idempotency and durable receipts: `096`, `128`
  - Bazaar, costs, fines, media, stock: `097`–`106`
  - salary/Telegram tracking and historical financial freezing: `107`–`119`
  - menu permissions, estimates, archival, stale-item rejection: `121`–`127`
  - KPI and Tourist service: `129`–`130`
  - Tech Cards and access: `139`–`140`
  - menu/expense notifications and financial snapshots: `142`–`147`
- `docs/agent/legacy-context.md` contains the old per-migration descriptions when older deployment history is specifically needed.

## Database invariants

- Use atomic RPCs for multi-table writes such as kitchen submission, menu item + protected cost, Tech Cards, Daily Bazaar, and owner payment corrections.
- Pair frontend access checks with RLS/RPC enforcement.
- Preserve immutable historical order, cost, category, payroll-calculation, notification, and audit snapshots.
- Retries of externally uncertain writes reuse request/round ids and reconcile durable receipts before issuing another mutation.
- Archive referenced catalog records instead of physically deleting them.

## Tests

Tests use Node's built-in runner. Main coverage areas:

- `tests/orderPayment.test.js`: totals, service, loyalty, cart, split payments, cashier, take-away, reporting.
- `tests/dbRealtime.test.js`: realtime, settings reload, connection notices.
- `tests/dashboardAnalytics.test.js`: dashboard periods and ranking behavior.
- `tests/profit.test.js`: cost snapshots, missing legacy coverage, cancellation, net profit.
- `tests/bazaar.test.js`: exact money, quantities, filters, analytics.
- `tests/salaryTransactions.test.js`: salary ledger and deterministic history ordering.
- `tests/sourceGuards.test.js`: source-level protection for regressions that reached users.

Run the smallest relevant test while iterating, then normally run:

```bash
npm test
npm run build
```

## Source-guard policy

Do not loosen a guard simply because implementation changed. First determine which production regression it protects. Guards cover, among other things:

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

- Protected routes redirect unauthenticated checks to `/menu`; use an authorized profile for visual verification.
- The known Vite large-chunk warning is not a failing build.
- Preserve unrelated dirty-worktree changes and report any validation you could not run.
