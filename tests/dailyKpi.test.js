import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateDailyKpiBonus,
  formatKpiRatePercent,
  formatKpiRateInput,
  getEffectiveKpiRule,
  getKpiRuleEditDate,
  getDefaultKpiHistoryRange,
  indexKpiResultsByBonusId,
  parseKpiPercentToBps,
} from '../src/lib/dailyKpi.js'

test('KPI percentage input is stored as integer basis points', () => {
  assert.equal(parseKpiPercentToBps('1'), 100)
  assert.equal(parseKpiPercentToBps('1.25'), 125)
  assert.equal(parseKpiPercentToBps('0,5'), 50)
  assert.equal(parseKpiPercentToBps('0'), 0)
  assert.equal(parseKpiPercentToBps('100.01'), 0)
  assert.equal(parseKpiPercentToBps('not-a-number'), 0)
})

test('daily KPI rounds once after applying the full employee rate', () => {
  assert.equal(calculateDailyKpiBonus(9_775_000, 100), 97_750)
  assert.equal(calculateDailyKpiBonus(123_456, 75), 926)
  assert.equal(calculateDailyKpiBonus(-1, 100), 0)
})

test('KPI helpers format rates and create a date-bounded current-month history range', () => {
  assert.equal(formatKpiRatePercent(125, 'en'), '1.25%')
  assert.equal(formatKpiRateInput(125), '1.25')
  assert.deepEqual(getDefaultKpiHistoryRange('2026-08-15'), {
    dateFrom: '2026-08-01',
    dateTo: '2026-08-15',
  })
})

test('effective KPI rules use the newest setting on or before the business date', () => {
  const rules = [
    { id: 'future', salary_profile_id: 'employee-1', effective_from: '2026-09-01', rate_bps: 200 },
    { id: 'current', salary_profile_id: 'employee-1', effective_from: '2026-08-10', rate_bps: 100 },
    { id: 'old', salary_profile_id: 'employee-1', effective_from: '2026-07-01', rate_bps: 50 },
  ]

  assert.equal(getEffectiveKpiRule(rules, 'employee-1', '2026-08-15')?.id, 'current')
  assert.equal(getEffectiveKpiRule(rules, 'employee-1', '2026-06-30'), null)
})

test('editing a finalized setting starts a new row today while future settings retain their date', () => {
  assert.equal(getKpiRuleEditDate('2026-08-01', '2026-08-15'), '2026-08-15')
  assert.equal(getKpiRuleEditDate('2026-08-15', '2026-08-15'), '2026-08-15')
  assert.equal(getKpiRuleEditDate('2026-09-01', '2026-08-15'), '2026-09-01')
})

test('KPI results can decorate their generated salary bonuses by durable bonus id', () => {
  const byBonusId = indexKpiResultsByBonusId([{
    id: 'result-1',
    bonus_id: 'bonus-1',
    sales_base_amount: '9775000',
    bonus_amount: '97750',
    rate_bps: '100',
  }])

  assert.deepEqual(byBonusId.get('bonus-1'), {
    id: 'result-1',
    bonus_id: 'bonus-1',
    sales_base_amount: '9775000',
    bonus_amount: '97750',
    rate_bps: '100',
    baseAmountUzs: 9_775_000,
    bonusAmountUzs: 97_750,
    rateBps: 100,
  })
})
