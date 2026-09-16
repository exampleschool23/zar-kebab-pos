# Employees, Payroll, KPI, Absence, and Employee Meals

Cards sort by salary/name; inactive by newest end date.

- Migration 194 adds nullable job_function. New employees require a job; it grants no permissions.

## Entry points

- UI: `src/pages/Salaries.jsx`, `src/pages/Employees.jsx`, `src/pages/EmployeeSalaryHistory.jsx`
- Shared logic: `src/lib/salaryTransactions.js`, `src/lib/salaryHistory.js`, `src/lib/dailyKpi.js`, `src/lib/teamProfiles.js`, `src/lib/expenses.js`
- Notifications and scheduled finalization: `api/telegram/employee-notification.js`, `api/telegram/daily-salary.js`
- Schema: migrations `099`, `107`–`119`, `124`–`129`, `136`, `141`, `148`, and `169`–`170`, `172`
- Tests: `tests/salaryTransactions.test.js`, `tests/salaryHistory.test.js`, `tests/dailyKpi.test.js`, `tests/dailyKpiUi.test.js`, `tests/dailyKpiBonuses.test.js`, `tests/dailySalaryWatchdog.test.js`, `tests/telegramSalaryMessages.test.js`

## Salary ledger

- Keep payment, bonus, fine, absence, and salary-rate changes as distinct operation types.
- `getSalaryBalance()` is the signed ledger: base salary plus accruing manual/KPI bonuses, minus payments and fines. An excess payment/fine becomes a negative carry-forward balance.
- `getSalaryDue()` is the nonnegative liability for one employee. `getTotalSalaryDue()` sums per-employee liabilities so one advance never hides another employee's due.
- Allow a positive manual salary payment even when current balance is zero or negative.
- Combined history sorts by effective date, then `created_at` newest-first for the same date.
- Page payroll ledgers via `src/lib/salaryData.js`; include accrued bonuses and remove deleted bonuses from balance state. Coverage: `tests/salaryBalanceConsistency.test.js`.

## Fines, bonuses, and absence

- A fine requires employee, date, positive amount, and non-empty reason. It reduces payroll liability but never becomes an Accounting cash expense.
- Bonuses created after migration `169` accrue into salary liability and become cash expense only through a later salary payment. Legacy bonuses remain immutable immediately-paid expenses.
- Every salary mutation is protected by Accounting write access and immutable audit coverage.
- Today's absence can be undone only for an active employee with an exact row for the current Tashkent date.
- Undo absence requires confirmation and an exact delete guarded by absence id, salary profile id, and date. Zero affected rows is an error.
- Salary-history deletion retracts each directly tracked employee, Salary-group, and Team Telegram message before deleting the source row. If Telegram refuses a retraction, keep the source row so the operator can retry; deleted bonus/fine/absence/rate events then remove their polymorphic delivery records so they cannot remain retryable.
- Deactivation/reactivation work boundaries are inclusive; only intervening dates become absences. Archived `deleted_at` is exclusive after the last working date.
- Employee creation, activation, and deactivation queue immutable Russian Investor lifecycle notifications at the database boundary. Both Salaries and Employees request the same retry-safe delivery after a successful workflow.

## Daily KPI bonus

- `195`/`196`: from `2026-09-16`, effective rules choose `sales_basis`: `employee_opened_orders` (default) or `restaurant`. Base is paid dine-in subtotal + service, by Tashkent payment date; ignore loyalty. Own orders match `order_opener_profile_id`, falling back to payroll `profile_id`. Require an account when saving enabled own-order rules; restaurant KPI needs none.
- Earlier catch-up/run totals stay restaurant-wide; finalized dates replay unchanged. Results/bonus metadata freeze amounts/basis. SQL + image coverage: `tests/employeeOpenedOrderKpi.test.js`.
- Skip absences and dates outside employment boundaries.
- Runs/results are immutable and duplicate-safe. Only service-role finalization creates `daily_kpi` bonuses.
- Bonuses accrue into salary. Formula/settlement are immutable; payments record cash expense.
- Deleting a generated bonus marks its result voided; retries never recreate it.
- Only owners remove KPI rules. The selected effective date is the boundary: preserve earlier rules/data and insert a disabled successor. Physically delete only unused rules whose effective date equals the boundary. Never offer disabled successors for removal: that would reactivate the older rule.
- Employee cards show today’s rule. KPI account dropdown lists active POS profiles, saves the opener on the rule, and reports retryable load failures.
- KPI rate/status/basis/account changes snapshot before/after values and queue Salary delivery; no-op saves stay silent. No historical backfill.
- Salary History separates monthly manual Bonuses from KPI bonuses. Salary + bonuses includes salary and both bonus types once each.
- Effective dates cannot enter already finalized periods. Recovery scans missing older dates in bounded batches.

## Daily salary notifications

- Private and Salary-group salary-rate change messages include the KPI percentage or disabled/not-configured status effective on the salary change date.
- KPI rule additions and changes notify only the dedicated Salary group, with employee, previous/new KPI, effective date, and actor. Employee and Team destinations stay terminally skipped.
- Private PNG calendars show month-to-date salary, KPI, bonuses, fines and absences; totals are before payments, not salary balance. Separate private and Salary-group KPI event rows are skipped; Team KPI uses one image per day (migration `181`).
- Cron repairs missing KPI delivery rows before Team delivery; `172` restores the queue trigger.
- A failed KPI finalization defers the daily salary summary.
- See `docs/agent/telegram.md` for language, audience privacy, destination, and delivery-state rules.

## Employee meal expense

- `average_daily_employee_meal_uzs` is per present employee per day, not one restaurant total.
- `employee_daily_meal_expenses` freezes completed-day rate, present count, and total. Reporting uses the snapshot, never today's setting.
- Absences and employment boundaries determine attendance; exclude future dates.
- The cron repairs missing meal dates independently from KPI rules in bounded batches.
- Calculated meal rows reduce report remainder but have no payment method and do not mutate the cash expense ledger.
- Historical backfill is a one-time migration snapshot and is not recalculated after setting changes.
