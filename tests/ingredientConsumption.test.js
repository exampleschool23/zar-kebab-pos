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
    bazaar_purchase_items: [{
      product_name: 'Картошка', quantity: 1, unit: 'kg', line_total: 8_000,
      normal_unit_price: 7_500, normal_line_total: 7_500, price_difference: 500,
    }],
  }], '2026-08-30')
  const ingredientSvg = buildDailyIngredientConsumptionReportSvg({
    ingredients: [{ name: 'Картошка', quantity: 0.75, unit: 'kg', spent: 6_000 }],
    totalSpent: 6_000,
    coveredItemCount: 1,
    uncoveredItemCount: 2,
  }, '2026-08-30')

  assert.match(bazaarSvg, /Ежедневный базар/)
  assert.match(bazaarSvg, /\+500/)
  assert.match(ingredientSvg, /Расход ингредиентов/)
  assert.match(ingredientSvg, /0,75 kg/)
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
