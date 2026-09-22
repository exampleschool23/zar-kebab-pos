// Only submit selections present in a successfully loaded active staff roster.
export function eligibleCategoryProfileIds(selectedIds, profiles) {
  const eligible = new Set(profiles
    .filter(profile => profile.status === 'active' && profile.role !== 'guest')
    .map(profile => profile.id))
  return [...new Set((selectedIds || []).filter(id => eligible.has(id)))].sort()
}
