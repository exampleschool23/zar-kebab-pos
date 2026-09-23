// Audit snapshots preserve edits/deletions; pre-audit rates retain their recorded creation.
export function buildSalaryRateHistory(rates = [], audits = [], actors = []) {
  const actorNames = new Map(actors.map(actor => [actor.id, actor.full_name]))
  // Prefer the immutable insert actor; legacy deletions retain creator IDs in old_record.
  const origins = new Map(rates.map(rate => [rate.id, { record: rate }]))
  for (const audit of [...audits].sort((a, b) => (Date.parse(b.changed_at) || 0) - (Date.parse(a.changed_at) || 0))) {
    origins.set(audit.entity_id, {
      record: audit.old_record || audit.new_record,
      insertion: audit.action === 'insert' ? audit : null,
    })
  }
  const auditedIds = new Set(audits.map(row => row.entity_id))
  const entries = audits.map(row => ({
    id: `audit-${row.id}`,
    rateId: row.entity_id,
    action: row.action,
    recordedAt: row.changed_at,
    actor: row.changed_by_name || actorNames.get(row.changed_by) || '',
    before: row.old_record,
    after: row.new_record,
    audited: true,
  }))
  for (const rate of rates) {
    if (auditedIds.has(rate.id)) continue
    entries.push({
      id: `rate-${rate.id}`,
      rateId: rate.id,
      action: 'insert',
      recordedAt: rate.created_at,
      actor: actorNames.get(rate.created_by) || '',
      before: null,
      after: rate,
      audited: false,
    })
  }
  const sorted = entries.sort((a, b) => (Date.parse(b.recordedAt) || 0) - (Date.parse(a.recordedAt) || 0) || b.id.localeCompare(a.id))
  const existingIds = new Set(rates.map(rate => rate.id))
  const deletedIds = new Set(audits.filter(row => row.action === 'delete').map(row => row.entity_id))
  const seen = new Set()
  return sorted.map(entry => {
    const canDelete = existingIds.has(entry.rateId) && !seen.has(entry.rateId) && entry.action !== 'delete'
    seen.add(entry.rateId)
    const origin = origins.get(entry.rateId)
    const addedBy = origin?.insertion
      ? origin.insertion.changed_by_name || actorNames.get(origin.insertion.changed_by) || ''
      : actorNames.get(origin?.record?.created_by) || ''
    const addedAt = origin?.record?.created_at || origin?.insertion?.changed_at || ''
    return { ...entry, addedBy, addedAt, canDelete, deleted: deletedIds.has(entry.rateId) && !existingIds.has(entry.rateId) }
  })
}
