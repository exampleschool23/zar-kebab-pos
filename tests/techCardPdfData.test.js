import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPdfCards, techCardOptionName } from '../src/lib/techCardPdfData.js'
const categories = [{ id: 'grill' }, { id: 'soup' }]
const names = { item: item => item.name, category: c => c?.id || 'Other' }
const variants = () => [{ id: 'large', label: 'Large', price: 0, price_delta: 5000 }]
const items = [{ id: 'a', name: 'Meat', category_id: 'grill', price: 30000, cost_price: 12000, variant_costs: { large: 18000 } }, { id: 'b', name: 'Soup', category_id: 'soup' }, { id: 'c', name: 'Other' }]
const cards = { base: { menu_item_id: 'a' }, variant: { menu_item_id: 'a', variant_option_id: 'large' }, stale: { menu_item_id: 'a', variant_option_id: 'removed' } }
test('PDF export combines selected categories, keeps base and eligible variant identity, and excludes removed variants', () => {
 const result = buildPdfCards(items, cards, categories, ['grill', 'soup'], 'en', names, variants)
 assert.deepEqual(result.map(r => r.name), ['Meat', 'Meat · Large', 'Soup'])
 assert.equal(result[1].price, 35000)
 assert.equal(result[1].cost, 18000)
 assert.equal(result[2].card, null)
 assert.equal(result[2].price, undefined)
 assert.equal(result[2].cost, undefined)
})
test('PDF category selection includes uncategorized dishes and handles empty selection', () => {
 assert.deepEqual(buildPdfCards(items, cards, categories, [], 'en', names, variants), [])
 assert.deepEqual(buildPdfCards(items, cards, categories, ['__other'], 'en', names, variants).map(r => r.name), ['Other'])
})
test('PDF export preserves explicit zero costs and missing variant costs', () => {
 const rows = buildPdfCards([{ ...items[0], cost_price: 0, variant_costs: {} }], cards, categories, ['grill'], 'en', names, variants)
 assert.equal(rows[0].cost, 0)
 assert.equal(rows[1].cost, undefined)
})

import { techCardUnitLabel, TECH_CARD_UNITS } from '../src/lib/techCards.js'
test('all recipe units are localized for Uzbek, Russian, and English', () => {
  assert.deepEqual(TECH_CARD_UNITS.map(unit => techCardUnitLabel(unit, 'uz')), ['g', 'kg', 'ml', 'l', 'dona'])
  assert.deepEqual(TECH_CARD_UNITS.map(unit => techCardUnitLabel(unit, 'ru')), ['г', 'кг', 'мл', 'л', 'шт'])
  assert.deepEqual(TECH_CARD_UNITS.map(unit => techCardUnitLabel(unit, 'en')), ['g', 'kg', 'ml', 'l', 'piece'])
})
test('included product variants use translated labels before generic names', () => {
  assert.equal(techCardOptionName({label_uz:'Katta', label_ru:'Большой', label:'Large'}, 'uz'), 'Katta')
  assert.equal(techCardOptionName({title_ru:'Большой', label:'Large'}, 'ru'), 'Большой')
  assert.equal(techCardOptionName({name_uz:'Katta', name:'Large'}, 'uz'), 'Katta')
  assert.equal(techCardOptionName({label:'Large'}, 'en'), 'Large')
})
