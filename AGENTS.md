# Zar Kebab POS Agent Context

This file is the AI-friendly project map. Read it before changing code so future work does not repeat the recent loading, service-rate, and kitchen-submit regressions.

## Project Snapshot

Zar Kebab POS is a Vite React 18 app backed by Supabase. It supports public menu viewing, waiter ordering, kitchen order preparation, cashier billing, admin management, reports, and a Telegram mini app/bot integration.

Core stack:
- React + React Router in `src/App.jsx`
- Shared POS state in `src/store/AppContext.jsx`
- Supabase reads/writes/realtime in `src/lib/db.js`
- Payment, service, reporting, and cart math in `src/lib/analytics.js`
- Dashboard analytics in `src/lib/dashboardAnalytics.js`
- SQL migrations in `supabase/`
- Node test runner tests in `tests/`

## Local Commands

Use these from the repo root:

```bash
npm run dev
npm test
npm run build
npm run db:health
npm run bot:telegram
```

Equivalent direct commands used in this environment:

```bash
/Users/hoggish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
/Users/hoggish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build
/Users/hoggish/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js --host 127.0.0.1
```

`npm run db:health` runs `scripts/check-db-health.js`. It reads `.env.local`/`.env`, connects to Supabase, and checks required tables, columns, and RPCs. Use it first when a page loads forever or logs missing migration warnings.

## Routes And Roles

Routes live in `src/App.jsx`.

Public:
- `/` redirects based on auth/profile role.
- `/menu` is the public menu.
- `/telegram` is the Telegram mini app.
- `/login`, `/auth/callback`, `/reset-password`, `/pending-approval`.

Protected:
- Waiter: `/waiter/tables`, `/waiter/order/:tableId`, `/waiter/take-away`
- Kitchen checks: `/kitchen-check/:orderId` (print-only; the retired `/kitchen` screen redirects to `/admin`)
- Cashier: `/cashier/tables`, `/cashier/bill/:tableId`, `/cashier/bill/order/:orderId`, receipt routes
- Admin/reporting: `/admin`, `/admin/menu`, `/admin/tech-cards`, `/admin/tables`, `/admin/users`, `/admin/reports`, `/admin/audit`, `/admin/settings`
- Daily bazaar: `/admin/bazaar` (receipt-level purchases, product quantities, spend analytics)

Role access rules are centralized in `src/lib/permissions.js`.

## Data Flow

`AuthContext` reads Supabase auth/profile. `ProfileSync` in `src/App.jsx` mirrors that profile into `AppContext` with a `LOGIN` action.

`AppContext` owns local POS state:
- settings
- user
- tables
- menu items/categories
- orders
- cart
- connection notice
- loaded flag

State changes are split by domain under `src/store/`:
- `settingsReducer.js` handles language and business settings.
- `appMetaReducer.js` handles login/logout, selected table, loaded/error, and connection notices.
- `tablesReducer.js` handles table CRUD and table status changes.
- `menuReducer.js` handles categories, menu items, and reorder actions.
- `cartReducer.js` handles waiter cart mutations.
- `ordersReducer.js` handles kitchen submit, item status, billing, quick items, and payment actions.
- `reducerHelpers.js` holds shared reducer defaults and pure helpers.

`AppContext.jsx` should stay orchestration only: initial state, domain reducer pipeline, Supabase hydration/realtime, and `dbDispatch`. `AppProvider` hydrates from Supabase with `loadPOSData()`, subscribes with `subscribeToRealtime()`, and exposes `dispatch: dbDispatch`. `dbDispatch` is intentionally wrapped in `useCallback`; do not make it unstable or `ProfileSync` can re-dispatch forever and make the website load forever.

Selector hooks live in `src/store/appHooks.js`. Prefer adding focused hooks there, such as `useOrders`, `useCart`, `useSettings`, or `useAppDataStatus`, instead of spreading more direct state-shape knowledge into pages.

Admin table management lives at `/admin/tables` (Settings → Tables) in `src/pages/AdminTables.jsx`. Waiter tables must stay operational only: disabled tables (`is_active === false`) are hidden from `src/pages/WaiterTables.jsx`, and edit/delete controls belong only in admin table management.

## Recent Regression Context

These bugs were recently fixed and are now protected by tests:

1. Service rate was set to 15% but not consistently applied.
   - Realtime now includes `business_settings`.
   - Service-rate normalization lives in `normalizeServiceRatePct()` in `src/lib/analytics.js`.
   - Payment summaries should use `getOrderPaymentSummary()` / `getOrderPaymentFields()`, not hand-rolled total math.

2. Send to kitchen looked stuck after tapping.
   - `CartPanel` accepts parent-controlled `isSending` and `onSendingChange`.
   - `WaiterOrder` owns `isSendingOrder`, blocks cart/menu mutations during send, and passes send state to `CartPanel`.
   - Do not reintroduce independent local send state inside `CartPanel`.

3. Sending to kitchen could clear cart items added during a pending send.
   - `removeSentCartItems(cart, sentSnapshot)` removes only the submitted snapshot.
   - Do not replace this with `cart: []` in `SEND_TO_KITCHEN`.

4. App/kitchen/admin pages could load forever.
   - Root cause was an unstable `dispatch` causing `ProfileSync` to repeatedly dispatch `LOGIN`.
   - `dbDispatch` must stay stable.
   - `ProfileSync` deps should stay field-based: profile id, role, full name, email, and dispatch.

5. Supabase realtime/HMR could reuse a stale channel.
   - Realtime channel names are unique, currently `pos-realtime-${Date.now()}-...`.
   - Do not go back to a fixed `pos-realtime` channel name.

6. Admin menu crashed because upload `error` was rendered inside the wrong component.
   - Upload error rendering belongs inside `ImageUploadField`.
   - `SortableItemCard` must not reference the upload `error` state.

7. Configured product variants could inherit or overwrite another variant's quantity.
   - Option-product detail submissions are additive and start at one.
   - `ADD_TO_CART` accepts an explicit quantity and increments only the matching `cart_item_key`.

8. Auto-printed kitchen checks could substitute an older round while the new round was loading.
   - Requested kitchen rounds must match exactly; never fall back to another round.
   - Missing local rounds are refreshed directly before printing, and each round auto-prints only once.
   - Failed retries retain the same round and item ids; migration `096` makes that retry idempotent.

