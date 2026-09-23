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

- Saved salary events get `not_attempted` tracking; initial setup does not.
- States: pending, sent, failed, skipped, confirmed.
- Sent requires a message id.
- Destinations send independently, duplicate-safe.
- Salaries: 5 rows/page, unsent retries.
- Salary operations use `api/telegram/employee-notification.js`. Cleanup requires `ok:true` within 30s; timeout keeps the record and shows an error.
- Owner deletions retract tracked private/Salary (Investor)/Team messages first. Missing messages succeed. Undeletable rate notices are edited to cancelled; other failures block deletion.

## Salary destinations

- Salary payments: employee privately (receipt confirmation), Salary group (no confirmation).
- Salary group target is `salary_events`; its env fallback must never use Team or completed-orders groups.
- Payment, accrued bonus, fine, absence, and rate change notify employee and Salary group; automatic KPI uses combined summaries.
- Rate-change messages show previous/new salary, effective date, and effective KPI status.
- KPI changes notify Salary group from immutable rate/basis/account snapshots (`196`); no-op saves stay silent.

## Team salary events

- No backfill.

- Manual bonus, fine, and absence notify Team; salary payments and rate changes have terminal skipped Team status.
- Team messages include amount, full fine/absence detail, and author, but omit salary balance. Automatic events name the system.
- Bonuses omit payment method. Private manual bonuses/fines use Russian long dates.

## Daily payroll privacy

- Private RU PNG calendars show MTD salary, KPI, bonuses, fines and absences from joining through the completed day, before payments. Dated `getSalaryBalance()` shows remaining pay and all-time payments; negative = advance. Custom ranges: ≤62 days.
- Salary group receives only the aggregate daily salary/KPI report, not per-employee KPI details.
- Game Club paid revenue has its own text/PNG bucket, excluded from other buckets.
- `180`: Game Club rounds send Team RU date, actor, menu, items, total. Snapshots paid daily income at send: Tashkent paid_at (created_at fallback), saved totals; read errors stay queued. Cron retries; unknown sends held. No costs/tenders.
- Daily/MTD cafe income uses immutable `orders.total`. Cash/terminal uses payment rows; QR maps to terminal, while card/loyalty stay distinct.
- Daily soliq is 4% of paid cafe revenue, included in expenses and deducted from net profit.
- Team KPI: one Russian PNG per finalized date with all employee awards, total, date, system author. Migration `181` claims dates; unknown sends stay held. No text fallback or sales/rate/balance data. Award deletion edits its image row.

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
- Investor daily album: only yesterday’s financial/payroll and live unpaid/non-cancelled orders (place/id/time/status/total/items). Russian labels/catalog names, saved-name fallback; renderer filters paid/cancelled. No daily Bazaar totals or Tech Card images, including retries/manual sends. Keep historical ledgers.
- Bazaar PNGs group numbered items by saved Russian category with paid/normal prices and signed variance (red above, green below), plus total variance. Missing normal prices stay unset; rows never truncate.
- Investor: image-only, retryable render errors, no text fallback; ledger deduplicates the two-image album.
- Album ledgers mark sent only after each photo’s Telegram message id.
- Employee meal daily aggregate also goes to Investor and shows the employee-count formula.
- Edits/deletes and calculated salary/bonus rows never announce new cash expenses.

## Status messages

- Group identical product/options/notes/price/unit rows (as receipts).

- `Официант`: saved `waiter_name` across rounds; fallback `Не указан`, never closer.

- Sum `cashback_earned`; omit zero. After payment: `💳 [owner] · кешбэк + [amount] UZS`; escaped snapshot names or `Карта лояльности`. Test: `tests/telegramOrderStatus.test.js`.

- Deploy after `185`. `api/telegram/_lib/orderStatusDelivery.js` tracks new messages; order deletion retracts combined messages with minute cron retries. Missing messages succeed; errors remain recorded. Old untracked messages stay. Telegram permits deletion within 48h. Test: `tests/orderStatusDelivery.test.js`.

- `197`/`198`: private paid-order estimates snapshot order/daily KPI. `203` filters order/daily cuts by Tashkent start time; Salary events snapshot before/after times. `202` cancels deleted-order queued notices and retracts sent notices, including orphans. Minute `employee-order-kpi` cron retries cleanup; uncertain sends stay held. Apply migrations before sender/UI. Other notices retain historical estimates. Tests: `tests/timeBasedKpi.test.js`.

- Morning watchdog retries unstarted/failed/skipped Investor albums after meal/KPI finalization, including alerted failures. Recovery needs a saved message ID; never replay sent/pending reports. Save alert ID/chat/error only after confirmed send. Tests: `tests/dailySalaryWatchdog.test.js`.
