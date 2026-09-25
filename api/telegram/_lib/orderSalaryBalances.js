import { canDeletePaidOrders } from '../../../src/lib/permissions.js'
import { getSalaryBalance } from '../../../src/lib/expenses.js'
import { loadSalaryRows } from '../../../src/lib/salaryData.js'
import { loadSalaryProfiles } from './salaryProfileData.js'
import { getTashkentDate } from './salaryMessages.js'

export function summarizeOrderSalaryBalances(profiles, asOfDate) {
  return [...profiles.values()]
    .filter(profile => profile.is_active && !profile.deleted_at)
    .map(profile => ({
      id: profile.id,
      employee_name: profile.employee_name,
      salary_balance: getSalaryBalance(profile, asOfDate),
    }))
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
}

export async function loadOrderSalaryBalances(supabase, actorId) {
  const { data: actor, error } = await supabase.from('profiles')
    .select('role, status, email, feature_access').eq('id', actorId).maybeSingle()
  if (error) throw error
  if (actor?.status !== 'active' || !canDeletePaidOrders(actor)) {
    throw Object.assign(new Error('Delete completed orders access is required'), { status: 403 })
  }
  const employees = await loadSalaryRows(() => supabase.from('employee_salary_profiles')
    .select('id').eq('is_active', true).is('deleted_at', null))
  if (employees.error) throw employees.error
  const profiles = await loadSalaryProfiles(supabase, employees.data.map(row => row.id))
  const asOfDate = getTashkentDate()
  // Full payroll data stays server-side; this permission exposes only balances.
  return { employees: summarizeOrderSalaryBalances(profiles, asOfDate), asOfDate }
}
