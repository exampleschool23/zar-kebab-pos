import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bazaarIngredientMatches, runBazaarIngredientWriteWithRecovery } from '../src/lib/bazaarIngredientWrites.js'

const migration = readFileSync(new URL('../supabase/182_rename_bazaar_ingredients.sql', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/BazaarIngredients.jsx', import.meta.url), 'utf8')

test('owners can rename an ingredient without changing its key or historical rows', () => {
  assert.match(migration, /current_staff_can_manage_bazaar_ingredients\(\)/)
  assert.match(migration, /ingredient_key := nullif\(btrim\(payload ->> 'product_key'\), ''\)/)
  assert.match(migration, /if ingredient_key is null then\s+ingredient_key := public.normalize_bazaar_product_key\(ingredient_name\);\s+else/)
  assert.match(migration, /where product_key = ingredient_key\s+for update/)
  assert.match(migration, /set product_name = excluded.product_name/)
  assert.doesNotMatch(migration, /Archive this ingredient|update public\.bazaar_purchase|delete from|set product_key =/)
  assert.doesNotMatch(page, /disabled=\{Boolean\(form.product_key\)\}/)
  assert.match(page, /product_key: form.product_key/)
})

test('an uncertain rename reconciles the new name under the original key', async () => {
  const original = { product_key: 'old name', product_name: 'old name' }
  const renamed = { ...original, product_name: 'Corrected name' }
  assert.equal(bazaarIngredientMatches(original, renamed), false)
  let writes = 0
  const result = await runBazaarIngredientWriteWithRecovery({
    write: async () => {
      writes += 1
      return { error: { code: 'POS_WRITE_TIMEOUT' } }
    },
    reconcile: async () => bazaarIngredientMatches(renamed, renamed) ? renamed : null,
  })
  assert.equal(writes, 1)
  assert.deepEqual(result.data, renamed)
  assert.equal(result.recovered, true)
})

test('purchase saves use the supplied stable key for lines and catalog usage', () => {
  const original = readFileSync(new URL('../supabase/097_daily_bazaar.sql', import.meta.url), 'utf8')
  const expression = 'public.normalize_bazaar_product_key(product_name_value)'
  assert.equal(original.split(expression).length - 1, 2)
  assert.match(migration, /item_value ->> ''product_key''/)
  assert.match(migration, /execute replace\(definition, old_expression, new_expression\)/)
  assert.match(migration, /position\(new_expression in definition\) = 0/)
})