9. Returning to the waiter table grid could show stale order/table status until a full browser reload.
   - `WaiterTables` requests a fresh operational table/order refresh whenever the route mounts or is restored from the browser back-forward cache.
   - The stable `refreshPOSData` context callback keeps current cards visible while reloading and renews the realtime subscription.

10. Loading the waiter table grid became slower as completed-order history grew.
   - Operational order state contains every active order regardless of age, plus only today’s paid orders for cashier/recent activity.
   - Full historical ranges belong to Dashboard, Reports, and Accounting loaders, never initial POS hydration or realtime refreshes.
   - Returning to `WaiterTables` refreshes only restaurant tables and operational orders; it does not reload the menu or reporting history.
   - Admin table deletion verifies full history on demand and again before the database delete; older report receipts load their order/session directly by id.
   - Monthly estimates query only the earliest order date needed for the business-activity boundary instead of relying on global order history.

11. Menu-item cost and profit reporting must preserve historical accuracy without exposing costs publicly.
   - Protected current costs live in `menu_item_costs`, not in public `menu_items` rows.
   - Protected per-variant costs live in `menu_item_costs.variant_costs`; public `option_groups` contain names and prices only.
   - `order_items.cost_price` is filled by a database trigger when an item is sold.
   - The trigger snapshots the selected variant cost when configured, otherwise the parent item cost.
   - Profit is paid revenue minus non-cancelled sold-item cost via `src/lib/profit.js`.
   - Saved order-item selling prices and real-cost snapshots are immutable reporting inputs. Later edits to `price`, `old_price`, parent cost, or variant cost affect only order items created after the edit and must never change previous revenue, Net Profit, reports, or analytics.
   - Product and category deletion is archival. Archived lookup rows remain available to historical dish/category reports, and database triggers reject physical catalog deletion.
   - Product-editor profit margin is `(selling price - real cost) / selling price`; it is a live preview and is not persisted.
   - Migration `114` freezes missing legacy costs once. Runtime reporting never falls back to the current menu cost; missing coverage is shown as unavailable until the migration is applied.

12. Employee fines must reduce payroll liability without becoming cash expenses.
   - Fine records live in `employee_salary_fines` and require a non-empty reason.
   - `getSalaryFineAmount()` and `getSalaryDue()` apply fines from their recorded date and carry excess deductions forward.
   - Fines appear in employee salary history, but never in Accounting cashflow or expense totals because no money leaves the cafe.
   - Fine inserts, updates, and deletes are retained in `accounting_record_audit` as `salary_fine` events.
   - Combined payment, bonus, and fine history sorts by effective date, then by `created_at` newest-first for same-day entries.

13. Accounting summaries must stay readable instead of becoming one dense strip.
   - The seven top KPIs use four columns on large screens, producing a four-card row followed by a three-card row.
   - Payment-method balances live in the left Accounting column behind the collapsed `MethodBalancesDisclosure` control.
   - Do not restore the full-width always-open payment-method balance grid above the Accounting content.

14. Accounting must not render today-only operational orders while the selected monthly/history range is still loading.
   - Initial POS hydration intentionally includes active orders plus today’s paid orders, but that partial operational set is not an Accounting history result.
   - `Expenses` waits for expenses, paid-order history, and salary data before ending the loading state.
   - `paidHistoryReady` prevents the page from merging globally hydrated today orders until the selected paid-history request succeeds.

14. New menu products must never be created without a real cost.
   - The Admin Menu requires a positive protected cost for normal and cashier-quick products.
   - Creation uses the atomic `create_menu_item_with_cost(payload jsonb)` RPC so the public product and private cost row commit or roll back together.
   - Per-variant costs remain optional and fall back to the required parent product cost.

15. Shelf stock must decrease exactly once when an order is paid.
   - Migration `106` attaches stock deduction to the atomic unpaid-to-paid database transition.
   - Only non-cancelled piece quantities are deducted; weight-based inventory needs a separate decimal stock model.
   - Parent and selected variant stock values are clamped at zero.
   - `orders.stock_deducted_at` prevents payment retries or later payment-method corrections from deducting twice.
   - Existing paid orders are marked as already processed when the migration is applied, so historical sales never rewrite manually maintained stock.

16. The Accounting overview must not download complete paid orders for its summary cards.
   - Migration `109` exposes a permission-checked aggregate of paid revenue, loyalty value, protected sold-item cost, sales days, and payment-method income.
   - `Expenses` loads that compact summary instead of all order and item rows for the selected period.
   - The legacy full-history loader is only a deployment-order fallback while migration `109` is missing.
   - Detailed order rows remain the responsibility of reports, receipts, and historical drill-down pages.

17. The Telegram Mini App is a read-only customer menu.
   - The unused customer checkout and “My Orders” features were retired after the production database showed no Telegram-created orders since their introduction.
   - `/api/telegram/order` and `/api/telegram/orders` must not be restored without an explicit product decision.
   - Keep Telegram authentication, loyalty lookup, contact information, employee notifications, and POS order-status notifications separate from the retired customer-ordering flow.

18. Every saved salary operation must immediately have Telegram delivery tracking.
   - Migration `113` queues a `not_attempted` delivery record when a payment, bonus, fine, or absence is inserted.
   - Migration `116` adds the same database-first tracking for effective-dated salary-rate changes, while deliberately excluding an employee's first/initial rate.
   - The authenticated employee-notification endpoint advances that record through pending, sent, failed, skipped, or confirmed states for the private employee chat and salary group independently.
   - This database-first tracking prevents stale browsers and failed API requests from leaving no trace.
   - The Salaries page combines every salary-operation delivery under Salary notification status, five records per page, with retry controls for unsent destinations.

19. Salary-payment Telegram delivery has two independent destinations.
   - The private employee message keeps its receipt-confirmation button.
   - The salary group uses the `salary_events` row in `telegram_notification_targets`, with `TELEGRAM_SALARY_PAYMENTS_CHAT_ID` only as a deployment-order fallback, and receives a separate message without a confirmation button.
   - Salary-payment delivery must never fall back to `TELEGRAM_TEAM_CHAT_ID` or the completed-orders group.
   - Employee and group delivery statuses are recorded separately so either destination can fail or retry without duplicating the other.

