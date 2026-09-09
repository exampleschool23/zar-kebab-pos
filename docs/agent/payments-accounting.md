# Payments, Service, Accounting, Expenses, and Daily Bazaar

Guide to cashier, payments, Accounting, expenses, and Daily Bazaar.

## Entry points

- UI: `src/pages/CashierBill.jsx`, `src/pages/Receipt.jsx`, `src/pages/Expenses.jsx`, `src/pages/AccountingHistory.jsx`, `src/pages/MonthlyEstimate.jsx`, `src/pages/DailyBazaar.jsx`
- Shared logic: `src/lib/analytics.js`, `src/lib/cashierCheckout.js`, `src/lib/billHandoff.js`, `src/lib/accounting.js`, `src/lib/accountingSummary.js`, `src/lib/expenses.js`, `src/lib/monthlyEstimate.js`, `src/lib/bazaar.js`
- Database boundaries: `src/lib/db.js`, migrations `083`, `090`, `097`, `109`, and `135`
- Focused tests: `tests/orderPayment.test.js`, `tests/atomicPaymentSettlement.test.js`, `tests/cashierCheckout.test.js`, `tests/accountingPages.test.js`, `tests/monthlyEstimate.test.js`, `tests/bazaar.test.js`, `tests/sourceGuards.payments-reporting.test.js`, `tests/sourceGuards.accounting-reporting.test.js`

## Payment and service math

- Use `normalizeServiceRatePct()`, `getOrderPaymentSummary()`, and `getOrderPaymentFields()` from `src/lib/analytics.js`; do not hand-roll totals in pages.
- Dine-in may include service. Take-away, delivery, and Game Club use zero service.
- Regular and Tourist service settings are separate; new dine-in orders snapshot the rate chosen by authoritative `price_mode`.
- Reuse an unpaid order's saved service rate only when its saved price mode matches the submitted mode. Empty/stale Regular shells cannot leak Regular service into Tourist orders.
- Active and paid orders keep their rate snapshot after settings change. Pending kitchen retries retain the original rate.
- Use shared loyalty/counter-item helpers. Reports read paid `orders.total`; unpaid bills recalculate from items.

## Split payments and corrections

- Completed split payment rows retain fixed amounts and have independent method selectors.
- Delete completed orders access permits atomic non-loyalty tender corrections.
- Loyalty rows are visible but immutable without a separate wallet reversal workflow.
- Corrections never change amounts, items, totals, paid state/time, loyalty data, service snapshots, or stock deductions.
- Order deletes require a reason popup; migration `184` snapshots reasons for Investor alerts. Payment corrections also notify Investor.

## Receipt printing

- Auto-print handoff opens the cashier bill with a one-time print request. An in-page receipt opens browser printing without a new tab/window.
- Manual printing refreshes the bill and uses the same receipt dialog.

## Accounting loading and presentation

- Do not show today-only POS orders while Accounting history loads.
- Wait for expenses, paid-order summary/history, and salary data before ending loading.
- KPIs use permission-checked aggregates, never full history. The all-time cash remainder excludes unpaid salary liability.
- Detailed order rows belong to reports, receipts, and drilldowns.
- Use four then three KPI cards on large screens; collapse payment-method balances in the left column.

## Expense history and monthly estimate

- Expenses allow today or three prior Tashkent dates; UI/database reject older dates. Income and unchanged history are allowed.
- Bonus display rows are projections: deletion targets `employee_salary_bonuses.source_id`, never a synthetic display id.
- Salary payments/accruals and Daily Bazaar totals remain protected from overview deletion.
- Fines reduce payroll liability but are not cash expenses.
- Monthly Estimate is selected-month actuals plus expected salary, rent, and utilities for that month only. Do not add older arrears/liabilities.
- Calculate salary operating cost per employee so one employee's advance or older-debt payment cannot distort another employee.
- `business_settings.monthly_utilities_uzs` is the plan; only recorded `utilities` rows are monthly actuals.
- `business_settings.average_daily_break_even_income_uzs` is the operator-entered Dashboard benchmark; it does not alter Accounting totals.

## Cash-expense Telegram delivery

- New cash expenses queue one immutable Investor delivery: manual text or a Bazaar PNG receipt and caption.
- Edits/deletes do not announce again. Do not project salary, bonus, employee meal, or calculated rows into this flow.
- See `docs/agent/telegram.md` for targets, message contents, and retry rules.

## Daily Bazaar

Files: `src/pages/DailyBazaar.jsx`, `src/pages/BazaarIngredients.jsx`, `src/lib/bazaar.js`; migrations `097`, `160`–`163`, `182`.

- Receipts contain product, category, quantity, unit, and exact amount.
- Product-line controls share one height; each optional line note uses a separate multiline field.
- Store buyer id and name snapshot. New entries use cash or card; historical terminal remains readable.
- New purchase lines choose an active canonical ingredient from `bazaar_product_catalog`; arbitrary product names are not accepted.
- `/admin/bazaar/ingredients` manages canonical names, categories, purchase units, normal unit prices, and active/archive state. Migration `182` allows owner renames; saves keep catalog keys and historical snapshots.
- Only owners write the catalog. Bazaar/Tech Card users read active names, units, and prices; Tech Card access excludes purchases and writes.
- Migration `161` starts the managed list empty without changing history.
- Normal unit price suggests the line total, but the exact paid total remains editable and is the historical Accounting source of truth.
- Each saved line snapshots its normal unit price, quantity-scaled normal total, and signed difference (`paid - normal`). UI and Investor Telegram show line/total differences: positive is above normal, negative below.
- Editing a durable line reuses its saved normal-price snapshot even when the current ingredient catalog price has changed.
- Catalog deletion is archival. Existing purchase lines keep their historical name, category, unit, and exact paid amount snapshots.
- Ingredient writes reconcile before retry and update locally.
- Keep ISO dates internally and use shared date-format helpers for display.
- The server calculates totals. Create retries reuse a request UUID.
- Save/edit/delete atomically maintains exactly one linked `expenses` row with `products_bazaar`; do not ask for duplicate Accounting entry.
- Normalize compatible units only (g→kg, ml→l); never combine counts with weights/volumes.
- Bazaar history loads only on `/admin/bazaar`, never during POS hydration.
