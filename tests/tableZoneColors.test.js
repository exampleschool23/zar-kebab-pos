import test from 'node:test'
import assert from 'node:assert/strict'

import { getTableZoneName, getTableZoneVisual, groupTableInfosByZone } from '../src/lib/tableZoneColors.js'

const zones = [
  { id: 'main-hall', name: 'Main Hall' },
  { id: 'vip', name: 'VIP' },
  { id: 'outdoor', name: 'Outdoor' },
]

test('table zones receive distinct colors in their configured order', () => {
  const visuals = zones.map(zone => getTableZoneVisual(zone, zones))

  assert.equal(new Set(visuals.map(visual => visual.bar)).size, zones.length)
  assert.equal(new Set(visuals.map(visual => visual.border)).size, zones.length)
  assert.equal(getTableZoneVisual({ zone_id: 'vip', zone_name: 'VIP' }, zones), visuals[1])
  assert.equal(getTableZoneVisual({ zone_name: 'Main Hall' }, zones), visuals[0])
})

test('unknown zones keep a stable fallback color and readable name', () => {
  const table = { zone_id: 'patio', zone_name: 'Patio' }

  assert.deepEqual(getTableZoneVisual(table), getTableZoneVisual(table))
  assert.equal(getTableZoneName(table), 'Patio')
  assert.equal(getTableZoneName({}), 'Main Hall')
})

test('available tables group by zone while preserving saved table and first-zone order', () => {
  const tableInfos = [
    { table: { id: 'outdoor-1', zone_id: 'outdoor', zone_name: 'Outdoor' } },
    { table: { id: 'main-1', zone_id: 'main-hall', zone_name: 'Main Hall' } },
    { table: { id: 'vip-1', zone_id: 'vip', zone_name: 'VIP' } },
    { table: { id: 'main-2', zone_id: 'main-hall', zone_name: 'Main Hall' } },
  ]

  const groups = groupTableInfosByZone(tableInfos, zones)

  assert.deepEqual(groups.map(group => group.zone.name), ['Outdoor', 'Main Hall', 'VIP'])
  assert.deepEqual(groups[1].items.map(info => info.table.id), ['main-1', 'main-2'])
})