20. Every recorded salary operation must notify the dedicated salary group.
   - Payment, bonus, fine, absence, and salary-rate change records notify both the salary group and the linked employee, except an automatic daily KPI bonus whose employee amount is folded into the one combined daily salary summary.
   - All five types reuse `api/telegram/employee-notification.js` so the Vercel Hobby deployment stays within its function limit.
   - Bonus, fine, absence, and rate-change employee/group delivery is duplicate-safe and independently auditable through `employee_salary_group_notification_deliveries`.
   - A rate-change message includes the applicable previous rate when available, the new amount and unit, and its effective date; initial salary setup is not treated as a change.
   - A Telegram notification is marked sent only after Telegram returns a message id.

21. Completed split payments must remain individually correctable.
   - The owner correction UI shows every saved payment row with its fixed amount and an independent method selector.
   - Migration `117` updates the selected `order_payments` rows atomically and recalculates each affected order's summary method (`cash`, `card`, `terminal`, or `mixed`).
   - Loyalty payment rows are visible but immutable because changing them requires a separate wallet reversal workflow.
   - Individual corrections must never change payment amounts, order items, totals, paid status/time, or loyalty data.

22. Meal availability affects only the waiter menu.
   - `menu_items.available` controls whether a meal appears in waiter ordering and whether stale waiter selections can still be ordered.
   - Public and Telegram menus ignore `available` and render active meals normally. `public_hidden` is the independent control for hiding a product from customer menus and never hides it from waiters.
   - Waiter add/increment/detail-submit paths must still reject stale unavailable selections.
   - Products no longer have a separate waiter-hide editor control: legacy item values are ignored, while category and variant waiter visibility remain separate controls; `public_hidden`, `cashier_only`, schedules, and category visibility still apply.
   - `deleted_at` is the archive boundary. Archived products and categories must never reappear merely because unavailable meals are now visible.
   - `stock_count` is shelf inventory and is not an availability flag; do not infer menu visibility or orderability from a zero stock count.
   - Migration `118` returns active unavailable products from the customer-menu RPC and anonymous select policy while preserving every explicit hiding and archive rule.

23. Salary advances must remain visible without reducing another employee's liability.
   - `getSalaryBalance()` is the signed employee ledger: accrued salary minus recorded payments and fines.
   - A payment or fine above the currently accrued salary creates a negative balance that carries forward against later accrual.
   - `getSalaryDue()` remains the nonnegative amount currently owed to one employee.
   - `getTotalSalaryDue()` sums those per-employee liabilities, so one employee's advance never hides salary owed to another employee.
   - Salary payment entry must continue to accept a positive manual payment when the current balance is zero or negative.

24. Bonus, fine, and absence events also notify ZarKebab Team.
   - Migration `119` adds the separate `team_events` Telegram target and independent Team delivery columns to `employee_salary_group_notification_deliveries`.
   - New bonus, fine, and absence rows queue Team delivery as `not_attempted` in the same database trigger that queues employee and salary-group delivery.
   - Team announcements include the saved amount and the full fine reason or absence note, but omit the employee's remaining salary balance and the manager identity.
   - Team announcements stay compact: no promotional intro/closing paragraphs or blank spacer lines; optional empty notes are omitted.
   - Bonus notifications omit payment method for the employee, salary group, and Team; the method remains stored in Accounting.
   - Private employee, salary-group, and Team bonus/fine/absence dates use the shared localized long-date formatter (for example, `12 августа 2026` in Russian); automatic KPI has no separate private event message.
   - Historical events are marked `skipped` during migration so deployment never broadcasts old salary events unexpectedly.
   - Salary payments and salary-rate changes are not Team events; their Team status remains non-retryable `skipped`.
   - Employee, salary-group, and Team retries must remain independent and duplicate-safe.

25. Meal availability is controlled by Menu write access.
   - Owners and admins with Manage Menu access may create unavailable products and change `menu_items.available`.
   - The Admin Menu availability editor and quick-toggle controls follow the same Manage Menu access rule.
   - Migration `122` enforces this at the database boundary via `current_staff_can_write('menu')`.
   - Product archival uses `deleted_at` and must not change `available`.

26. Hiding an item from the public menu is controlled only by an owner.
   - Admins with Menu write access may see `public_hidden` and edit other product fields, but the public-menu checkbox stays locked.
   - Non-owner product saves preserve the stored `public_hidden` value, and new non-owner products default to public visibility.
   - Migration `121` enforces the same restriction for direct updates and product-creation RPCs.
   - `cashier_only`, category visibility, schedules, and per-option visibility are separate controls and are not covered by this field-specific rule.

27. Opening a waiter table is a direct price-mode choice.
   - Staff chooses the compact R or T pricing option and enters the waiter order page immediately; table entry must not ask for a PIN or create a Guest-mode session.
   - The selected mode is carried in the order route until the cart or active order becomes the authoritative price-mode source.
   - Active orders keep their saved mode locked, and conflicting active modes still require staff review rather than guessing.
   - Legacy stored Guest sessions are cleared automatically so older tablets cannot remain trapped behind the retired PIN flow.

28. Price-mode recalculation must keep the menu, cart, and open order in sync.
   - Before a kitchen order exists, a non-empty cart's saved `price_mode` is the ordering-mode source of truth. Do not reset the menu to Regular merely because `activeOrder` is absent.
   - Recalculate both plain products and configured variants from their immutable `base_price`; never compound the Tourist markup or replace a variant's base with its displayed Tourist price.
   - Paid order items remain historical snapshots and must never be repriced.

29. Menu preparation estimates are customer-facing expectations.
   - `menu_items.estimated_prep_minutes` stores a whole-number estimate from 1 to 180 minutes and defaults existing/new products to 15.
   - Public, Telegram, guest, and waiter product cards use the current catalog estimate; it is not a promised completion timestamp and is not copied into historical order totals.
   - Product creation and editing must preserve the configured estimate, and customer-facing labels stay localized.

30. Table entry must remain understandable to operational staff.
   - The entry dialog contains only R/T, Cancel, and Enter table controls.
   - It never creates an order merely by opening the table; the waiter builds the cart and uses the normal Send to Kitchen action.
   - Reserved-table seating still clears reservation fields before entering the order page.

