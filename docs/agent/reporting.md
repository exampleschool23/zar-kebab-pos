# Reporting

## Entry points

- UI: `src/pages/AdminDashboard.jsx`, `src/pages/Reports.jsx`, `src/pages/Expenses.jsx`, `src/pages/AccountingHistory.jsx`
- Shared logic: `src/lib/dashboardAnalytics.js`, `src/lib/monthlyIncome.js`, `src/lib/dishSales.js`, `src/lib/profit.js`, `src/lib/orderHistory.js`, `src/lib/accountingSummary.js`, `src/lib/closeout.js`
- Historical snapshot schema: migrations `114`, `147`, `157`, and related aggregate RPC migrations
- Focused tests: `tests/dashboardAnalytics.test.js`, `tests/monthlyIncomeSnapshots.test.js`, `tests/dishSales.test.js`, `tests/profit.test.js`, `tests/orderHistory.test.js`, `tests/financialHistorySnapshots.test.js`, `tests/sourceGuards.accounting-reporting.test.js`

## Loader boundaries

- Initial POS hydration contains active orders plus today's paid operational subset only. It is never a source for historical reports or Accounting ranges.
- Dashboard, Reports, Accounting, Monthly Estimate, and receipts use explicit bounded loaders.
- Old receipts load by order/session id.
- Monthly estimates query only the earliest needed order date.
- Use aggregate RPCs for overview cards.

## Historical financial invariants

- Saved selling price, real-cost snapshot, service-rate snapshot, category snapshot, and paid state are immutable reporting inputs. Payment rows are saved inputs; the authorized migration `201` split correction preserves their combined total and audits before/after allocations. Reports use its confirmed rows, including merged sessions.
- Profit: paid revenue minus non-cancelled costs (`src/lib/profit.js`).
- Missing historical cost: show unavailable until backfilled; never use current cost.
- Archival retains historical lookup context.
- Reports display the saved Regular/Tourist `orders.price_mode` in desktop, mobile, and details.

## Category and daily snapshots

- `order_items.category_id_snapshot` is the sold-time category. `category_snapshot_captured` distinguishes intentional uncategorized from legacy missing coverage.
- Category reports prefer the snapshot over the product's current category.
- `employee_daily_meal_expenses` supplies frozen completed-day employee-meal values.
- KPI rules cannot be inserted into finalized periods; bounded recovery eventually fills older missing KPI/meal dates.
- Daily ingredient consumption is theoretical Tech Card usage from paid, non-cancelled order-item quantities and service-only immutable `order_item_tech_card_ingredient_snapshots`, including nested recipe components. Weight is normalized to kg, volume to litres, and pieces remain counts; incompatible units are never combined.
- Ingredient value uses the saved per-unit Tech Card price. Missing legacy snapshots are reported as uncovered sales rather than filled from today's recipe.

## Dashboard presentation

- Recent Orders and receipt/delete controls live in Reports. `202` allows deletion only for today's Tashkent payment date (creation fallback), even for owners; older delete controls are hidden. Coverage: `tests/orderDeletion.test.js`.
- Sales by Category shows every category represented by sold items in the selected period.
- Product Contribution ranks ten products by revenue: quantity, share, snapshot profit, margin. Missing cost snapshots show unavailable profit. It reuses selected-period orders.
- Do not invent products/categories. Monthly Busy Hours uses migrations `192`–`193` to return 12 two-hour buckets for the current Tashkent month. It attributes paid demand to `created_at`, scans one indexed month, returns no order details, and highlights tied peaks.
- Monthly Income shows 12 months, hides zero labels, and plots `business_settings.average_daily_break_even_income_uzs` as a red dotted line. Past months use immutable `dashboard_monthly_income_snapshots`; this month uses completed Tashkent days.
- `157` backfills completed history; duplicate-safe daily cron finalizes last month. Dashboard never rescans completed months.
- Monthly averages use total paid cafe income divided by all calendar days. The current month excludes today and divides by completed days through yesterday; day one safely returns zero.

## Accounting/report separation

- Keep overview aggregates small; details belong in reports/receipts.
- Selected-month forecast uses that month's actual/expected operating costs only, not prior-period arrears.
- Fines are payroll deductions, never cash expenses. Employee meal snapshots are calculated operating costs without payment methods.

- Game Club (`game_club`) is a separate order-type revenue bucket in Dashboard and Reports. Its immutable paid totals remain included in overall Accounting, category, payment, and date-range totals. Never reclassify historical take-away/delivery sales. Regression coverage: `tests/gameClubOrders.test.js`.

- Ingredients movement (`186`): `get_ingredient_movement(date,date)` returns purchases, theoretical paid-order recipe usage, purchase amounts, and bought-minus-used per ingredient/unit for at most 366 Tashkent dates. Missing/incomplete snapshots are counted; migration `188` excludes unmatched and unmanaged ingredients from rows. Movement excludes opening stock, waste, and adjustments and is not an on-hand stock balance. Compatible g/kg, ml/l, pcs/piece normalize; packages stay separate. Raw snapshots remain service-only.

- Migrations `187`–`188` add categories and restrict movement to explicitly added (`is_catalog_managed`) ingredients, including archived ones with history. Category/search filters and name/quantity/movement/purchase-amount sorting operate locally without refetching.

- Ten-day income (`190`–`191`) shows the latest 20 periods (1–10, 11–20, 21–end) through a selected month. It scans at most eight indexed months, excludes today/future periods, caches results, hides empty months, starts choices at the earliest order month, and uses stable month colors. Zero periods in active months remain. Tests: `tests/weeklyIncome.test.js`.

- Dish sales requires loaded selected-range history; loading/errors cannot show zero sales. Low sellers ranks 15 active products, including unsold ones. Archives keep history but leave this ranking.

- Dish reconciliation uses saved service/loyalty and item prices; expose missing snapshots and residual differences. Period remainder includes calculated meals, excludes opening balances. Closeout variance is unknown without counted balances; CSV says Not measured. Tests: `tests/closeout.test.js`.
