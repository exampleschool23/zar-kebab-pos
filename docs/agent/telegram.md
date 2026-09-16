# Telegram Menus, Targets, Notifications, and Delivery

## Entry points

- UI: `src/pages/TelegramMiniApp.jsx`, `src/lib/telegramWebApp.js`
- Notifications: `src/lib/telegramNotifications.js`, `api/telegram/`
- Delivery: `api/telegram/_lib/`
- Polling: `bots/telegram-bot.js`
- Tests: `tests/teamDailyKpiDelivery.test.js`, `tests/employeePayrollImages.test.js`.

## Mini App

- Mini App is read-only; Checkout/My Orders retired.

## Delivery records and retries

- Saved salary events and genuine rate changes get database-first `not_attempted` tracking; initial setup is not a change.
- Delivery advances independently through pending, sent, failed, skipped, or confirmed states for each destination.
- Mark sent only with a Telegram message id.
- Employee, Salary group, Team, and Investor attempts are independent and duplicate-safe.
- Salaries: status, five rows/page, unsent retries.
- Reuse `api/telegram/employee-notification.js` for salary operation types to stay within deployment function limits.
- Owner history deletion first retracts tracked private, Salary-group, and Team messages. Payments snapshot the employee chat id. Missing messages count as retracted; other deletion failures preserve the event.

## Salary destinations

- Salary payment goes to the linked employee privately (with receipt confirmation) and the dedicated Salary group (without confirmation).
- Salary group target is `salary_events`; its env fallback must never use Team or completed-orders groups.
- Payment, accrued bonus, fine, absence, and rate change notify employee and Salary group; automatic KPI uses combined summaries.
- Rate-change messages show previous/new salary, effective date, and effective KPI status.
- KPI changes notify Salary group from immutable rate/basis/account snapshots (`196`); no-op saves stay silent.

## Team salary events

- Manual bonus, fine, and absence notify Team; salary payments and rate changes have terminal skipped Team status.
- Team messages include amount, full fine/absence detail, and author, but omit salary balance. Automatic events name the system.
- Bonuses omit payment method. Private manual bonuses/fines use Russian long dates.
- Use shared localized long-date formatting. Empty notes are omitted; Team copy stays compact.
- Historical rows are never broadcast retroactively.

## Automatic daily payroll privacy and language

- Private Russian PNG calendars show month-to-date salary, KPI, bonuses, fines and absences through the completed day, starting no earlier than joining. Totals are before payments, not balance. Custom ranges allow up to 62 days.
- Salary group receives only the aggregate daily salary/KPI report, not per-employee KPI details.
- Game Club paid revenue has its own text/PNG bucket, excluded from other buckets.
- `180`: Game Club rounds send Team RU date, actor, menu, items, total. Snapshots paid daily income at send: Tashkent paid_at (created_at fallback), saved totals; read errors stay queued. Cron retries; unknown sends held. No costs/tenders.
- Daily/MTD cafe income uses immutable `orders.total`. Cash/terminal uses payment rows; QR maps to terminal, while card/loyalty stay distinct.
- Daily soliq is 4% of paid cafe revenue, included in expenses and deducted from net profit.
- Team KPI: one Russian PNG per finalized date with all employee awards, total, date, system author. Migration `181` claims dates; unknown sends stay held. No text fallback or sales/rate/balance data. Deleting an award edits only its row in the shared image.

## Menu availability

- Authenticated availability changes, product creation, and archival queue immutable Russian Team events with product/employee snapshots; ordinary edits and restoration send nothing.
- At 08:00 Tashkent, send the duplicate-safe Russian unavailable-products snapshot and optionally reply to Google reviews; review failures do not block it.
- Exclude archived products and archived categories; preserve exact sent snapshots.

## Investor notifications

- Employee lifecycle changes queue immutable Russian Investor events with employee, date, and actor snapshots.
- Ingredient changes (`189`) snapshot before/after values and actor. Unchanged saves and imports stay silent. `ingredient-events` sends to `salary_events`; unknown sends stay held.
- New cash expense inserts and Daily Bazaar purchases notify the independently configured Investor group using the legacy `salary_events` target key.
- Order deletes require a reason popup; migration `184` saves it in Investor alerts. Alerts snapshot order, total, actor, and tenders. Payment corrections also notify Investor.
- Cash-expense alerts are text. Daily Bazaar sends one localized PNG and caption; never duplicate it with a text receipt.
- Investor album: yesterday’s financial/payroll, Bazaar from two days ago, plus all live unpaid/non-cancelled orders (place/id/time/status/total/items). Russian labels and catalog names, saved-name fallback. Renderer also filters paid/cancelled. Tech Card consumption is separate.
- Bazaar PNGs group numbered items by saved Russian category with paid/normal prices and signed variance (red above, green below), plus total variance. Missing normal prices stay unset; rows never truncate.
- Financial/Bazaar are image-only: renderer failures remain retryable, no text fallback. Partial retries send only missing PNGs.
- Ingredient images use immutable paid-sale recipe snapshots and count missing coverage.
- Album ledgers mark sent only after each photo’s Telegram message id.
- Employee meal daily aggregate also goes to Investor and shows the employee-count formula.
- Edits/deletes and calculated salary/bonus rows never announce new cash expenses.

## Status messages

- `Официант`: saved `waiter_name`, merged across rounds; missing: `Не указан`, never the closer.

- Status: saved `cashback_earned`, summed across rounds; omit zero. Test: `tests/telegramOrderStatus.test.js`.

- Deploy after `185`. `api/telegram/_lib/orderStatusDelivery.js` tracks new messages; order deletion retracts combined messages with minute cron retries. Missing messages succeed; errors remain recorded. Old untracked messages stay. Telegram permits deletion within 48h. Test: `tests/orderStatusDelivery.test.js`.

- `197`: paid orders privately notify the linked opener with total and estimated KPI; no bonus write/backfill. Atomic claims hold uncertain sends; minute retries use `task=employee-order-kpi`. Deploy sender first. Tests: `tests/employeeOrderKpiNotifications.test.js`.
