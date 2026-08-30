# Dashboard, Reports, Profit, and Historical Data

Read this guide for dashboard analytics, reports, historical drilldowns, immutable snapshots, date ranges, profit, and monthly/all-accounting views.

## Entry points

- UI: `src/pages/AdminDashboard.jsx`, `src/pages/Reports.jsx`, `src/pages/Expenses.jsx`, `src/pages/AccountingHistory.jsx`
- Shared logic: `src/lib/dashboardAnalytics.js`, `src/lib/monthlyIncome.js`, `src/lib/dishSales.js`, `src/lib/profit.js`, `src/lib/orderHistory.js`, `src/lib/accountingSummary.js`, `src/lib/closeout.js`
- Historical snapshot schema: migrations `114`, `147`, `157`, and related aggregate RPC migrations
- Focused tests: `tests/dashboardAnalytics.test.js`, `tests/monthlyIncomeSnapshots.test.js`, `tests/dishSales.test.js`, `tests/profit.test.js`, `tests/orderHistory.test.js`, `tests/financialHistorySnapshots.test.js`, `tests/sourceGuards.accounting-reporting.test.js`

## Loader boundaries

- Initial POS hydration contains active orders plus today's paid operational subset only. It is never a source for historical reports or Accounting ranges.
- Dashboard, Reports, Accounting, Monthly Estimate, and receipts use explicit bounded loaders.
- Older report receipts load their order/session directly by id.
- Monthly estimates query only the earliest order date needed for the business-activity boundary.
- Never load full paid-order history to populate overview summary cards when an aggregate RPC exists.

## Historical financial invariants

- Saved selling price, real-cost snapshot, service-rate snapshot, payment rows, category snapshot, and paid state are immutable reporting inputs.
- Profit is paid revenue minus non-cancelled sold-item cost through `src/lib/profit.js`.
- Never fall back to a product's current cost for an old order item with missing cost coverage; show unavailable until the one-time migration is applied.
- Product/category archival retains historical lookup context.
- Reports display the saved Regular/Tourist `orders.price_mode` in desktop, mobile, and details.

## Category and daily snapshots

- `order_items.category_id_snapshot` is the sold-time category. `category_snapshot_captured` distinguishes intentional uncategorized from legacy missing coverage.
- Category reports prefer the snapshot over the product's current category.
- `employee_daily_meal_expenses` supplies frozen completed-day employee-meal values.
- KPI rules cannot be inserted into finalized periods; bounded recovery eventually fills older missing KPI/meal dates.
- Daily ingredient consumption is theoretical Tech Card usage from paid, non-cancelled order-item quantities and service-only immutable `order_item_tech_card_ingredient_snapshots`, including nested recipe components. Weight is normalized to kg, volume to litres, and pieces remain counts; incompatible units are never combined.
- Ingredient value uses the saved per-unit Tech Card price. Missing legacy snapshots are reported as uncovered sales rather than filled from today's recipe.

## Dashboard presentation

- Sales by Category shows every category represented by sold items in the selected period.
- Best-Selling Dishes shows up to ten ranked sold products and may scroll internally.
- Never fabricate unsold products or empty categories to fill visual space.
- Average Daily Income by Month always shows the latest 12 calendar-month positions, suppresses numeric zero labels, and overlays the `business_settings.average_daily_break_even_income_uzs` target as a red dotted horizontal line. Completed actual months come only from immutable `dashboard_monthly_income_snapshots`; the current partial month is the only month aggregated live from orders.
- Migration `157` performs the one-time completed-history backfill. Its duplicate-safe daily cron finalizes the previous Tashkent month, so normal Dashboard reads never rescan completed order history for this chart.
- Monthly averages use total paid cafe income divided by all calendar days in a completed month. The current month uses elapsed calendar days through today.

## Accounting/report separation

- Overview aggregates are lightweight. Detailed order/item rows belong to reports, receipts, and drilldowns.
- Selected-month forecast uses that month's actual/expected operating costs only, not prior-period arrears.
- Fines are payroll deductions, never cash expenses. Employee meal snapshots are calculated operating costs without payment methods.
