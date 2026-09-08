# Telegram Menus, Targets, Notifications, and Delivery

## Entry points

- Customer UI: `src/pages/TelegramMiniApp.jsx`, `src/lib/telegramWebApp.js`
- Notification client and server endpoints: `src/lib/telegramNotifications.js`, `api/telegram/`
- Server delivery: `api/telegram/_lib/`, including `teamDailyKpiDelivery.js`
- Bot polling fallback: `bots/telegram-bot.js`
- Tests: `tests/teamDailyKpiDelivery.test.js`, `tests/employeePayrollImages.test.js`.

## Customer Mini App

- Mini App is read-only; Checkout/My Orders are retired. Keep auth, loyalty, contacts and notifications separate.

## Delivery records and retries

- Read retries: `database-testing.md`.

- Saved salary events and genuine rate changes get database-first `not_attempted` tracking; initial setup is not a change.
- Delivery advances independently through pending, sent, failed, skipped, or confirmed states for each destination.
- Mark sent only after Telegram returns a message id.
- Employee, Salary group, Team, and Investor attempts are independent and duplicate-safe.
- The Salaries page combines salary-operation status with five records per page and retry controls for unsent destinations.
- Reuse `api/telegram/employee-notification.js` for salary operation types to stay within deployment function limits.
- Owner history deletion first retracts tracked private, Salary-group, and Team messages. Payments snapshot the employee chat id. Missing messages count as retracted; other deletion failures preserve the event.

## Salary destinations

- Salary payment goes to the linked employee privately (with receipt confirmation) and the dedicated Salary group (without confirmation).
- Salary group target is `salary_events`; its env fallback must never use Team or completed-orders groups.
- Payment, accrued bonus, fine, absence, and rate change notify employee and Salary group; automatic KPI uses combined summaries.
- Rate-change messages show previous/new salary, effective date, and effective KPI status.
- KPI changes notify only Salary group from immutable snapshots; no-op saves and older rules stay silent.

## Team salary events

- Manual bonus, fine, and absence notify Team; salary payments and rate changes have terminal skipped Team status.
- Team messages include amount, full fine/absence detail, and author, but omit salary balance. Automatic events name the system.
- Bonus messages omit payment method for employee, Salary group, and Team.
- Use shared localized long-date formatting. Optional empty notes are omitted; Team copy stays compact.
- Historical rows are skipped during migration and never broadcast retroactively.

## Automatic daily payroll privacy and language

- Combined employee Salary + Bonus summaries are Russian PNGs: attendance, salary, manual/KPI bonuses, daily total, balance (negative = advance); no fines/payments.
- Salary group receives only the aggregate daily salary/KPI report, not per-employee KPI details.
- Game Club paid revenue has its own text/PNG bucket, excluded from other buckets.
- Migration `180` sends new Game Club rounds to Team: RU date, Добавил, menu mode, item table and total. No costs/tenders. Vault cron dispatches immediately and every minute; uncertain sends remain held for review, never blindly resent.
- Daily/MTD cafe income uses immutable `orders.total`. Cash/terminal uses payment rows; QR maps to terminal, while card/loyalty stay distinct.
- The aggregate daily report estimates soliq as 4% of that day's paid cafe revenue, lists it in expenses, includes it in total expenses, and deducts it from daily net profit.
- Team KPI: one Russian PNG per finalized date with all employee awards, total, date, system author. Migration `181` claims dates; unknown sends stay held. No text fallback or sales/rate/balance data. Deleting an award edits only its row in the shared image.

## Menu availability

- Authenticated availability changes, product creation, and archival queue immutable Russian Team events with product/employee snapshots; ordinary edits and restoration send nothing.
- At 08:00 Tashkent, send the duplicate-safe Russian unavailable-products snapshot and optionally reply to Google reviews; review failures do not block it.
- Exclude archived products and archived categories; preserve exact sent snapshots.

## Investor notifications

- Employee creation, activation, and deactivation queue immutable, retry-safe Russian Investor events with employee, date, and actor snapshots.
- New cash expense inserts and Daily Bazaar purchases notify the independently configured Investor group using the legacy `salary_events` target key.
- Order deletes and payment corrections queue immutable Investor alerts with order, total, actor, and tender snapshots.
- Manual cash-expense alerts remain localized text. A new Daily Bazaar purchase is sent as one localized PNG receipt with a short photo caption containing amount, date, category, optional description, creator, and the recorded monthly total; do not also send the numbered text receipt.
- Each completed Tashkent day produces three Investor report images. The financial/payroll PNG uses the just-completed day, while the Daily Bazaar PNG uses the preceding day (two calendar days before the cron's current Tashkent date); they are sent together as one two-photo Telegram album. The theoretical Tech Card ingredient-consumption image remains a separate photo.
- The Daily Bazaar PNG groups every numbered item by saved Russian category and shows bought price, normal price, line total, and signed variance. Over-price is red, under-price is green, and the top card includes the overall variance. Missing legacy normal prices render as unset, never zero; rows never truncate.
- Financial and Daily Bazaar delivery is image-only: if either renderer fails, send no text fallback and leave the claimed report rows retryable. A partial retry may send only the missing PNG without duplicating the photo already recorded as sent.
- The ingredient image values paid, non-cancelled sales from immutable recipe snapshots, shows every ingredient, and counts legacy rows without snapshot coverage.
- All three image deliveries remain independently duplicate-safe; the album records Telegram's separate message id for each photo and marks each ledger sent only after those ids are returned.
- Employee meal daily aggregate also goes to Investor and shows the employee-count formula.
- Edits/deletes and calculated salary/bonus rows do not create new cash-expense announcements.
