// Payroll balances need the complete ledger, including records beyond the
// database's default response limit. Create a fresh, stably ordered query per page.
export async function loadSalaryRows(createQuery) {
  const pageSize = 500
  const rows = []
  try {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await createQuery().order('id').range(offset, offset + pageSize - 1)
      if (error) throw error
      rows.push(...(data || []))
      if ((data || []).length < pageSize) return { data: rows, error: null }
    }
  } catch (error) {
    // Never calculate a plausible but incomplete balance after a later page fails.
    return { data: [], error }
  }
}
