# Orders paid from salary (210)

## Entry points

- UI: `src/components/SalaryOrderPayment.jsx`, `src/pages/CashierBill.jsx`.
- Balances: `api/telegram/_lib/orderSalaryBalances.js`; tests: `tests/orderSalaryBalances.test.js`.
- Migration: `supabase/210_order_salary_settlement.sql` (apply before UI/API release).
- Tests: `tests/orderSalarySettlement.test.js`, `tests/orderStatusDelivery.test.js`.
- Related guides: payments-accounting, payroll, reporting, telegram.

## Authorization and atomic settlement

- Uses Delete completed orders write access (`canDeletePaidOrders` / `current_staff_can_write('delete_paid_orders')`), independently of ordinary cashier write access.
- The dialog reads `salary_order_balances` through the authenticated employee-notification API. Delete completed orders write access exposes active employee IDs/names and signed available salary balances only. Full paginated ledgers stay server-side; `getSalaryBalance()` is reused as of Tashkent today. No language-dependent reloads. The older `get_order_salary_employees()` RPC remains IDs/names only.
- `settle_orders_payment(jsonb)` accepts `salary_profile_id`, `request_id`, `expected_order_ids` and one `salary` payment covering the amount after loyalty redemption. Existing server wallet/cashback calculations remain authoritative. Fully loyalty-covered bills use normal checkout.
- Locks and settles through the existing strict payment transaction, then creates exactly one linked non-cash `employee_salary_payments` row. Any failure rolls back order, wallet, receipt and payroll writes together.
- Private `order_salary_settlements` receipts reconcile retries before touching the current table bill. Request identities persist across browser retries/reloads. Expected IDs contain contributing orders, excluding empty shells.
- Dialog survives realtime order closure; language changes preserve selections and requests. Employee options show available salary (zero when overdrawn). Selected employee details show current advances and the projected balance/advance after deduction. Failed reads show unavailable, never an invented zero. Pending retries suppress the projection because settlement may already have committed.

## Financial meaning and historical protection

- Salary deduction is a non-cash salary payment, not a fine, free meal, new payroll accrual, cash receipt or cash payout.
- Balance can become negative; the excess carries forward as an advance, matching current payroll rules.
- Order revenue stays in paid sales. Accounting and monthly estimates include the non-cash salary settlement as payroll payment; its equal sale/payment amounts offset in revenue-minus-payroll remainder calculations. Cash/card/terminal balances never change.
- Reports, receipts, payment breakdowns and closeout CSV label salary separately. Existing all-time remainder already subtracts salary payments from paid revenue and needs no historical rewrite.
- Paid dine-in orders still count toward existing KPI rules; Game Club remains excluded from dine-in KPI.
- Linked salary payments/tenders cannot be independently corrected or deleted. Order deletion/status/payment-method changes are blocked after settlement; a separate linked reversal workflow is required. Payroll Telegram retraction is blocked before messages are removed.

## Telegram

- Existing employee-notification endpoint accepts `salary_order`; authorizes Delete completed orders access and verifies the actor owns a salary-method payment.
- The employee receives the order reference, non-cash deduction and remaining balance via existing tracked payroll delivery. The Salary-group destination is skipped for this event; its group notice goes to statuses. No cash-receipt confirmation button is sent. Missing employee links remain visible as unsuccessful delivery; retry from the dialog or payroll delivery UI.
- Status chat receives the completed order with salary tender, loyalty and cashback, without payroll balances.
- Salary status messages reserve deterministic per-order-group/chat identities; confirmed sends are reused on retry. Unknown deliveries stay held for reconciliation to prevent duplicate messages.
