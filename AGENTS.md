# Zar Kebab POS Agent Guide

Read this file before changing code. It is deliberately short: load only the feature guide relevant to the task.

## Project essentials

Zar Kebab POS is a Vite/React 18 application backed by Supabase. It covers the public and Telegram menus, waiter ordering, kitchen checks, cashier billing, admin, reporting, accounting, payroll, and Telegram notifications.

Core locations:

- Routes: `src/App.jsx`
- Shared POS orchestration: `src/store/AppContext.jsx`
- Domain reducers: `src/store/`
- Supabase reads, writes, and realtime: `src/lib/db.js`
- Payment and service math: `src/lib/analytics.js`
- SQL migrations: `supabase/`
- Tests: `tests/`

Run from the repository root:

```bash
npm run dev
npm test
npm run build
npm run db:health
```

Use `npm run db:health` first for endless loading or missing migration/RPC warnings.

## Read only the relevant guide

Before editing a feature, read its guide completely. Read more than one only when the task genuinely crosses those boundaries.

| Task area | Required guide |
| --- | --- |
| App startup, authentication, shared state, realtime, permissions, routes | `docs/agent/architecture.md` |
| Waiter tables, cart, price mode, kitchen submission/checks, reservations | `docs/agent/ordering-kitchen.md` |
| Products, categories, availability, media, stock, costs, tech cards | `docs/agent/menu-tech-cards.md` |
| Cashier, payments, service fees, Accounting, expenses, Daily Bazaar | `docs/agent/payments-accounting.md` |
| Employees, salaries, fines, absences, advances, KPI, employee meals | `docs/agent/payroll.md` |
| Telegram targets, messages, delivery tracking, cron notifications | `docs/agent/telegram.md` |
| Dashboard, reports, historical snapshots, profit and date ranges | `docs/agent/reporting.md` |
| Migrations, database compatibility, tests, source guards, deployment checks | `docs/agent/database-testing.md` |

The former 58 KB instruction file is preserved at `docs/agent/legacy-context.md`. Do not read it for normal work. Consult it only when investigating an older regression or migration absent from the focused guides.

## Universal invariants

- Preserve historical financial data. Paid order prices, costs, service rates, payment amounts, and reporting snapshots are immutable inputs.
- Catalog deletion is archival. Do not physically delete products or categories referenced by history.
- Keep protected costs, recipes, payroll, and accounting data out of public, waiter, cashier, and Telegram-menu payloads.
- Use shared domain helpers instead of duplicating payment, salary, date, or reporting calculations in pages.
- Prefer focused selector hooks in `src/store/appHooks.js`; keep `AppContext.jsx` as stable orchestration.
- Do not use blocking `alert()` or `window.confirm()` in operational flows. Show visible, retryable UI state.
- Treat network timeouts on idempotent writes as unknown outcomes and reconcile the durable record before retrying with the same identity.
- Do not weaken a regression/source-guard test merely to make the suite pass; understand the protected behavior first.
- Preserve unrelated user changes in a dirty worktree.

## Validation

For code changes, run the smallest relevant tests during development, then normally run:

```bash
npm test
npm run build
```

The known Vite large-chunk warning is not a build failure. Protected pages require an authenticated profile for browser verification.
