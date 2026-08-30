# Telegram Menus, Targets, Notifications, and Delivery

Read this guide for the Telegram Mini App, bot/API endpoints, notification targets, message formats, retries, and scheduled delivery.

## Entry points

- Customer surface and browser integration: `src/pages/TelegramMiniApp.jsx`, `src/lib/telegramWebApp.js`
- Notification client and server endpoints: `src/lib/telegramNotifications.js`, `api/telegram/`
- Shared server delivery logic: `api/telegram/_lib/`
- Bot polling fallback: `bots/telegram-bot.js`
- Focused tests: `tests/telegramOrderStatus.test.js`, `tests/telegramSalaryMessages.test.js`, `tests/telegramDeliveryRetry.test.js`, `tests/telegramDailyBazaar.test.js`, `tests/telegramInvestorExpense.test.js`, `tests/dailySalaryWatchdog.test.js`, `tests/sourceGuards.accounting-reporting.test.js`

## Customer Mini App

- The Telegram Mini App is a read-only customer menu.
- Customer checkout and My Orders are retired. Do not restore `/api/telegram/order` or `/api/telegram/orders` without an explicit product decision.
- Keep authentication, loyalty lookup, contact data, employee notifications, and POS status notifications separate from retired customer ordering.

## Delivery records and retries

- Every saved salary payment, bonus, fine, absence, and genuine salary-rate change immediately receives database-first `not_attempted` tracking. Initial salary setup is not a rate-change event.
- Delivery advances independently through pending, sent, failed, skipped, or confirmed states for each destination.
- Mark sent only after Telegram returns a message id.
- Employee, Salary group, Team, and Investor delivery attempts are independent and duplicate-safe. A failure/retry for one destination must not duplicate another.
- The Salaries page combines salary-operation status with five records per page and retry controls for unsent destinations.
- Reuse `api/telegram/employee-notification.js` for salary operation types to stay within deployment function limits.
- Owner salary-history deletion first retracts every directly tracked private, Salary-group, and Team message. Payment delivery snapshots the exact employee chat id so later relinking cannot redirect a retraction. Treat an already-missing Telegram message as successfully retracted, but keep the salary event when any other Telegram deletion fails.

## Salary destinations

- Salary payment goes to the linked employee privately (with receipt confirmation) and the dedicated Salary group (without confirmation).
- The Salary group target is `salary_events`; `TELEGRAM_SALARY_PAYMENTS_CHAT_ID` is deployment-order fallback only. Never fall back to Team or completed-orders groups.
- Payment, bonus, fine, absence, and salary-rate change notify employee and Salary group, except automatic KPI uses the combined daily summaries.
- Rate-change messages include applicable previous rate, new amount/unit, and effective date.

## Team salary events

- Manual bonus, fine, and absence notify Team; salary payments and rate changes have terminal skipped Team status.
- Team messages include saved amount and full fine reason/absence note, but omit remaining salary balance and manager identity.
- Bonus messages omit payment method for employee, Salary group, and Team.
- Use shared localized long-date formatting. Optional empty notes are omitted; Team copy stays compact.
- Historical rows are skipped during migration and never broadcast retroactively.

## Automatic daily payroll privacy and language

- Combined employee Salary + Bonus summaries are always Russian and contain attendance, earned salary, bonuses, and current due—never repeated fines or payments.
- Salary group receives only the aggregate daily salary/KPI report, not per-employee KPI details.
- The aggregate daily report shows the actual cash and terminal income from that day's immutable order-payment rows, with a compact comparison line beside the two amounts. Historical QR normalizes to terminal; historical card and loyalty stay distinct and are not relabeled.
- Team automatic KPI messages are always Russian and contain only employee name, paid KPI amount, and date. Never disclose restaurant sales base, KPI percentage, salary due, or manager identity.

## Menu availability

- Every authenticated available/unavailable transition queues one immutable Russian Team event with product and employee snapshots.
- Editing without a transition and product archival send nothing.
- At 08:00 Tashkent, send one duplicate-safe Russian snapshot of unavailable active products grouped by saved Russian category order, or confirm all available.
- Exclude archived products and archived categories; preserve exact sent snapshots.

## Investor notifications

- New cash expense inserts and Daily Bazaar purchases notify the independently configured Investor group using the legacy `salary_events` target key.
- Message language follows the target and includes amount, date, category, method, optional supplier/description, creator, and recorded monthly total.
- Each completed Tashkent day produces three Investor report images. The financial/payroll and Daily Bazaar PNGs are sent together as one two-photo Telegram album; the theoretical Tech Card ingredient-consumption image remains a separate photo.
- The Daily Bazaar image includes each ingredient's snapshotted normal total, paid total, signed difference, and the overall Bazaar difference. It is still emitted with an empty state when no Bazaar rows exist so the daily image set remains complete.
- Financial and Daily Bazaar delivery is image-only: if either renderer fails, send no text fallback and leave the claimed report rows retryable. A partial retry may send only the missing PNG without duplicating the photo already recorded as sent.
- The ingredient image values paid, non-cancelled sold quantities from immutable order-item recipe snapshots and visibly counts legacy sold rows without snapshot coverage.
- All three image deliveries remain independently duplicate-safe; the album records Telegram's separate message id for each photo and marks each ledger sent only after those ids are returned.
- Employee meal daily aggregate also goes to Investor and shows the employee-count formula.
- Edits/deletes and calculated salary/bonus rows do not create new cash-expense announcements.
