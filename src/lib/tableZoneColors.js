const ZONE_PALETTE = [
  {
    bar: 'bg-blue-500',
    border: 'border-blue-300',
    hoverBorder: 'hover:border-blue-500',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-500',
  },
  {
    bar: 'bg-rose-500',
    border: 'border-rose-300',
    hoverBorder: 'hover:border-rose-500',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
  {
    bar: 'bg-emerald-500',
    border: 'border-emerald-300',
    hoverBorder: 'hover:border-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  {
    bar: 'bg-amber-500',
    border: 'border-amber-300',
    hoverBorder: 'hover:border-amber-500',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  {
    bar: 'bg-orange-500',
    border: 'border-orange-300',
    hoverBorder: 'hover:border-orange-500',
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
    dot: 'bg-orange-500',
  },
  {
    bar: 'bg-cyan-500',
    border: 'border-cyan-300',
    hoverBorder: 'hover:border-cyan-500',
    badge: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    dot: 'bg-cyan-500',
  },
  {
    bar: 'bg-fuchsia-500',
    border: 'border-fuchsia-300',
    hoverBorder: 'hover:border-fuchsia-500',
    badge: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
    dot: 'bg-fuchsia-500',
  },
  {
    bar: 'bg-lime-600',
    border: 'border-lime-400',
    hoverBorder: 'hover:border-lime-600',
    badge: 'border-lime-200 bg-lime-50 text-lime-800',
    dot: 'bg-lime-600',
  },
]

function zoneIdentity(zone) {
  if (typeof zone === 'string') return zone.trim().toLowerCase()
  return String(zone?.zone_id || zone?.id || zone?.zone_name || zone?.name || 'main-hall')
    .trim()
    .toLowerCase()
}

function zoneIdentities(zone) {
  if (typeof zone === 'string') return [zoneIdentity(zone)]
  return [zone?.zone_id, zone?.id, zone?.zone_name, zone?.name]
    .filter(Boolean)
    .map(value => String(value).trim().toLowerCase())
}

function hashZone(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

export function getTableZoneName(table) {
  return String(table?.zone_name || table?.name || 'Main Hall').trim() || 'Main Hall'
}

export function getTableZoneVisual(zone, orderedZones = []) {
  const identities = zoneIdentities(zone)
  const identity = identities[0] || zoneIdentity(zone)
  const orderedIndex = orderedZones.findIndex(candidate =>
    zoneIdentities(candidate).some(candidateIdentity => identities.includes(candidateIdentity))
  )
  const paletteIndex = orderedIndex >= 0 ? orderedIndex : hashZone(identity)
  return ZONE_PALETTE[paletteIndex % ZONE_PALETTE.length]
}

export function groupTableInfosByZone(tableInfos, orderedZones = []) {
  const groups = new Map()

  ;(tableInfos || []).forEach(info => {
    const table = info?.table || info
    const tableIdentities = zoneIdentities(table)
    const configuredZone = orderedZones.find(zone =>
      zoneIdentities(zone).some(identity => tableIdentities.includes(identity))
    )
    const zone = configuredZone || {
      id: table?.zone_id || table?.zone_name || 'main-hall',
      name: getTableZoneName(table),
    }
    const key = zoneIdentity(zone)
    if (!groups.has(key)) groups.set(key, { zone, items: [] })
    groups.get(key).items.push(info)
  })

  return [...groups.values()]
}
