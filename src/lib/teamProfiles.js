export function groupTeamProfiles(profiles, search = '', statusFilter = 'all') {
  const query = String(search || '').trim().toLowerCase()
  const filtered = (profiles || []).filter(profile => {
    const matchesSearch = !query
      || String(profile.full_name || '').toLowerCase().includes(query)
      || String(profile.email || '').toLowerCase().includes(query)
    const matchesStatus = statusFilter === 'all' || profile.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return {
    members: filtered.filter(profile => profile.status !== 'pending')
      .sort((a, b) => Number(a.status === 'disabled') - Number(b.status === 'disabled')),
    pendingRequests: filtered.filter(profile => profile.status === 'pending'),
  }
}
