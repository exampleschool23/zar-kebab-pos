# Telegram Menus, Targets, Notifications, and Delivery

## Entry points

- UI: `src/pages/TelegramMiniApp.jsx`, `src/lib/telegramWebApp.js`
- Notifications: `api/telegram/`
- Delivery: `api/telegram/_lib/`
- Polling: `bots/telegram-bot.js`
- Tests: `tests/teamDailyKpiDelivery.test.js`, `tests/employeePayrollImages.test.js`.

## Mini App

- Read-only.

## Delivery records and retries

- Saved salary events/rate changes get `not_attempted` tracking; initial setup does not.
- Per-destination states: pending, sent, failed, skipped, confirmed.
- Mark sent only with a Telegram message id.
- Employee/Salary/Team/Investor sends are independent and duplicate-safe.
- Salaries: status, five rows/page, unsent retries.
- Reuse `api/telegram/employee-notification.js` for salary operation types to stay within deployment function limits.
- Owner history deletion retracts tracked private/Salary/Team messages first. Payments snapshot chat ID. Missing messages count as retracted; other failures preserve the event.

## Salary destinations

- Salary payments: employee privately (receipt confirmation), Salary group (no confirmation).
- Salary group target is `salary_events`; its env fallback must never use Team or completed-orders groups.
- Payment, accrued bonus, fine, absence, and rate change notify employee and Salary group; automatic KPI uses combined summaries.
- Rate-change messages show previous/new salary, effective date, and effective KPI status.
- KPI changes notify Salary group from immutable rate/basis/account snapshots (`196`); no-op saves stay silent.

## Team salary events

- Manual bonus, fine, and absence notify Team; salary payments and rate changes have terminal skipped Team status.
- Team messages include amount, full fine/absence detail, and author, but omit salary balance. Automatic events name the system.
- Bonuses omit payment method. Private manual bonuses/fines use Russian long dates.
- Use shared localized long-date formatting. Empty notes are omitted; Team copy stays compact.
- No historical broadcasts.

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

- Employee lifecycle queues immutable Russian Investor events: employee/date/actor.
- Ingredient changes (`189`) snapshot before/after values and actor. Unchanged saves and imports stay silent. `ingredient-events` sends to `salary_events`; unknown sends stay held.
- New cash expenses/Bazaar purchases notify Investor via legacy `salary_events`.
- Order deletes require a reason (`184`); Investor alerts snapshot order, total, actor and tenders. Corrections and splits (`201`) notify Investor once with before/after allocations.
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

- `197`/`198`: paid orders privately notify the opener with total, order cut and running daily KPI (effective own/all dine-in base, rounded once). No accrual/backfill. Claims hold uncertain sends; minute retries: `task=employee-order-kpi`. Deploy sender first. Tests: `tests/employeeOrderKpiNotifications.test.js`.

- Morning watchdog retries unstarted/failed/skipped Investor albums after meal/KPI finalization, including alerted failures. Recovery requires a saved report message ID; never replay sent/pending reports. Alert markers save message ID/chat/error only after confirmed sends. Tests: `tests/dailySalaryWatchdog.test.js`.