31. Empty order shells must not lock table pricing.
   - `getTableGuestEntryContext()` considers only unpaid, non-cancelled table orders that still contain at least one non-cancelled, positive-value item.
   - Empty orders, stale stored totals without items, and orders whose items are all cancelled do not show the active-order notice or disable the R/T choice.

32. Accounting Expense History may remove recorded employee bonuses.
   - Bonus display rows are projections of `employee_salary_bonuses`; deleting one must target its `source_id`, never the synthetic Expense History id.
   - Salary payments, automatic salary accruals, and Daily Bazaar total rows remain protected from deletion on the overview.
   - Bonus removal follows Accounting write access and remains covered by the immutable accounting audit trigger.

33. Today's employee absence can be corrected directly from the employee card.
   - The Undo absence action is available only for an active employee with an exact absence row for the current Tashkent date and requires Accounting write access.
   - Undo is a confirmed exact-row delete guarded by absence id, salary profile id, and date; a zero-row result is an error, never a silent success.
   - The correction restores that day's salary accrual and is captured in the immutable Accounting audit. Telegram messages already delivered cannot be recalled.
   - Deleted bonus, fine, absence, and salary-rate events remove their polymorphic Telegram delivery rows so they cannot remain retryable.

34. Menu-item deletion must work reliably on touch devices.
   - Product trash buttons stop pointer propagation from the sortable grid and use explicit touch-manipulation behavior.
   - Deletion uses an in-app confirmation dialog, never `window.confirm()`, so mobile Safari cannot lose the action behind browser UI.
   - The confirmed action remains a history-safe archive through `DELETE_MENU_ITEM`; it never physically deletes catalog history.
   - Failed archives stay visible and retryable inside the dialog, and a zero-row database update is never reported as success.
   - Archived products in stale waiter/cashier sessions are blocked both by refreshed catalog checks and at the `order_items` database boundary, including quantity increases.

35. Monthly Estimate focuses on selected-month actuals.
   - Do not restore the removed all-time Main numbers section; the page is for the selected month.
   - Expenses at a glance combines payments already recorded in the selected month with the salary, rent, and utilities still expected for that same month.
   - Never add salary arrears or other liabilities carried from previous months to the selected-month forecast.
   - Calculate selected-month salary operating cost per employee so an advance or older-debt payment for one employee cannot reduce or inflate another employee's selected-month salary cost.
   - Fines remain visible as payroll deductions but never become cash expenses. Absences remain visible as days.
   - Monthly utilities are configured in `business_settings.monthly_utilities_uzs`; only recorded `utilities` expenses appear in the monthly actuals.

36. A kitchen-submit timeout is an unknown outcome until its exact round is reconciled.
   - `SEND_TO_KITCHEN` keeps immutable table, order, item, and kitchen-round ids for every retry.
   - If the browser response exceeds its deadline, query the durable round receipt first, then use live `order_items` and cancellation history as a rolling-deployment fallback; every expected item id must match before reporting success.
   - A fully committed round is treated as success so the sent cart clears locally even when the response was lost.
   - A missing or partially visible round remains an error and retains the same duplicate-safe retry action in provider state and session storage.
   - While an outcome is unresolved, table navigation and cart mutation stay locked; retrying reuses the saved identity instead of generating another order.
   - Durable `order_kitchen_rounds` receipts are the database idempotency boundary. They survive payment, cancellation, and order/item deletion so a retry can never resurrect an old round.

37. Daily employee KPI bonuses are paid from finalized dine-in gross sales.
   - Each enabled effective-dated rule receives its full basis-point percentage of restaurant-wide paid dine-in `subtotal + service_fee` for the completed Tashkent date; loyalty never reduces this base.
   - Absent employees and dates outside the employee's joined/ended employment window are skipped.
   - Date runs and per-employee calculation snapshots are immutable and duplicate-safe. Cron retries KPI finalization and unsent combined salary summaries for the last seven completed dates in the 01:00 Tashkent hour.
   - Generated rows are immediate `employee_salary_bonuses` expenses using the salary profile payment method. The employee receives Salary and Bonus together in one private daily summary; separate private and Salary-group KPI events are terminally skipped, while the Team KPI announcement remains independently retryable.
   - Only the service-role finalizer may create a `daily_kpi` bonus, and generated financial fields cannot be updated. A failed date finalization must defer its daily salary summary.
   - Deleting a generated bonus marks its calculation result `voided` and never causes a retry to recreate it.

38. Regular and Tourist dine-in service rates are separate order snapshots.
   - `business_settings.service_rate_pct` configures Regular service (15% default), while `tourist_service_rate_pct` configures Tourist service (20% default).
   - New dine-in orders select the configured rate from their authoritative `price_mode` and save it in `orders.service_rate_pct`; active and paid orders keep that snapshot when settings later change.
   - Pending kitchen retries retain the originally selected service rate. Take-away and delivery service remain zero regardless of price mode.

39. KPI assignment removal and employee-card display preserve effective-dated history.
   - Only owners may remove an unused KPI rule, enforced both by the Salaries UI and the `employee_kpi_rules` delete RLS policy. Accounting writers may still create and update rules.
   - Removal targets the exact displayed rule and requires one returned deleted row. Rules referenced by finalized KPI results remain protected and must never be deleted or rewritten.
   - Employee cards show the rule effective on the current Tashkent date, including enabled or disabled state. A future scheduled rule must not appear as the employee's current KPI.
   - If migration `129` is not available, the KPI row reports that state without preventing salary employee cards from loading.
   - The Salaries page contains only the Employee KPI configuration form; it does not duplicate a Saved settings list or aggregate Automatic KPI history. Current KPI is visible on the employee card, and each generated day is inspected through that employee's Salary History.
   - Add employee salary and Employee KPI percentage share the same two-column Salary settings grid to use the available space, while keeping their save actions independent.
   - Salary History includes a separate selected-month KPI bonus total alongside the all-bonuses total; automatic KPI remains part of the all-bonuses amount and is also broken out for visibility.

40. Daily salary and automatic KPI Telegram delivery is Russian-first.
   - The employee's combined daily Salary + Bonus summary is always rendered in Russian, regardless of the private link's saved language preference.
   - Automatic KPI announcements to ZarKebab Team are always rendered in Russian, regardless of the target's configured language.
   - Other manually recorded salary events retain their existing employee or target language behavior.

