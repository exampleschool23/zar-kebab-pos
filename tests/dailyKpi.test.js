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
  removeKpiRulePreservingHistory,
} from '../src/lib/dailyKpi.js'

function createKpiRuleRemovalClient({ deleteResult, disableResult }) {
  const calls = []
  return {
    calls,
    client: {
      from(table) {
        assert.equal(table, 'employee_kpi_rules')
        return {
          delete() {
            calls.push({ operation: 'delete' })
            return {
              eq(column, value) {
                calls.push({ operation: 'delete-filter', column, value })
                return {
                  select(columns) {
                    calls.push({ operation: 'delete-select', columns })
                    return Promise.resolve(deleteResult)
                  },
                }
              },
            }
          },
          upsert(payload, options) {
            calls.push({ operation: 'upsert', payload, options })
            return {
              select(columns) {
                calls.push({ operation: 'upsert-select', columns })
                return {
                  single() {
                    return Promise.resolve(disableResult)
                  },
                }
              },
            }
          },
        }
      },
    },
  }
}

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

test('removing an unused KPI rule physically deletes exactly that rule', async () => {
  const { client, calls } = createKpiRuleRemovalClient({
    deleteResult: { data: [{ id: 'rule-1' }], error: null },
    disableResult: null,
  })

  const result = await removeKpiRulePreservingHistory({
    client,
    rule: {
      id: 'rule-1',
      salary_profile_id: 'employee-1',
      effective_from: '2026-09-01',
      rate_bps: 100,
    },
    effectiveFrom: '2026-09-01',
  })

  assert.deepEqual(result, {
    action: 'deleted',
    rule: { id: 'rule-1' },
    error: null,
  })
  assert.equal(calls.some(call => call.operation === 'upsert'), false)
})

test('a later selected removal date preserves the original KPI rule before its disabled successor', async () => {
  const { client, calls } = createKpiRuleRemovalClient({
    deleteResult: null,
    disableResult: { data: { id: 'disabled-rule' }, error: null },
  })
  const originalRule = {
    id: 'rule-1',
    salary_profile_id: 'employee-1',
    effective_from: '2026-08-17',
    rate_bps: 125,
    is_enabled: true,
  }

  const result = await removeKpiRulePreservingHistory({
    client,
    rule: originalRule,
    effectiveFrom: '2026-09-01',
    createdBy: 'owner-1',
    createdByName: 'Owner',
  })

  assert.deepEqual(result, {
    action: 'disabled',
    rule: { id: 'disabled-rule' },
    error: null,
  })
  assert.deepEqual(calls.find(call => call.operation === 'upsert'), {
    operation: 'upsert',
    payload: {
      salary_profile_id: 'employee-1',
      effective_from: '2026-09-01',
      rate_bps: 125,
      is_enabled: false,
      created_by: 'owner-1',
      created_by_name: 'Owner',
    },
    options: { onConflict: 'salary_profile_id,effective_from' },
  })
  assert.equal(calls.some(call => call.operation === 'delete'), false)

  const effectiveRules = [
    originalRule,
    {
      id: 'disabled-rule',
      salary_profile_id: 'employee-1',
      effective_from: '2026-09-01',
      rate_bps: 125,
      is_enabled: false,
    },
  ]
  assert.equal(getEffectiveKpiRule(effectiveRules, 'employee-1', '2026-08-31')?.id, 'rule-1')
  assert.equal(getEffectiveKpiRule(effectiveRules, 'employee-1', '2026-09-01')?.id, 'disabled-rule')
})

test('KPI removal does not mask permission or transport failures with a disabled rule', async () => {
  const permissionError = { code: '42501', message: 'permission denied' }
  const { client, calls } = createKpiRuleRemovalClient({
    deleteResult: { data: null, error: permissionError },
    disableResult: null,
  })

  const result = await removeKpiRulePreservingHistory({
    client,
    rule: {
      id: 'rule-1',
      salary_profile_id: 'employee-1',
      effective_from: '2026-09-01',
      rate_bps: 100,
    },
    effectiveFrom: '2026-09-01',
  })

  assert.deepEqual(result, {
    action: 'failed',
    rule: null,
    error: permissionError,
  })
  assert.equal(calls.some(call => call.operation === 'upsert'), false)
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
