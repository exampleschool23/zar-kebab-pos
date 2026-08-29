import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTechCardPayload,
  calculateTechCardSummary,
  createBlankTechCard,
  validateTechCard,
} from '../src/lib/techCards.js'

test('tech card calculates batch cost and per-portion cost from ingredient prices', () => {
  const summary = calculateTechCardSummary({
    portion_count: 50,
    batch_output_quantity: 5,
    ingredients: [
      { name: 'Meat', quantity: 5, unit: 'kg', unit_price_uzs: 80_000 },
      { name: 'Onion', quantity: 2.5, unit: 'kg', unit_price_uzs: 4_000 },
    ],
  })

  assert.equal(summary.batchCost, 410_000)
  assert.equal(summary.portionCost, 8_200)
  assert.equal(summary.outputPerPortion, 0.1)
})

test('included menu items add their protected real cost to every set portion', () => {
  const summary = calculateTechCardSummary({
    portion_count: 2,
    ingredients: [
      { name: 'Packaging', quantity: 2, unit: 'piece', unit_price_uzs: 5_000 },
    ],
    components: [
      { component_menu_item_id: 'coke-1', quantity: 1 },
      { component_menu_item_id: 'kebab-1', quantity: 2 },
      { component_menu_item_id: '', quantity: 1 },
    ],
  }, [
    { id: 'coke-1', cost_price: 4_000 },
    { id: 'kebab-1', cost_price: 20_000 },
  ])

  assert.equal(summary.ingredientBatchCost, 10_000)
  assert.equal(summary.ingredientCostPerPortion, 5_000)
  assert.equal(summary.componentCostPerPortion, 44_000)
  assert.equal(summary.portionCost, 49_000)
  assert.equal(summary.batchCost, 98_000)
  assert.deepEqual(summary.components.map(component => component.lineCost), [4_000, 40_000, null])
})

test('included menu item variants use their protected variant cost and otherwise fall back to the parent cost', () => {
  const menuItem = {
    id: 'bread-1',
    cost_price: 8_000,
    variant_costs: { half: 4_000 },
    option_groups: [{ id: 'variants', options: [{ id: 'whole' }, { id: 'half' }] }],
  }
  const summary = calculateTechCardSummary({
    portion_count: 1,
    components: [
      { component_menu_item_id: 'bread-1', selected_options: { variants: 'half' }, quantity: 1 },
      { component_menu_item_id: 'bread-1', selected_options: { variants: 'whole' }, quantity: 1 },
    ],
  }, [menuItem])

  assert.deepEqual(summary.components.map(component => component.unitCost), [4_000, 8_000])
  assert.equal(summary.portionCost, 12_000)
})

test('included menu item cost is unavailable instead of silently treated as zero', () => {
  const card = {
    menu_item_id: 'set-1',
    portion_count: 1,
    preparation_steps: 'Assemble.',
    ingredients: [],
    components: [{ component_menu_item_id: 'legacy-1', quantity: 1 }],
  }

  const summary = calculateTechCardSummary(card, [{ id: 'legacy-1', cost_price: null }])
  assert.equal(summary.componentCostAvailable, false)
  assert.equal(summary.portionCost, null)
  assert.equal(summary.batchCost, null)
  assert.match(validateTechCard(card, [{ id: 'legacy-1', cost_price: null }]), /real cost/i)
})

test('tech card payload trims recipe text and normalizes ingredient values', () => {
  const payload = buildTechCardPayload({
    menu_item_id: ' meal-1 ',
    portion_count: '50',
    batch_output_quantity: '5,5',
    batch_output_unit: 'kg',
    preparation_steps: '  Cook slowly.  ',
    notes: '  Keep chilled. ',
    ingredients: [{ name: '  Meat ', quantity: '5,25', unit: 'kg', unit_price_uzs: '80000' }],
  })

  assert.deepEqual(payload, {
    menu_item_id: 'meal-1',
    portion_count: 50,
    batch_output_quantity: 5.5,
    batch_output_unit: 'kg',
    preparation_steps: 'Cook slowly.',
    notes: 'Keep chilled.',
    ingredients: [{ name: 'Meat', quantity: 5.25, unit: 'kg', unit_price_uzs: 80_000, sort_order: 1 }],
    components: [],
  })
})

test('tech card validation requires a positive yield and a complete ingredient', () => {
  const card = createBlankTechCard('meal-1')
  assert.match(validateTechCard(card), /ingredient/i)

  card.ingredients = [{ name: 'Meat', quantity: '0', unit: 'kg', unit_price_uzs: '80000' }]
  assert.match(validateTechCard(card), /quantity/i)

  card.ingredients[0].quantity = '5'
  assert.match(validateTechCard(card), /preparation method/i)
  assert.equal(
    validateTechCard(card, [], { preparationMethodRequired: 'Tayyorlash usulini kiriting.' }),
    'Tayyorlash usulini kiriting.'
  )

  card.preparation_steps = 'Cook slowly.'
  assert.equal(validateTechCard(card), '')
})

test('tech card normalizes and validates included menu items for sets', () => {
  const card = createBlankTechCard('set-1')
  card.components = [
    { component_menu_item_id: ' kebab-1 ', quantity: '10' },
    { component_menu_item_id: 'bread-1', quantity: '2,5' },
  ]
  card.preparation_steps = 'Assemble the set.'

  const payload = buildTechCardPayload(card)
  assert.deepEqual(payload.components, [
    { component_menu_item_id: 'kebab-1', selected_options: {}, quantity: 10, sort_order: 1 },
    { component_menu_item_id: 'bread-1', selected_options: {}, quantity: 2.5, sort_order: 2 },
  ])
  assert.equal(validateTechCard(card), '')

  card.components.push({ component_menu_item_id: 'kebab-1', quantity: 1 })
  assert.match(validateTechCard(card), /same included menu item/i)
})

test('tech card payload preserves a selected included-item variant', () => {
  const payload = buildTechCardPayload({
    menu_item_id: 'set-1',
    portion_count: 1,
    preparation_steps: 'Assemble.',
    components: [{
      component_menu_item_id: 'bread-1',
      selected_options: { variants: 'half' },
      quantity: 2,
    }],
  })

  assert.deepEqual(payload.components[0], {
    component_menu_item_id: 'bread-1',
    selected_options: { variants: 'half' },
    quantity: 2,
    sort_order: 1,
  })
})

test('piece-based included items require whole stock quantities', () => {
  const card = createBlankTechCard('set-1')
  card.components = [{ component_menu_item_id: 'coke-1', quantity: '1.5' }]
  card.preparation_steps = 'Assemble the set.'

  assert.match(validateTechCard(card, [{ id: 'coke-1', sale_unit: 'piece', cost_price: 4_000 }]), /whole quantity/i)
  assert.equal(validateTechCard(card, [{ id: 'coke-1', sale_unit: 'kg', cost_price: 4_000 }]), '')
})
