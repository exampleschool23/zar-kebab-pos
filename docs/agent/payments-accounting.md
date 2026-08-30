# Payments, Service, Accounting, Expenses, and Daily Bazaar

Read this guide for cashier settlement, split payments, service fees, Accounting overview/history, cash expenses, monthly estimates, and Daily Bazaar.

## Entry points

- UI: `src/pages/CashierBill.jsx`, `src/pages/Receipt.jsx`, `src/pages/Expenses.jsx`, `src/pages/AccountingHistory.jsx`, `src/pages/MonthlyEstimate.jsx`, `src/pages/DailyBazaar.jsx`
- Shared logic: `src/lib/analytics.js`, `src/lib/cashierCheckout.js`, `src/lib/accounting.js`, `src/lib/accountingSummary.js`, `src/lib/expenses.js`, `src/lib/monthlyEstimate.js`, `src/lib/bazaar.js`
- Database boundaries: `src/lib/db.js`, migrations `083`, `090`, `097`, `109`, and `135`
- Focused tests: `tests/orderPayment.test.js`, `tests/atomicPaymentSettlement.test.js`, `tests/cashierCheckout.test.js`, `tests/accountingPages.test.js`, `tests/monthlyEstimate.test.js`, `tests/bazaar.test.js`, `tests/sourceGuards.payments-reporting.test.js`, `tests/sourceGuards.accounting-reporting.test.js`

## Payment and service math

- Use `normalizeServiceRatePct()`, `getOrderPaymentSummary()`, and `getOrderPaymentFields()` from `src/lib/analytics.js`; do not hand-roll totals in pages.
- Dine-in may include service. Take-away and delivery always use zero service.
- Regular and Tourist service settings are separate; new dine-in orders snapshot the rate chosen by authoritative `price_mode`.
- Reuse an unpaid order's saved service rate only when its saved price mode matches the submitted mode. Empty/stale Regular shells cannot leak Regular service into Tourist orders.
- Active and paid orders keep their rate snapshot after settings change. Pending kitchen retries retain the original rate.
- Apply loyalty and counter-item rules through shared helpers. Paid revenue must remain stable across refresh and regrouping.

## Split payments and corrections

- Completed split payment rows retain fixed amounts and have independent method selectors.
- Owners may atomically correct each non-loyalty method; recalculate the order summary method as cash/card/terminal/mixed.
- Loyalty rows are visible but immutable without a separate wallet reversal workflow.
- Corrections never change amounts, items, totals, paid state/time, loyalty data, service snapshots, or stock deductions.

## Accounting loading and presentation

- Initial POS state is not an Accounting history result. Do not display today-only operational orders while a selected history range loads.
- Keep explicit readiness for expenses, paid-order summary/history, and salary data before ending the page loading state.
- Overview cards use the compact permission-checked paid-order aggregate; do not download complete paid orders for summary KPIs.
- Detailed order rows belong to reports, receipts, and drilldowns.
- Keep the seven KPI cards readable (four then three on large screens). Payment-method balances remain collapsed in the left column.

## Expense history and monthly estimate

- Bonus display rows are projections: deletion targets `employee_salary_bonuses.source_id`, never a synthetic display id.
- Salary payments/accruals and Daily Bazaar totals remain protected from overview deletion.
- Fines reduce payroll liability but are not cash expenses.
- Monthly Estimate is selected-month actuals plus expected salary, rent, and utilities for that month only. Do not add older arrears/liabilities.
- Calculate salary operating cost per employee so one employee's advance or older-debt payment cannot distort another employee.
- `business_settings.monthly_utilities_uzs` is the plan; only recorded `utilities` rows are monthly actuals.
- `business_settings.average_daily_break_even_income_uzs` is the operator-entered Dashboard benchmark; it does not alter Accounting totals.

## Cash-expense Telegram delivery

- A newly inserted `expenses` cash expense queues one immutable Investor delivery. Manual expenses and new Bazaar purchases share the endpoint.
- Edits/deletes do not announce again. Do not project salary, bonus, employee meal, or calculated rows into this flow.
- See `docs/agent/telegram.md` for targets, message contents, and retry rules.

## Daily Bazaar

Main files: `src/pages/DailyBazaar.jsx`, `src/pages/BazaarIngredients.jsx`, `src/lib/bazaar.js`, and migrations `097`, `160`–`163`.

- A receipt contains one or more product lines with product, category, quantity, unit, and exact amount.
- Store the buyer profile id plus historical name snapshot. New entries use cash or card; historical terminal values remain readable.
- New purchase lines choose an active canonical ingredient from `bazaar_product_catalog`; arbitrary product names are not accepted.
- `/admin/bazaar/ingredients` manages canonical names, categories, purchase units, normal unit prices, and active/archive state. Names are immutable after creation; archive a misspelling and add the corrected ingredient.
- Ingredient catalog add/edit/archive actions are owner-only in both the UI and database. Other staff with Bazaar access may view the catalog; normal Daily Bazaar purchase permissions are unchanged.
- Migration `161` starts this managed list empty: older free-text suggestions remain hidden compatibility records, while all Daily Bazaar purchases and item snapshots stay intact.
- Normal unit price suggests the line total, but the exact paid total remains editable and is the historical Accounting source of truth.
- Each saved line snapshots its normal unit price, quantity-scaled normal total, and signed difference (`paid - normal`). Entry UI and Investor Telegram show per-line and overall differences; positive means paid above normal and negative means paid below normal.
- Editing a durable line reuses its saved normal-price snapshot even when the current ingredient catalog price has changed.
- Catalog deletion is archival. Existing purchase lines keep their historical name, category, unit, and exact paid amount snapshots.
- Keep ISO dates internally and use shared date-format helpers for display.
- The server calculates totals. Create retries reuse a request UUID.
- Save/edit/delete atomically maintains exactly one linked `expenses` row with `products_bazaar`; do not ask for duplicate Accounting entry.
- Normalize compatible units only (g→kg, ml→l); never combine counts with weights/volumes.
- Bazaar history loads only on `/admin/bazaar`, never during POS hydration.