41. Daily payroll Telegram messages expose only the information each audience needs.
   - The employee's combined daily summary shows attendance, salary earned, bonuses, and current due. It does not repeat fines or salary payments, which retain their own immediate notifications and history records.
   - The Salary group receives only the aggregate daily salary/KPI report; it does not receive per-employee automatic KPI details.
   - ZarKebab Team receives only the employee name, paid KPI bonus amount, and date. It must never receive the restaurant sales base, KPI percentage, salary due, or manager identity.

42. A stale order shell must not leak the wrong service rate into a new price mode.
   - Reuse an unpaid order's saved service-rate snapshot only when its saved `price_mode` matches the submitted mode.
   - An empty or stale Regular shell must never carry 15% into a Tourist submission; the new Tourist order uses the configured Tourist rate.
   - Paid orders remain immutable historical snapshots even if an earlier bug saved the wrong rate.
   - Reports show the saved Regular/Tourist mode from `orders.price_mode` in desktop rows, mobile cards, and order details.

43. Dashboard ranking cards should use their available height.
   - Sales by Category shows every category represented by sold items in the selected period.
   - Best-Selling Dishes shows up to ten ranked sold products instead of stopping at five, with internal scrolling when needed.
   - Never fabricate empty categories or unsold products merely to fill visual space.

44. Menu tech cards describe the current recipe without rewriting sales history.
   - Each active menu item may have one protected `menu_item_tech_cards` row and ordered `menu_item_tech_card_ingredients` rows.
   - Ingredient quantity multiplied by its selected-unit price produces the batch cost; dividing by `portion_count` produces the current calculated portion cost.
   - Tech-card edits use `save_menu_item_tech_card(payload jsonb)` so the card and full ingredient list save atomically.
   - The `tech_cards` page feature controls drawer, route, and protected recipe reads. Manage Menu separately controls recipe writes, so Tech Cards access without Manage Menu is read-only.
   - Tech-card ingredient prices are staff-only; they must never appear in public, Telegram, waiter, cashier, order, or receipt catalog payloads.
   - Saving a tech card makes its calculated per-portion cost the protected catalog `menu_item_costs` value for future sales. The Admin Menu shows that cost as read-only until the tech card is removed; products without a tech card keep their manually editable real cost.
   - A recipe edit must never rewrite `order_items.cost_price`, paid-order profit, or any historical report. Only future order-item cost snapshots use the newly synchronized tech-card cost.

45. Average employee meals are attendance-based calculated operating costs.
   - `business_settings.average_daily_employee_meal_uzs` is the average daily amount for each present employee, not a one-time restaurant total.
   - `employee_daily_meal_expenses` freezes one immutable completed-day row containing the configured-rate snapshot, present-employee count, and total. Reports, Accounting, All Accounting, Monthly Estimate, and Telegram must read that snapshot instead of recalculating historical dates from today's setting.
   - Migration `147` freezes legacy dates once with the only recoverable pre-ledger input: the rate configured when the migration is applied. Later rate edits affect only subsequently finalized dates.
   - The daily cron asks the database for missing meal dates independently of KPI runs and repairs them in bounded batches, including for restaurants with no KPI rule.
   - Recorded absences and employment start/end boundaries control who is counted. Future days are excluded from actual reports.
   - Calculated meal rows reduce the report remainder but do not claim a cash/card/terminal payment method or mutate the recorded expense ledger.
   - The aggregate daily Telegram message shows the employee-count formula and goes to the configured ZarKebab Investor group. Its legacy database target key remains `salary_events` for delivery-history compatibility.

46. Financial report history uses immutable category and daily snapshots.
   - `order_items.category_id_snapshot` captures the product category when a sold item is created. `category_snapshot_captured` distinguishes an intentional null/uncategorized snapshot from a legacy row that still needs its one-time backfill. Category reports must prefer the snapshot over the product's current `category_id`.
   - KPI rule effective dates cannot enter an already finalized period. The UI starts at the current Tashkent date and migration `147` enforces the latest finalized boundary for direct writes.
   - The daily cron retries the recent delivery window and also asks the database for older missing KPI dates in bounded batches, so an outage longer than seven days eventually heals.
   - Employee deactivation `ended_at` and reactivation dates are inclusive working dates. Only the intervening dates become absences, and archived `deleted_at` is stored as the exclusive boundary after the final working date.

47. Making a menu product available or unavailable notifies ZarKebab Team in Russian.
   - Every authenticated `available: true -> false` and `false -> true` transition queues an immutable delivery row with the Russian product-name snapshot, transition type, and staff profile that made the change.
   - Admin Menu saves and quick availability toggles use the same database-backed event and shared authenticated Telegram endpoint; kitchen cancellation also uses the unavailable path.
   - Both Team messages are always Russian, regardless of the Telegram target language, and include the product and employee name.
   - Delivery is duplicate-safe; editing a product without changing its availability must never announce it again.
   - Product archival does not change `available` and must not create an unavailable-product announcement.
   - At 08:00 Tashkent each day, the shared Telegram cron sends ZarKebab Team one Russian snapshot of every unavailable active product, or confirms that all products are available.
   - The daily snapshot excludes archived products and products in archived categories, groups products under their Russian category names in saved category order, records the exact ids/names/categories sent, and is duplicate-safe per Tashkent business date.

48. Every newly recorded cash expense notifies ZarKebab Investor.
   - Inserts into `expenses` with `entry_type = 'expense'` queue an immutable delivery snapshot before the authenticated app requests Telegram delivery.
   - Manual Accounting expenses and new Daily Bazaar purchases both call the same shared notification endpoint; Bazaar edits and expense edits/deletes do not create another announcement.
   - The legacy `salary_events` target key remains the independently configured ZarKebab Investor group for delivery-history compatibility.
   - Messages use the target language and include amount, date, category, payment method, optional supplier/description, the employee who added the expense, and the recorded total for that expense month.
   - Delivery is duplicate-safe and becomes `sent` only after Telegram returns a message id. Do not project salary, bonus, employee-meal, or other calculated Accounting rows into this flow because they are not inserted `expenses` records and already have separate messaging rules.

