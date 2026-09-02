# Employees, Payroll, KPI, Absence, and Employee Meals

Read this guide for salary profiles, payments, bonuses, fines, absences, advances, effective-dated KPI rules, daily payroll, and average employee meals.

## Entry points

- UI: `src/pages/Salaries.jsx`, `src/pages/Employees.jsx`, `src/pages/EmployeeSalaryHistory.jsx`
- Shared logic: `src/lib/salaryTransactions.js`, `src/lib/salaryHistory.js`, `src/lib/dailyKpi.js`, `src/lib/teamProfiles.js`, `src/lib/expenses.js`
- Notifications and scheduled finalization: `api/telegram/employee-notification.js`, `api/telegram/daily-salary.js`
- Schema: migrations `099`, `107`–`119`, `124`–`129`, `136`, `141`, `148`, and `169`–`170`, `172`
- Focused tests: `tests/salaryTransactions.test.js`, `tests/salaryHistory.test.js`, `tests/dailyKpi.test.js`, `tests/dailyKpiUi.test.js`, `tests/dailyKpiBonuses.test.js`, `tests/dailySalaryWatchdog.test.js`, `tests/telegramSalaryMessages.test.js`

## Salary ledger

- Keep payment, bonus, fine, absence, and salary-rate changes as distinct operation types.
- `getSalaryBalance()` is the signed ledger: base salary plus accruing manual/KPI bonuses, minus payments and fines. An excess payment/fine becomes a negative carry-forward balance.
- `getSalaryDue()` is the nonnegative liability for one employee. `getTotalSalaryDue()` sums per-employee liabilities so one advance never hides another employee's due.
- Allow a positive manual salary payment even when current balance is zero or negative.
- Combined history sorts by effective date, then `created_at` newest-first for the same date.

## Fines, bonuses, and absence

- A fine requires employee, date, positive amount, and non-empty reason. It reduces payroll liability but never becomes an Accounting cash expense.
- Bonuses created after migration `169` accrue into salary liability and become cash expense only through a later salary payment. Legacy bonuses remain immutable immediately-paid expenses.
- Every salary mutation is protected by Accounting write access and immutable audit coverage.
- Today's absence can be undone only for an active employee with an exact row for the current Tashkent date.
- Undo absence requires confirmation and an exact delete guarded by absence id, salary profile id, and date. Zero affected rows is an error.
- Salary-history deletion retracts each directly tracked employee, Salary-group, and Team Telegram message before deleting the source row. If Telegram refuses a retraction, keep the source row so the operator can retry; deleted bonus/fine/absence/rate events then remove their polymorphic delivery records so they cannot remain retryable.
- Deactivation/reactivation work boundaries are inclusive; only intervening dates become absences. Archived `deleted_at` is exclusive after the last working date.

## Daily KPI bonus

- Each enabled effective-dated rule receives its full basis-point percentage of restaurant-wide finalized paid dine-in `subtotal + service_fee`; loyalty does not reduce the base.
- Skip absences and dates outside employment boundaries.
- Date runs and employee results are immutable and duplicate-safe. Only the service-role finalizer creates `daily_kpi` bonuses.
- Generated bonuses accrue into the employee's salary balance. Their formula and settlement mode are immutable; later salary payments record the cash expense.
- Deleting a generated bonus marks its result voided; retries never recreate it.
- Only owners remove KPI rules. The form's selected effective date is the removal boundary: the original rule and all finalized or paid data before it stay unchanged, while a disabled successor stops KPI from that date onward. A rule is physically deleted only when the selected boundary equals its own effective date and the rule is still unused. The disabled successor is not offered for removal because exposing the older enabled rule would reactivate KPI.
- Employee cards show the rule effective today, not a future scheduled rule. Missing migration support reports locally without blocking the cards.
- Adding a KPI rule or genuinely changing its rate/status creates an immutable before/after event and a duplicate-safe Salary-group delivery. A no-op save creates no new notification; migration `170` deliberately does not backfill older rules.
- Salary History shows selected-month automatic KPI separately while retaining it in all-bonus totals.
- Effective dates cannot enter already finalized periods. Recovery scans missing older dates in bounded batches.

## Daily salary notifications

- Private and Salary-group salary-rate change messages include the KPI percentage or disabled/not-configured status effective on the salary change date.
- KPI rule additions and changes notify only the dedicated Salary group, with employee, previous/new KPI, effective date, and actor. Employee and Team destinations stay terminally skipped.
- Automatic KPI employee value is folded into one combined private Salary + Bonus summary. Separate private and Salary-group KPI event rows are skipped; Team KPI remains independently retryable.
- The daily cron self-heals a missing automatic-KPI delivery ledger row before Team delivery; migration `172` restores the insert trigger and queues any missed generated KPI bonuses.
- A failed KPI finalization defers the daily salary summary.
- See `docs/agent/telegram.md` for language, audience privacy, destination, and delivery-state rules.

## Employee meal expense

- `average_daily_employee_meal_uzs` is per present employee per day, not one restaurant total.
- `employee_daily_meal_expenses` freezes completed-day rate, present count, and total. Reporting uses the snapshot, never today's setting.
- Absences and employment boundaries determine attendance; exclude future dates.
- The cron repairs missing meal dates independently from KPI rules in bounded batches.
- Calculated meal rows reduce report remainder but have no payment method and do not mutate the cash expense ledger.
- Historical backfill is a one-time migration snapshot and is not recalculated after setting changes.
