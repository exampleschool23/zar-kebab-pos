# Employees, Payroll, KPI, Absence, and Employee Meals

- `194`/`206`: display-only job_function; required on creation, owner-editable. EN/RU/UZ labels; no permissions/payroll effects. Test: `tests/employeeJobFunctions.test.js`.

## Entry points

- UI: `src/pages/Salaries.jsx`, `src/pages/Employees.jsx`, `src/pages/EmployeeSalaryHistory.jsx`
- Shared logic: `src/lib/salaryTransactions.js`, `src/lib/salaryHistory.js`, `src/lib/dailyKpi.js`, `src/lib/teamProfiles.js`, `src/lib/expenses.js`
- Finalization: `api/telegram/employee-notification.js`, `api/telegram/daily-salary.js`
- Schema: migrations `129`, `169`–`172`, `195`–`203`.
- Tests: `tests/salaryTransactions.test.js`, `tests/salaryHistory.test.js`, `tests/dailyKpi.test.js`, `tests/dailyKpiUi.test.js`, `tests/dailyKpiBonuses.test.js`, `tests/dailySalaryWatchdog.test.js`, `tests/telegramSalaryMessages.test.js`

## Salary ledger

- Keep payment, bonus, fine, absence, and rate changes distinct.
- `getSalaryBalance()` is the signed ledger: base salary plus accruing manual/KPI bonuses, minus payments and fines. An excess payment/fine becomes a negative carry-forward balance.
- `getSalaryDue()` is the nonnegative liability for one employee. `getTotalSalaryDue()` sums per-employee liabilities so one advance never hides another employee's due.
- Allow positive manual payments even with zero/negative balance.
- History sorts by effective date, then `created_at` newest-first.
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

- `195`/`196`: from `2026-09-16`, rules choose own opened orders or all restaurant dine-in sales. Base is paid subtotal + service by Tashkent payment date, ignoring loyalty. Own rules require `order_opener_profile_id` or payroll `profile_id`; restaurant rules need no account. Earlier catch-up uses all sales.
- `203`: effective-dated `start_time` (default `00:00`) counts payments from that minute through midnight in Tashkent, for both bases. Finalizer/estimates share `employee_kpi_sales_base`. Results/bonuses and change events freeze time. Tests: `tests/timeBasedKpi.test.js`, `tests/employeeOpenedOrderKpi.test.js`.
- Skip absences and dates outside employment boundaries.
- Runs/results are immutable; only service-role finalization creates `daily_kpi` bonuses (`200`: creator repair). `202` forbids deleting previous-day orders for everyone; today's deletions reduce own/restaurant bases before finalization.
- Bonuses accrue into salary. Formula/settlement are immutable; payments record cash expense.
- Deleting a generated bonus marks its result voided; retries never recreate it.
- Only owners remove KPI rules. The selected effective date is the boundary: preserve earlier rules/data and insert a disabled successor. Physically delete only unused rules whose effective date equals the boundary. Never offer disabled successors for removal: that would reactivate the older rule.
- Employee cards show today’s rule. KPI account dropdown lists active POS profiles, saves the opener on the rule, and reports retryable load failures.
- KPI rate/status/basis/account/time changes snapshot before/after values and queue Salary delivery; no-op saves stay silent. No historical backfill.
- Salary History separates monthly manual Bonuses from KPI bonuses. Salary + bonuses includes salary and both bonus types once each.
- Effective dates cannot enter already finalized periods. Recovery scans missing older dates in bounded batches.

## Daily notifications

- Private and Salary-group salary-rate change messages include the KPI percentage or disabled/not-configured status effective on the salary change date.
- KPI rule additions and changes notify only the dedicated Salary group, with employee, previous/new KPI, effective date, and actor. Employee and Team destinations stay terminally skipped.
- Private PNG calendars show MTD salary, KPI, bonuses, fines and absences before payments. Dated `getSalaryBalance()` shows remaining pay and all-time payments; negative = advance. Private/Salary-group KPI events are skipped; Team gets one daily image (`181`).
- Cron repairs missing KPI delivery rows before Team delivery; `172` restores the queue trigger.
- A failed KPI finalization defers the daily salary summary.
- Delivery rules: `docs/agent/telegram.md`.

## Employee meal expense

- `average_daily_employee_meal_uzs` is per present employee per day, not one restaurant total.
- `employee_daily_meal_expenses` freezes completed-day rate, present count, and total. Reporting uses the snapshot, never today's setting.
- Absences and employment boundaries determine attendance; exclude future dates.
- The cron repairs missing meal dates independently from KPI rules in bounded batches.
- Calculated meal rows reduce report remainder but have no payment method and do not mutate the cash expense ledger.
- Historical backfill is a one-time migration snapshot and is not recalculated after setting changes.
