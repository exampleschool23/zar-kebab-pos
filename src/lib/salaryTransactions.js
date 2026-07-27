export function compareSalaryTransactionsNewestFirst(a, b) {
  const dateDifference = String(b?.date || '').localeCompare(String(a?.date || ''))
  if (dateDifference !== 0) return dateDifference

  const aCreatedAt = Date.parse(a?.createdAt || '')
  const bCreatedAt = Date.parse(b?.createdAt || '')
  const aHasTime = Number.isFinite(aCreatedAt)
  const bHasTime = Number.isFinite(bCreatedAt)
  if (aHasTime && bHasTime && aCreatedAt !== bCreatedAt) return bCreatedAt - aCreatedAt
  if (aHasTime !== bHasTime) return aHasTime ? -1 : 1

  return String(b?.id || '').localeCompare(String(a?.id || ''))
}

export function compareSalaryAbsencesNewestFirst(a, b) {
  return compareSalaryTransactionsNewestFirst(
    {
      id: a?.id,
      date: a?.absence_date,
      createdAt: a?.created_at,
    },
    {
      id: b?.id,
      date: b?.absence_date,
      createdAt: b?.created_at,
    }
  )
}
