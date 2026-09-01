import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { aggregateIngredientConsumption } from '../src/lib/ingredientConsumption.js'
import {
  buildDailyBazaarReportSvg,
  buildDailyIngredientConsumptionReportSvg,
  buildDailyInvestorReportsCaption,
} from '../api/telegram/_lib/dailyOperationsReportImages.js'

test('ingredient consumption multiplies sale quantity by immutable per-portion Tech Card quantities', () => {
  const summary = aggregateIngredientConsumption([
    {
      status: 'completed',
      payment_status: 'paid',
      items: [
        {
          quantity: 3,
          status: 'served',
          tech_card_ingredient_snapshot: [
            { name: 'Картошка', quantity_per_portion: 250, unit: 'g', unit_price_uzs: 8 },
            { name: 'Масло', quantity_per_portion: 0.02, unit: 'l', unit_price_uzs: 18_000 },
          ],
        },
        { quantity: 2, status: 'served', tech_card_ingredient_snapshot: [] },
        { quantity: 1, status: 'cancelled', tech_card_ingredient_snapshot: [{ name: 'Ignore', quantity_per_portion: 1, unit: 'kg', unit_price_uzs: 1 }] },
      ],
    },
  ])

  assert.deepEqual(summary.ingredients, [
    { name: 'Картошка', unit: 'kg', quantity: 0.75, spent: 6_000 },
    { name: 'Масло', unit: 'l', quantity: 0.06, spent: 1_080 },
  ])
  assert.equal(summary.totalSpent, 7_080)
  assert.equal(summary.coveredItemCount, 1)
  assert.equal(summary.uncoveredItemCount, 1)
})

test('daily Bazaar and ingredient reports render as separate image layouts', () => {
  const bazaarSvg = buildDailyBazaarReportSvg([{
    bazaar_purchase_items: [
      { product_name: 'Картошка', category: 'vegetables', quantity: 1, unit: 'kg', line_total: 8_000, normal_unit_price: 10_000 },
      { product_name: 'Курица', category: 'poultry', quantity: 2, unit: 'kg', line_total: 82_000, normal_unit_price: 39_000 },
      ...Array.from({ length: 18 }, (_, index) => ({
        product_name: `Товар ${index + 1}`,
        category: 'grocery',
        quantity: 1,
        unit: 'pcs',
        line_total: 1_000 + index,
        normal_unit_price: 1_000 + index,
        sort_order: index + 2,
      })),
    ],
  }], '2026-08-30')
  const ingredientSvg = buildDailyIngredientConsumptionReportSvg({
    ingredients: [
      { name: 'Картошка', quantity: 0.75, unit: 'kg', spent: 6_000 },
      ...Array.from({ length: 24 }, (_, index) => ({
        name: `Ингредиент ${index + 2}`,
        quantity: index + 1,
        unit: 'kg',
        spent: 1_000 + index,
      })),
    ],
    totalSpent: 30_276,
    coveredItemCount: 1,
    uncoveredItemCount: 2,
  }, '2026-08-30')

  assert.doesNotMatch(bazaarSvg, /Ежедневный базар|30 августа 2026/)
  assert.match(bazaarSvg, /ИТОГО ПО БАЗАРУ/)
  assert.match(bazaarSvg, /ПТИЦА/)
  assert.match(bazaarSvg, /ОВОЩИ/)
  assert.match(bazaarSvg, /БАКАЛЕЯ/)
  assert.match(bazaarSvg, /1\. Курица/)
  assert.match(bazaarSvg, /2 кг · куплено 41\s000 UZS \/ кг/)
  assert.match(bazaarSvg, /норма 39\s000 UZS \/ кг/)
  assert.match(bazaarSvg, /82\s000 UZS/)
  assert.match(bazaarSvg, /разница \+4\s000 UZS/)
  assert.match(bazaarSvg, /разница -2\s000 UZS/)
  assert.match(bazaarSvg, /ОБЩАЯ РАЗНИЦА/)
  assert.match(bazaarSvg, /fill="#DC2626">разница \+4/)
  assert.match(bazaarSvg, /fill="#15803D">разница -2/)
  assert.match(bazaarSvg, /fill="#FCA5A5">\+2/)
  assert.match(bazaarSvg, /20\. Товар 18/)
  assert.doesNotMatch(bazaarSvg, /Ещё позиций/)
  const englishBazaarSvg = buildDailyBazaarReportSvg([{
    bazaar_purchase_items: [{
      product_name: 'Carrot', category: 'vegetables', quantity: 1, unit: 'kg',
      line_total: 8_000, normal_unit_price: 7_500,
    }],
  }], '2026-08-30', 'en')
  assert.match(englishBazaarSvg, /BAZAAR TOTAL · ITEMS: 1/)
  assert.match(englishBazaarSvg, /VEGETABLES/)
  assert.match(englishBazaarSvg, /difference \+500 UZS/)
  const missingNormalSvg = buildDailyBazaarReportSvg([{
    bazaar_purchase_items: [{ product_name: 'Legacy', category: 'grocery', quantity: 1, unit: 'pcs', line_total: 5_000 }],
  }], '2026-08-30')
  assert.match(missingNormalSvg, /НОРМАЛЬНАЯ ЦЕНА · 0\/1/)
  assert.match(missingNormalSvg, /НЕ ЗАДАНА/)
  assert.match(missingNormalSvg, /разница —/)
  assert.match(ingredientSvg, /Расход ингредиентов/)
  assert.match(ingredientSvg, /0,75 kg/)
  assert.match(ingredientSvg, /Ингредиент 25/)
  assert.doesNotMatch(ingredientSvg, /Ещё позиций/)
  assert.match(ingredientSvg, /без снимка Tech Card: 2/)
  assert.equal(
    buildDailyInvestorReportsCaption('2026-08-30', '2026-08-29'),
    '📊 <b>Ежедневные отчёты</b>\n💼 Финансы: 30 августа 2026\n🧺 Базар: 29 августа 2026'
  )
})

test('order item ingredient snapshots are variant-aware immutable and never backfilled', () => {
  const migration = readFileSync(new URL('../supabase/164_order_item_tech_card_ingredient_snapshots.sql', import.meta.url), 'utf8')
  assert.match(migration, /create table if not exists public\.order_item_tech_card_ingredient_snapshots/)
  assert.match(migration, /revoke all on table public\.order_item_tech_card_ingredient_snapshots from anon, authenticated/)
  assert.match(migration, /quantity_per_portion.*ingredient\.quantity \/ card_portion_count/s)
  assert.match(migration, /variant_option_id in/s)
  assert.match(migration, /build_tech_card_ingredient_snapshot\([\s\S]*component\.component_menu_item_id/)
  assert.match(migration, /after insert on public\.order_items/)
  assert.match(migration, /on conflict \(order_item_id\) do nothing/)
  assert.doesNotMatch(migration, /update public\.order_items|delete from public\.order_items/)
})

test('ingredient report has a duplicate-safe Investor delivery ledger', () => {
  const migration = readFileSync(new URL('../supabase/165_daily_ingredient_consumption_deliveries.sql', import.meta.url), 'utf8')
  const cron = readFileSync(new URL('../api/telegram/daily-salary.js', import.meta.url), 'utf8')
  assert.match(migration, /daily_ingredient_consumption_deliveries/)
  assert.match(migration, /Historical delivery skipped during migration/)
  assert.match(cron, /sendDailyIngredientConsumptionNotification/)
  assert.match(cron, /order_item_tech_card_ingredient_snapshots/)
  assert.match(cron, /buildDailyIngredientConsumptionReportPng/)
  assert.match(cron, /sendTelegramPhoto/)
})