49. The waiter order button and drawer distinguish submitted orders from the unsent cart.
   - The header button reports non-cancelled submitted quantities when a table already has an active order; it must never say the cart is empty merely because the next unsent batch is empty.
   - When submitted items exist, the empty cart area says there are no new items and invites the waiter to add the next batch.
   - Submitted kitchen rounds remain visible while the waiter builds another cart batch. Each round has a stable `Order 1`, `Order 2`, and so on heading plus its own kitchen-check action.
   - Derive round numbering from the complete chronologically sorted `getKitchenCheckGroups()` result before filtering item controls. A served or otherwise non-editable earlier round must not cause later rounds to be renumbered.

50. Structured Tech Card components may target a specific product variant.
   - `menu_item_tech_card_components.selected_options` stores the chosen option ids; an empty object means the parent/base product.
   - The current Tech Card calculation uses the protected selected-variant cost from `menu_item_costs.variant_costs`, falling back to the protected parent cost when that variant has no dedicated cost.
   - The picker must make variants selectable, show the selected variant in the collapsed field, and clear an old variant choice when a different parent product is selected.
   - The selected options are copied into the immutable `order_items.tech_card_component_snapshot`. Paying the order deducts the included parent product and its selected variant stock exactly once.
   - The same parent product may appear more than once only when each row targets a different variant; exact duplicate parent-and-variant rows remain invalid.

## Database Migrations

Run migrations in order. Important recent files:

- `supabase/011_business_settings.sql`
  Adds `business_settings`, including `service_rate_pct`. Required for admin settings and live service-rate changes.

- `supabase/012_split_order_payments.sql`
  Adds `order_payments`. Without it, split payment reporting falls back and logs warnings.

- `supabase/018_submit_order_to_kitchen_rpc.sql`
  Adds `submit_order_to_kitchen(payload jsonb)`. This atomically upserts the order/items/table status and rejects late inserts into already paid orders.

- `supabase/019_table_management.sql`
  Adds `table_zones` and table management fields on `restaurant_tables`: `zone_id`, `zone_name`, `capacity`, `sort_order`, `is_active`, and `updated_at`. Disabled tables remain in reports/history but are hidden from waiter ordering.

- `supabase/020_table_reservations.sql`
  Adds reserved table state and reservation details: `reserved_for_name`, `reserved_for_phone`, `reserved_at`, `reserved_until`, and `reservation_notes`. Seating/sending an order for a reserved table clears reservation details and moves the table to `occupied`.

- `supabase/096_idempotent_kitchen_submissions.sql`
  Makes repeated submissions of the same `kitchen_round_id` a no-op after acquiring the same advisory lock used by payment settlement. This prevents uncertain network retries from duplicating items or totals.

- `supabase/097_daily_bazaar.sql`
  Adds structured daily bazaar purchases/items, an enduring product suggestion catalog, the separate `bazaar` feature permission, historical `products_bazaar` expense backfill, immutable audit snapshots, and idempotent atomic save/delete RPCs that keep exactly one Accounting expense in sync.

- `supabase/098_menu_item_costs_and_profit.sql`
  Adds protected per-item cost values, immutable order-item cost snapshots, and access policies that keep costs out of public, Telegram-menu, waiter, and cashier catalog reads.

- `supabase/099_employee_salary_fines.sql`
  Adds reasoned employee salary fines, expenses-feature read/write policies, and immutable accounting audit coverage. Apply it before using the Jarima / Штраф / Fine payroll action.

- `supabase/100_menu_variant_costs_and_accounting_profit.sql`
  Adds protected per-variant real costs, snapshots selected variant costs on future sales, and lets Accounting-authorized staff read protected costs for net-profit reporting.

- `supabase/101_atomic_telegram_orders.sql`
  Historical migration that added the service-role-only `create_telegram_order(payload jsonb)` RPC. The customer-ordering API that used it has since been retired; keep the migration file for deployment history.

- `supabase/105_menu_items_sold_by_weight.sql`
  Adds per-item or per-kilogram menu sale units, decimal order quantities, historical unit snapshots, and decimal-safe kitchen, Telegram, payment, and owner-reopen calculations.

- `supabase/102_atomic_menu_item_cost_creation.sql`
  Requires a positive real cost for new products and atomically inserts `menu_items` plus `menu_item_costs`. Authenticated direct menu-item inserts are disabled so product creation cannot bypass the protected cost.

- `supabase/103_menu_item_media_gallery.sql`
  Adds `menu_items.media_urls` and `create_menu_item_with_media_and_cost(payload jsonb)` so a new product's cover/gallery and protected cost are created atomically.

- `supabase/104_trim_menu_item_text.sql`
  Backfills and continuously trims leading/trailing whitespace from all localized menu-item names and descriptions.

- `supabase/106_atomic_paid_order_stock_deduction.sql`
  Deducts non-cancelled piece and selected-variant shelf stock in the same transaction that marks an order paid, with an order-level marker that makes payment retries idempotent.

- `supabase/107_employee_salary_telegram_notifications.sql`
  Adds verified employee-to-Telegram links, expiring one-time invite tokens, notification preferences, and duplicate-safe daily salary delivery history.

- `supabase/109_accounting_paid_order_summary.sql`
  Adds the lightweight, Accounting-authorized paid-order aggregate so the overview can calculate revenue, loyalty, net profit, and method balances without downloading complete orders.

- `supabase/110_salary_payment_group_notifications.sql`
  Adds independent Telegram group delivery status, message ids, timestamps, and errors to each salary-payment notification record.

- `supabase/111_salary_group_event_notifications.sql`
  Stores the dedicated salary-events Telegram target and adds duplicate-safe delivery history for bonus, fine, and absence group notifications.

- `supabase/112_salary_event_employee_notifications.sql`
  Adds private employee-delivery status fields for bonus, fine, and absence notifications.

- `supabase/113_salary_notification_attempt_tracking.sql`
  Queues delivery tracking at salary-operation insert time, backfills missing post-configuration attempts, and adds the explicit `not_attempted` status.

- `supabase/114_freeze_historical_order_prices_and_costs.sql`
  Permanently backfills missing sold-item costs, makes future cost snapshots non-null, and removes current-menu cost fallbacks from the Accounting summary.

- `supabase/115_archive_menu_catalog_deletions.sql`
  Archives removed categories and blocks physical product/category deletion so historical report context cannot disappear.

- `supabase/116_salary_rate_change_telegram_notifications.sql`
  Adds database-first, duplicate-safe private employee and salary-group delivery tracking for genuine salary-rate changes without announcing an employee's initial rate.

