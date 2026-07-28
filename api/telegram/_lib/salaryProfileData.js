function composeSalaryProfile(row, related) {
  return {
    ...row,
    rates: related.rates.filter(item => item.salary_profile_id === row.id),
    payments: related.payments.filter(item => item.salary_profile_id === row.id),
    bonuses: related.bonuses.filter(item => item.salary_profile_id === row.id),
    fines: related.fines.filter(item => item.salary_profile_id === row.id),
    absences: related.absences.filter(item => item.salary_profile_id === row.id),
  }
}

export async function loadSalaryProfiles(supabase, profileIds = []) {
  const uniqueIds = [...new Set((profileIds || []).filter(Boolean))]
  if (uniqueIds.length === 0) return new Map()

  const [profiles, rates, payments, bonuses, fines, absences] = await Promise.all([
    supabase.from('employee_salary_profiles').select('*').in('id', uniqueIds),
    supabase.from('employee_salary_rates').select('*').in('salary_profile_id', uniqueIds),
    supabase.from('employee_salary_payments').select('*').in('salary_profile_id', uniqueIds),
    supabase.from('employee_salary_bonuses').select('*').in('salary_profile_id', uniqueIds),
    supabase.from('employee_salary_fines').select('*').in('salary_profile_id', uniqueIds),
    supabase.from('employee_salary_absences').select('*').in('salary_profile_id', uniqueIds),
  ])
  const failed = [profiles, rates, payments, bonuses, fines, absences].find(result => result.error)
  if (failed?.error) throw failed.error

  const related = {
    rates: rates.data || [],
    payments: payments.data || [],
    bonuses: bonuses.data || [],
    fines: fines.data || [],
    absences: absences.data || [],
  }
  return new Map((profiles.data || []).map(profile => [
    profile.id,
    composeSalaryProfile(profile, related),
  ]))
}
