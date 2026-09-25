import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeOrderSalaryBalances, loadOrderSalaryBalances } from '../api/telegram/_lib/orderSalaryBalances.js'

test('checkout balances use accrued salary, absence, bonuses, fines and both cash and salary payments without exposing ledgers', () => {
  const profile = { id: 'employee', employee_name: 'Employee', is_active: true, joined_at: '2026-09-01',
    rates: [{ effective_from: '2026-09-01', amount: 100000, rate_unit: 'daily' }],
    absences: [{ absence_date: '2026-09-02' }],
    bonuses: [{ bonus_date: '2026-09-01', amount: 20000, accrues_to_salary: true }, { bonus_date: '2026-09-01', amount: 999999, accrues_to_salary: false }],
    fines: [{ fine_date: '2026-09-01', amount: 10000 }],
    payments: [{ paid_date: '2026-09-01', amount: 50000, payment_method: 'cash' }, { paid_date: '2026-09-03', amount: 40000, payment_method: 'salary' }, { paid_date: '2026-10-01', amount: 999999 }],
  }
  const rows = summarizeOrderSalaryBalances(new Map([
    ['employee', profile], ['inactive', { ...profile, id: 'inactive', is_active: false }],
    ['deleted', { ...profile, id: 'deleted', deleted_at: '2026-09-02' }],
  ]), '2026-09-03')
  assert.deepEqual(rows, [{ id: 'employee', employee_name: 'Employee', salary_balance: 120000 }])
  assert.equal(summarizeOrderSalaryBalances(new Map([['employee', { ...profile, payments: [{ paid_date: '2026-09-01', amount: 300000 }] }]]), '2026-09-03')[0].salary_balance, -90000)
})

test('balance read rejects unauthorized and inactive staff before loading payroll', async () => {
  for (const actor of [null, { role: 'admin', status: 'active', feature_access: ['cashier'] }, { role: 'viewer', status: 'active', feature_access: ['delete_paid_orders'] }, { role: 'owner', status: 'inactive' }]) {
    const db = { from(table) {
      assert.equal(table, 'profiles')
      return { select() { return this }, eq() { return this }, async maybeSingle() { return { data: actor } } }
    } }
    await assert.rejects(loadOrderSalaryBalances(db, 'actor'), error => error.status === 403)
  }
})