- `supabase/117_owner_change_individual_payment_methods.sql`
  Lets owners correct each non-loyalty payment method independently on a completed check while preserving amounts and recalculating the order-level method summary.

- `supabase/118_show_unavailable_menu_items.sql`
  Keeps active unavailable meals visible in customer menu data while retaining public-hidden, cashier-only, schedule, category, and archive filters.

- `supabase/119_salary_event_team_notifications.sql`
  Adds database-first, independently retryable ZarKebab Team delivery tracking for new bonus, fine, and absence events without replaying historical operations.

- `supabase/120_owner_only_menu_item_availability.sql`
  Historical owner-only availability guard, superseded by migration `122`.

- `supabase/121_owner_only_menu_item_public_visibility.sql`
  Restricts top-level product hiding from the public menu to active owners while preserving other Menu edits for authorized admins.

- `supabase/122_menu_item_availability_manage_menu_access.sql`
  Lets every user with Manage Menu access create unavailable products and change availability while leaving public-menu hiding owner-only.

- `supabase/123_menu_item_estimated_prep_time.sql`
  Adds the per-product preparation estimate, defaults existing products to 15 minutes, validates the 1–180 minute range, and extends atomic media-aware product creation to save it.

- `supabase/124_cleanup_deleted_salary_notification_deliveries.sql`
  Removes polymorphic Telegram delivery rows when their bonus, fine, absence, or salary-rate source is deleted.

- `supabase/125_audit_salary_absence.sql`
  Adds immutable Accounting audit coverage for absence creation, editing, and deletion.

- `supabase/126_business_settings_monthly_utilities.sql`
  Adds the monthly utilities plan used by the Accounting monthly estimate.

- `supabase/127_reject_archived_order_items.sql`
  Rejects new order-item rows and quantity increases that reference archived or missing menu products while preserving historical status updates and quantity reductions.

- `supabase/128_durable_kitchen_round_receipts.sql`
  Persists immutable order/round/item receipts in the same transaction as kitchen submission, records inserts and deletes during rollout, exposes a protocol-version health marker, and makes every exact retry a no-op even after mutable order rows are paid, cancelled, or deleted.

- `supabase/129_daily_kpi_bonuses.sql`
  Adds effective-dated employee KPI percentages, immutable date/result snapshots, atomic immediate bonus generation from paid dine-in subtotal plus service, combined private daily salary delivery, and independent Salary-group/Team KPI tracking.

- `supabase/130_tourist_service_rate.sql`
  Adds the separate Tourist dine-in service setting with a 20% default/backfill, keeps the Regular setting independent, and preserves historical order-rate snapshots.

- `supabase/139_menu_item_tech_cards.sql`
  Adds protected per-product recipes, ordered ingredient quantities/prices, batch yield, portion calculations, and the atomic `save_menu_item_tech_card(payload jsonb)` RPC.

- `supabase/140_tech_card_feature_access.sql`
  Adds the independent `tech_cards` page permission, enforces it on protected recipe reads, and keeps recipe writes additionally gated by Manage Menu.

- `supabase/142_menu_unavailable_team_notifications.sql`
  Queues duplicate-safe ZarKebab Team delivery tracking for each menu-product transition to unavailable, including immutable Russian product and staff-name snapshots.

- `supabase/143_daily_unavailable_menu_team_notifications.sql`
  Stores one duplicate-safe unavailable-menu snapshot delivery per Tashkent date for the 08:00 ZarKebab Team cron.

- `supabase/144_expense_investor_group_notifications.sql`
  Queues immutable, duplicate-safe ZarKebab Investor delivery tracking for each newly inserted cash expense without replaying historical expenses.

- `supabase/145_daily_unavailable_menu_categories.sql`
  Adds Russian category snapshots to future 08:00 unavailable-menu deliveries so the Team report can group products by category without rewriting sent history.

- `supabase/146_menu_available_team_notifications.sql`
  Extends the immediate menu-availability ledger and trigger to queue duplicate-safe Team messages for both available and unavailable transitions without replaying historical events.

- `supabase/147_financial_report_history_snapshots.sql`
  Freezes daily employee-meal expenses and sold-item categories, prevents KPI rules from entering finalized periods, and exposes bounded recovery of missing KPI and employee-meal dates.

If the app logs missing `business_settings` or `order_payments`, applying only `018` is not enough.

## Supabase Notes

`src/lib/db.js` has fallbacks for older databases:
- Missing `submit_order_to_kitchen` RPC falls back to client-side writes.
- Missing `order_payments` relation falls back to loading orders without split payments.
- Missing `business_settings` falls back to local defaults.

These fallbacks keep the UI alive, but production should have all migrations applied.

## Payment And Service Rules

Use shared helpers in `src/lib/analytics.js`.

Key rules:
- Dine-in orders can have service.
- Take-away orders always have zero service, even if restaurant service is configured.
- Loyalty discount applies after subtotal plus service, according to existing helper behavior.
- Counter items are included in total but excluded from service and loyalty discount where the helper says so.
- Paid revenue should be stable across refresh/regrouping.

Before changing totals, add/update tests in `tests/orderPayment.test.js`.

## Kitchen Submit Flow

Main UI files:
- `src/pages/WaiterOrder.jsx`
- `src/components/CartPanel.jsx`
- `src/store/AppContext.jsx`
- `src/store/ordersReducer.js`
- `src/lib/db.js`
- `supabase/018_submit_order_to_kitchen_rpc.sql`

Expected behavior:
- Tap Send to Kitchen once.
- Button shows loading text/spinner state.
- Repeated taps and cart/menu mutations are blocked while send is pending.
- Only sent snapshot items are removed after success.
- New cart items added after the submitted snapshot must survive.
- Paid orders must not receive late kitchen inserts.
- Archived menu items must be rejected from stale carts before submission and again by the database insert trigger.
- Every submission round must leave a durable receipt; never use only live `order_items` rows as the retry/idempotency marker.

## Daily Bazaar Flow

Main files:
- `src/pages/DailyBazaar.jsx`
- `src/lib/bazaar.js`
- `supabase/097_daily_bazaar.sql`

