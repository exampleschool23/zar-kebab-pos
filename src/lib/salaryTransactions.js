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
