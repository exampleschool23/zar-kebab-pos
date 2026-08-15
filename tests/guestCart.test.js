import assert from 'node:assert/strict'
import test from 'node:test'

import { rebuildGuestCartFromCatalog } from '../src/lib/guestCart.js'

const now = new Date('2026-08-12T12:00:00+05:00')
const categories = [
  { id: 'public', name_en: 'Public' },
  { id: 'hidden', name_en: 'Hidden', hidden: true },
]

const variantItem = {
  id: 'variant-meal',
  category_id: 'public',
  name_en: 'Current meal name',
  name_ru: 'Текущее блюдо',
  price: 50_000,
  available: true,
  option_groups: [{
    id: 'variants',
    required: true,
    options: [
      { id: 'large', label_en: 'Large', price: 80_000, available: true },
      { id: 'secret', label_en: 'Secret', price: 90_000, public_hidden: true },
      { id: 'sold-out', label_en: 'Sold out', price: 70_000, available: false },
    ],
  }],
}

test('guest cart rebuild trusts current public catalog prices instead of stored row values', () => {
  const [row] = rebuildGuestCartFromCatalog({
    cart: [{
      menu_item_id: 'variant-meal',
      cart_item_key: 'tampered-key',
      name: 'Tampered name',
      base_price: 1,
      unit_price: 1,
      price: 1,
      price_mode: 'regular',
      quantity: 2,
      selected_options: { variants: 'large' },
      notes: 'No onion',
    }],
    menuItems: [variantItem],
    categories,
    now,
    lang: 'en',
  })

  assert.equal(row.cart_item_key, 'variant-meal::variants:large')
  assert.equal(row.name, 'Current meal name')
  assert.equal(row.base_price, 80_000)
  assert.equal(row.unit_price, 96_000)
  assert.equal(row.price, 96_000)
  assert.equal(row.price_mode, 'tourist')
  assert.equal(row.quantity, 2)
  assert.equal(row.notes, 'No onion')
})

test('guest cart rebuild applies the selected Regular mode to configured variants', () => {
  const [row] = rebuildGuestCartFromCatalog({
    cart: [{
      menu_item_id: 'variant-meal',
      base_price: 1,
      unit_price: 96_000,
      price: 96_000,
      price_mode: 'tourist',
      quantity: 1,
      selected_options: { variants: 'large' },
    }],
    menuItems: [variantItem],
    categories,
    now,
    lang: 'en',
    priceMode: 'regular',
  })

  assert.equal(row.base_price, 80_000)
  assert.equal(row.unit_price, 80_000)
  assert.equal(row.price, 80_000)
  assert.equal(row.price_mode, 'regular')
  assert.deepEqual(row.selected_options, { variants: 'large' })
})

test('guest cart excludes Tourist-hidden categories only in Tourist mode', () => {
  const touristOnlyCategories = [{ id: 'lunch', tourist_hidden: true }]
  const lunch = { id: 'lunch-set', category_id: 'lunch', name_en: 'Lunch set', price: 50_000, available: true }
  const cart = [{ menu_item_id: 'lunch-set', quantity: 1 }]

  assert.deepEqual(rebuildGuestCartFromCatalog({
    cart,
    menuItems: [lunch],
    categories: touristOnlyCategories,
    now,
    priceMode: 'tourist',
  }), [])

  assert.equal(rebuildGuestCartFromCatalog({
    cart,
    menuItems: [lunch],
    categories: touristOnlyCategories,
    now,
    priceMode: 'regular',
  }).length, 1)
})

test('guest cart rebuild drops non-public products, categories, unavailable rows, and invalid options', () => {
  const menuItems = [
    variantItem,
    { id: 'public-hidden', category_id: 'public', name_en: 'Hidden', price: 10_000, available: true, public_hidden: true },
    { id: 'hidden-category', category_id: 'hidden', name_en: 'Hidden category', price: 10_000, available: true },
    { id: 'unavailable', category_id: 'public', name_en: 'Unavailable', price: 10_000, available: false },
    { id: 'cashier-only', category_id: 'public', name_en: 'Cashier', price: 10_000, available: true, cashier_only: true },
  ]
  const cart = [
    { menu_item_id: 'public-hidden', quantity: 1 },
    { menu_item_id: 'hidden-category', quantity: 1 },
    { menu_item_id: 'unavailable', quantity: 1 },
    { menu_item_id: 'cashier-only', quantity: 1 },
    { menu_item_id: 'variant-meal', quantity: 1, selected_options: { variants: 'secret' } },
    { menu_item_id: 'variant-meal', quantity: 1, selected_options: { variants: 'sold-out' } },
    { menu_item_id: 'variant-meal', quantity: 1, selected_options: { variants: 'missing' } },
    { menu_item_id: 'variant-meal', quantity: 1, selected_options: { variants: 'large', extra: 'value' } },
    { menu_item_id: 'missing-product', quantity: 1 },
  ]

  assert.deepEqual(rebuildGuestCartFromCatalog({ cart, menuItems, categories, now }), [])
})

test('guest cart rebuild normalizes plain rows, legacy option deltas, and duplicate keys', () => {
  const plainItem = { id: 'bread', category_id: 'public', name_en: 'Bread', price: 10_000, available: true }
  const legacyVariant = {
    id: 'legacy',
    category_id: 'public',
    name_en: 'Legacy option',
    price: 10_000,
    available: true,
    option_groups: [{
      id: 'variants',
      options: [{ id: 'extra', label_en: 'Extra', price: 0, price_delta: 5_000 }],
    }],
  }
  const rows = rebuildGuestCartFromCatalog({
    cart: [
      { menu_item_id: 'bread', quantity: 1, price: 1 },
      { menu_item_id: 'bread', quantity: 2, price: 999_999 },
      { menu_item_id: 'legacy', quantity: 1, selected_options: { variants: 'extra' } },
    ],
    menuItems: [plainItem, legacyVariant],
    categories,
    now,
  })

  assert.equal(rows.length, 2)
  assert.deepEqual(rows.find(row => row.menu_item_id === 'bread'), {
    menu_item_id: 'bread',
    name: 'Bread',
    price: 12_000,
    base_price: 10_000,
    unit_price: 12_000,
    price_mode: 'tourist',
    sale_unit: 'piece',
    selected_options: {},
    quantity: 3,
    notes: '',
  })
  const legacy = rows.find(row => row.menu_item_id === 'legacy')
  assert.equal(legacy.base_price, 15_000)
  assert.equal(legacy.unit_price, 18_000)
})