Expected behavior:
- One bazaar receipt contains one or more product lines with product, category, quantity, unit, and exact paid amount.
- The buyer is selected from active staff profiles and stored by profile id plus a historical name snapshot.
- New structured entries use only cash or card. Historical Accounting backfills can retain an older terminal payment value for accurate reporting.
- Supplier and market are legacy database fields only; they are not part of the Daily Bazaar entry, history, or analytics UI.
- Product suggestions come from `bazaar_product_catalog`, not only the currently selected history range.
- Date controls keep ISO dates internally and display them with the shared `dateFormat.js` helpers.
- The server calculates the receipt total from its line amounts.
- Create retries reuse a request UUID so a committed response lost over the network cannot duplicate the receipt or its Accounting expense.
- Saving, editing, or deleting a receipt atomically creates, updates, or removes exactly one linked `expenses` row with category `products_bazaar`.
- Do not ask users to record the same purchase again in Accounting; the manual Accounting form intentionally excludes `products_bazaar`.
- Never combine incompatible units in analytics. Grams may normalize to kilograms and millilitres to litres; counts remain separate.
- Bazaar history loads only on `/admin/bazaar`, never in initial POS hydration.

## Employee Fine Flow

Main files:
- `src/pages/Salaries.jsx`
- `src/pages/Employees.jsx`
- `src/lib/expenses.js`
- `supabase/099_employee_salary_fines.sql`

Expected behavior:
- Payment, bonus, and fine remain distinct salary transaction types.
- A fine requires employee, date, positive amount, and reason.
- A fine reduces salary due from its recorded date and may carry forward against later accrual.
- A fine is a payroll deduction, not a payment or Accounting expense.
- Employee history shows fines as negative red entries with their reason.
- Only staff with Accounting write access can create or delete fines, and every mutation is audited.

## Menu Media Gallery Flow

Main files:
- `src/pages/AdminMenu.jsx`
- `src/components/MenuProductCards.jsx`
- `src/components/MenuMedia.jsx`
- `src/lib/menuMedia.js`
- `api/menu-image/`
- `supabase/103_menu_item_media_gallery.sql`

Expected behavior:
- A menu product can contain several images, animated GIFs, MP4 videos, or WebM videos.
- `media_urls[0]` is the cover and must stay synchronized with the backward-compatible `image_url`.
- The product editor supports multi-file upload, adding a direct media URL, changing the cover, and deleting individual media.
- Existing R2 media removed in the editor is deleted only after the product save succeeds.
- Newly uploaded media is cleaned up when the editor is cancelled or when it is removed before a successful save.
- Product cards and Telegram use the cover; the public/waiter product detail page exposes the full gallery.
- Localized product names and descriptions are trimmed on editor blur, app writes, public display, and database insert/update; internal spaces and description line breaks remain unchanged.

## Tests

Tests use Node's built-in test runner. Current files:

- `tests/dashboardAnalytics.test.js`
  Dashboard period and analytics behavior.

- `tests/dbRealtime.test.js`
  Realtime subscriptions, business settings reloads, connection notices.

- `tests/orderPayment.test.js`
  Core payment, service, loyalty, cart, split payment, cashier, take-away, and reporting rules.

- `tests/sourceGuards.test.js`
  Source-level regression guards for the recent failures. These are intentional guardrails, not broad lint rules.

- `tests/bazaar.test.js`
  Daily bazaar quantity, exact-money, filtering, and analytics behavior.

- `tests/profit.test.js`
  Menu cost snapshots, legacy fallback, cancelled-item exclusion, and net-profit behavior.

- `tests/salaryTransactions.test.js`
  Deterministic newest-first ordering for combined salary payments, bonuses, and fines.

- `tests/guestMode.test.js` and `tests/guestCart.test.js`
  Legacy Guest-session storage safety and public-catalog cart rebuilding while the retired flow is phased out.

Always run:

```bash
npm test
npm run build
```

## Source Guard Coverage

`tests/sourceGuards.test.js` protects at least these cases:
- Admin upload error stays inside `ImageUploadField`.
- `SortableItemCard` does not reference upload `error`.
- Only one upload error render exists.
- `ProfileSync` dependencies stay stable.
- `dbDispatch` remains wrapped in `useCallback`.
- Realtime channel names stay unique.
- No `console.log()` debugging in `src`.
- No blocking `alert()` calls in `src`.
- `CartPanel` receives send state from its parent.
- `WaiterOrder` blocks mutations while sending.
- `ordersReducer` removes only sent snapshot cart items.
- `AppContext` delegates state changes to domain reducers instead of growing a large switch.
- Kitchen RPC rejects already paid/unavailable orders.
- Disabled tables stay out of the waiter table grid.
- Admin table management blocks hard delete when a table has active orders or order history.
- Reserved tables show on the waiter grid with reservation details and convert to occupied when seated.
- Option variants increment only their own configured cart row.
- Requested kitchen rounds never fall back to an older print group.
- Kitchen retries preserve their attempt ids and the RPC is idempotent by order/round.
- Waiter order controls distinguish submitted quantities from new cart items and keep stable, visible kitchen-round headings.
- Returning to `WaiterTables` refreshes orders/tables and renews realtime without clearing the visible grid.
- Initial/realtime operational loading never downloads current-year paid history and still includes all active orders.
- Waiter table entry requires only R/T, carries that mode into ordering, and clears legacy Guest locks.
- Mobile menu-item archive actions use a touch-safe in-app dialog, surface retryable failures, and reject archived stale-cart submissions.

If these tests fail, understand why before changing the guard. They exist because these exact failures reached the user.

## Frontend Verification Notes

Unauthenticated browser checks redirect protected routes to `/menu`. To verify `/kitchen-check/:orderId` or `/admin/menu` visually, use an authenticated profile with the right role.

The Vite build currently emits a large chunk warning. That warning is known and not the same as a failing build.

## Common Gotchas

- Do not compute totals differently in different pages. Route everything through `analytics.js`.
- Do not make `dispatch` unstable in context providers consumed by effects.
- Do not use blocking browser dialogs for operational errors; use visible UI state.
- Do not clear the whole cart after async submits.
- Do not assume applying migration `018` means the database has `011` or `012`.
- Do not hard-delete tables with order history; disable them so reports and receipts stay intact.
- Do not use `available` as a visibility filter or `stock_count` as an availability proxy; explicit hidden, schedule, cashier-only, and archive fields control menu visibility.
- Do not trust old browser console logs after hot reloads without checking timestamps.
