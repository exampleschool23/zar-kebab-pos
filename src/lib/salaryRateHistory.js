// Audit snapshots preserve edits/deletions; pre-audit rates retain their recorded creation.
export function buildSalaryRateHistory(rates = [], audits = [], actors = []) {
  const actorNames = new Map(actors.map(actor => [actor.id, actor.full_name]))
  const auditedIds = new Set(audits.map(row => row.entity_id))
  const entries = audits.map(row => ({
    id: `audit-${row.id}`,
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
      action: 'insert',
      recordedAt: rate.created_at,
      actor: actorNames.get(rate.created_by) || '',
      before: null,
      after: rate,
      audited: false,
    })
  }
  return entries.sort((a, b) => (Date.parse(b.recordedAt) || 0) - (Date.parse(a.recordedAt) || 0) || b.id.localeCompare(a.id))
}
