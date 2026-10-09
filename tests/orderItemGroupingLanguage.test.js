import test from 'node:test'
import assert from 'node:assert/strict'
import { getGroupedOrderItems } from '../src/lib/analytics.js'
import {
  buildCompletedOrderGroupMessage,
  buildItemRows,
  getRussianOrderItemDisplayName,
} from '../api/telegram/_lib/orderStatusMessages.js'

// Rows copied from paid order o1791537297688 (Stol 6, 2026-10-09): the same
// Coca-Cola 1,5L variant sent in two rounds while the waiter UI was in Uzbek,
// then in English. Telegram listed it twice instead of "2 × 44 000".
const cokeMenuItem = {
  name_ru: 'Кока-Кола',
  option_groups: [{
    id: 'variants',
    title_uz: 'Variantlar',
    title_ru: 'Варианты',
    title_en: 'Variants',
    options: [
      { id: 'option_1782730064888', label: 'Coke-Cola 1,5L', label_ru: 'Кока-Кола 1,5L' },
      { id: 'option_small', label: 'Coke-Cola 0,5L', label_ru: 'Кока-Кола 0,5L' },
    ],
  }],
}
const cokeRow = {
  name: 'Coca-Cola',
  price: 22000,
  status: 'new',
  quantity: 1,
  item_type: 'menu',
  sale_unit: 'piece',
  base_price: 22000,
  cost_price: 12500,
  order_type: 'dine_in',
  price_mode: 'regular',
  unit_price: 22000,
  menu_item_id: 'i1781094719995',
  is_counter_item: false,
  selected_options: { variants: 'option_1782730064888' },
}
const roundUz = { ...cokeRow, id: 'coke-uz', notes: 'Variantlar: Coke-Cola 1,5L', kitchen_round_id: 'round-1' }
const roundEn = { ...cokeRow, id: 'coke-en', notes: 'Variants: Coke-Cola 1,5L', kitchen_round_id: 'round-2' }
const roundRu = { ...cokeRow, id: 'coke-ru', notes: 'Варианты: Кока-Кола 1,5L', kitchen_round_id: 'round-3' }

function withTelegramName(item) {
  return { ...item, telegram_display_name: getRussianOrderItemDisplayName(item, cokeMenuItem) }
}

test('regression: same variant sent in Uzbek and English rounds is one Telegram row', () => {
  const items = [roundUz, roundEn].map(withTelegramName)
  const grouped = getGroupedOrderItems(items)
  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].quantity, 2)
  assert.deepEqual(grouped[0].source_item_ids, ['coke-uz', 'coke-en'])

  const rows = buildItemRows(items)
  assert.equal(rows.split('\n').length, 2)
  assert.match(rows, /Кока-Кола 1,5L\s+2\s+44 000/)

  const message = buildCompletedOrderGroupMessage({
    table_name: 'Stol 6',
    waiter_name: 'Asil',
    payment_status: 'paid',
    subtotal: 44000,
    total: 44000,
    items,
  })
  assert.equal((message.match(/Кока-Кола 1,5L/g) || []).length, 1)
})

test('every UI language pair merges the same selected variant, including localized labels', () => {
  const variants = [roundUz, roundEn, roundRu]
  for (const a of variants) {
    for (const b of variants) {
      const grouped = getGroupedOrderItems([a, b])
      assert.equal(grouped.length, 1, `${a.notes} + ${b.notes}`)
      assert.equal(grouped[0].quantity, 2)
    }
  }
  assert.equal(getGroupedOrderItems(variants)[0].quantity, 3)
})

test('different selected variants of the same product stay separate in any language', () => {
  const small = { ...roundEn, id: 'small', selected_options: { variants: 'option_small' }, notes: 'Variants: Coke-Cola 0,5L' }
  const grouped = getGroupedOrderItems([roundUz, small].map(withTelegramName))
  assert.equal(grouped.length, 2)
  assert.equal(buildItemRows([roundUz, small].map(withTelegramName)).split('\n').length, 3)
})

test('manual notes after the variant line still separate rows, but merge across languages', () => {
  const noIceUz = { ...roundUz, notes: 'Variantlar: Coke-Cola 1,5L\nМуз йўқ' }
  const noIceEn = { ...roundEn, notes: 'Variants: Coke-Cola 1,5L\nМуз йўқ' }
  const otherNote = { ...roundEn, notes: 'Variants: Coke-Cola 1,5L\nОчень холодная' }

  assert.equal(getGroupedOrderItems([roundUz, noIceEn]).length, 2)
  assert.equal(getGroupedOrderItems([noIceUz, otherNote]).length, 2)
  const merged = getGroupedOrderItems([noIceUz, noIceEn])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].quantity, 2)
})

test('legacy rows without selected_options merge only when the variant label matches', () => {
  const legacy = ({ selected_options, ...row }, notes, id) => ({ ...row, id, notes })
  assert.equal(getGroupedOrderItems([
    legacy(cokeRow, 'Variantlar: Coke-Cola 1,5L', 'a'),
    legacy(cokeRow, 'Variants: Coke-Cola 1,5L', 'b'),
    legacy(cokeRow, 'Варианты:  Coke-Cola 1,5L ', 'c'),
  ]).length, 1)
  assert.equal(getGroupedOrderItems([
    legacy(cokeRow, 'Variants: Coke-Cola 1,5L', 'a'),
    legacy(cokeRow, 'Variants: Coke-Cola 0,5L', 'b'),
  ]).length, 2)
})

test('empty notes/options and camelCase cart fields do not split identical rows', () => {
  const plain = { id: 'p1', menu_item_id: 'tea', name: 'Tea', quantity: 1, price: 5000, unit_price: 5000, price_mode: 'regular' }
  const variants = [
    { ...plain, id: 'p2', notes: '' },
    { ...plain, id: 'p3', notes: null, selected_options: {} },
    { ...plain, id: 'p4', notes: '   ', selectedOptions: {}, price_mode: undefined },
    { id: 'p5', menuItemId: 'tea', name: 'Tea', quantity: 1, price: 5000, unitPrice: 5000, priceMode: 'regular' },
  ]
  const grouped = getGroupedOrderItems([plain, ...variants])
  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].quantity, 5)
})

test('price mode, unit price and sale unit still separate otherwise identical rows', () => {
  assert.equal(getGroupedOrderItems([roundUz, { ...roundEn, price_mode: 'tourist' }]).length, 2)
  assert.equal(getGroupedOrderItems([roundUz, { ...roundEn, price: 26400, unit_price: 26400 }]).length, 2)
  assert.equal(getGroupedOrderItems([roundUz, { ...roundEn, sale_unit: 'kg' }]).length, 2)
})
