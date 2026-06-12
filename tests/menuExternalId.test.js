import test from 'node:test'
import assert from 'node:assert/strict'
import { generateMenuExternalId } from '../src/lib/menuExternalId.js'

test('generated menu external ids use stable provider-safe format', () => {
  const id = generateMenuExternalId()

  assert.match(id, /^MI-[A-Z2-9]{10}$/)
})

test('generated menu external ids are random enough for repeated item creation', () => {
  const ids = new Set(Array.from({ length: 50 }, () => generateMenuExternalId()))

  assert.equal(ids.size, 50)
})
