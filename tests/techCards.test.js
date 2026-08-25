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
  })
})

test('tech card validation requires a positive yield and a complete ingredient', () => {
  const card = createBlankTechCard('meal-1')
  assert.match(validateTechCard(card), /ingredient/i)

  card.ingredients = [{ name: 'Meat', quantity: '0', unit: 'kg', unit_price_uzs: '80000' }]
  assert.match(validateTechCard(card), /quantity/i)

  card.ingredients[0].quantity = '5'
  assert.match(validateTechCard(card), /preparation method/i)

  card.preparation_steps = 'Cook slowly.'
  assert.equal(validateTechCard(card), '')
})
