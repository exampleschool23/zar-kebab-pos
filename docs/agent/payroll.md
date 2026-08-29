# Employees, Payroll, KPI, Absence, and Employee Meals

Read this guide for salary profiles, payments, bonuses, fines, absences, advances, effective-dated KPI rules, daily payroll, and average employee meals.

## Salary ledger

- Keep payment, bonus, fine, absence, and salary-rate changes as distinct operation types.
- `getSalaryBalance()` is the signed ledger: accrued salary minus payments and fines. An excess payment/fine becomes a negative carry-forward balance.
- `getSalaryDue()` is the nonnegative liability for one employee. `getTotalSalaryDue()` sums per-employee liabilities so one advance never hides another employee's due.
- Allow a positive manual salary payment even when current balance is zero or negative.
- Combined history sorts by effective date, then `created_at` newest-first for the same date.

## Fines, bonuses, and absence

- A fine requires employee, date, positive amount, and non-empty reason. It reduces payroll liability but never becomes an Accounting cash expense.
- Every salary mutation is protected by Accounting write access and immutable audit coverage.
- Today's absence can be undone only for an active employee with an exact row for the current Tashkent date.
- Undo absence requires confirmation and an exact delete guarded by absence id, salary profile id, and date. Zero affected rows is an error.
- Deleted bonus/fine/absence/rate events remove their polymorphic Telegram deliveries so they cannot remain retryable.
- Deactivation/reactivation work boundaries are inclusive; only intervening dates become absences. Archived `deleted_at` is exclusive after the last working date.

## Daily KPI bonus

- Each enabled effective-dated rule receives its full basis-point percentage of restaurant-wide finalized paid dine-in `subtotal + service_fee`; loyalty does not reduce the base.
- Skip absences and dates outside employment boundaries.
- Date runs and employee results are immutable and duplicate-safe. Only the service-role finalizer creates `daily_kpi` bonuses.
- Generated bonuses are immediate expenses using the salary profile payment method. Financial fields cannot be updated.
- Deleting a generated bonus marks its result voided; retries never recreate it.
- Only owners delete unused KPI rules. Referenced finalized rules remain protected.
- Employee cards show the rule effective today, not a future scheduled rule. Missing migration support reports locally without blocking the cards.
- Salary History shows selected-month automatic KPI separately while retaining it in all-bonus totals.
- Effective dates cannot enter already finalized periods. Recovery scans missing older dates in bounded batches.

## Daily salary notifications

- Automatic KPI employee value is folded into one combined private Salary + Bonus summary. Separate private and Salary-group KPI event rows are skipped; Team KPI remains independently retryable.
- A failed KPI finalization defers the daily salary summary.
- See `docs/agent/telegram.md` for language, audience privacy, destination, and delivery-state rules.

## Employee meal expense

- `average_daily_employee_meal_uzs` is per present employee per day, not one restaurant total.
- `employee_daily_meal_expenses` freezes completed-day rate, present count, and total. Reporting uses the snapshot, never today's setting.
- Absences and employment boundaries determine attendance; exclude future dates.
- The cron repairs missing meal dates independently from KPI rules in bounded batches.
- Calculated meal rows reduce report remainder but have no payment method and do not mutate the cash expense ledger.
- Historical backfill is a one-time migration snapshot and is not recalculated after setting changes.
