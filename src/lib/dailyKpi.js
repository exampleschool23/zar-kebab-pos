const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function normalizeWholeAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0
}

export function parseKpiPercentToBps(value) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  if (!normalized) return 0
  const percentage = Number(normalized)
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return 0
  return Math.round(percentage * 100)
}

export function formatKpiRatePercent(rateBps, lang = 'en') {
  const normalizedRate = Number(rateBps)
  if (!Number.isFinite(normalizedRate)) return '0%'
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'uz' ? 'uz-UZ' : 'en-US'
  const percent = normalizedRate / 100
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(percent)}%`
}

export function formatKpiRateInput(rateBps) {
  const normalizedRate = Number(rateBps)
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) return ''
  return (normalizedRate / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

export function calculateDailyKpiBonus(baseAmountUzs, rateBps) {
  const baseAmount = normalizeWholeAmount(baseAmountUzs)
  const normalizedRate = Number(rateBps)
  if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) return 0
  return Math.round((baseAmount * normalizedRate) / 10000)
}

export function getDefaultKpiHistoryRange(today) {
  const normalizedToday = String(today || '').slice(0, 10)
  if (!ISO_DATE_PATTERN.test(normalizedToday)) return { dateFrom: '', dateTo: '' }
  return {
    dateFrom: `${normalizedToday.slice(0, 8)}01`,
    dateTo: normalizedToday,
  }
}

export function getKpiRuleEditDate(effectiveFrom, today) {
  const normalizedToday = String(today || '').slice(0, 10)
  const normalizedEffectiveFrom = String(effectiveFrom || '').slice(0, 10)
  if (!ISO_DATE_PATTERN.test(normalizedToday)) return ''
  return ISO_DATE_PATTERN.test(normalizedEffectiveFrom) && normalizedEffectiveFrom > normalizedToday
    ? normalizedEffectiveFrom
    : normalizedToday
}

export function getEffectiveKpiRule(rules = [], salaryProfileId, date) {
  const normalizedDate = String(date || '').slice(0, 10)
  if (!salaryProfileId || !ISO_DATE_PATTERN.test(normalizedDate)) return null
  return [...rules]
    .filter(rule => (
      rule?.salary_profile_id === salaryProfileId &&
      ISO_DATE_PATTERN.test(String(rule.effective_from || '').slice(0, 10)) &&
      String(rule.effective_from).slice(0, 10) <= normalizedDate
    ))
    .sort((a, b) => (
      String(b.effective_from).localeCompare(String(a.effective_from)) ||
      String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || ''))
    ))[0] || null
}

export async function removeKpiRulePreservingHistory({
  client,
  rule,
  effectiveFrom,
  createdBy = null,
  createdByName = '',
}) {
  const normalizedEffectiveFrom = String(effectiveFrom || '').slice(0, 10)
  const normalizedRuleStart = String(rule?.effective_from || '').slice(0, 10)
  if (
    !ISO_DATE_PATTERN.test(normalizedEffectiveFrom)
    || !ISO_DATE_PATTERN.test(normalizedRuleStart)
    || normalizedEffectiveFrom < normalizedRuleStart
  ) {
    const error = new Error('KPI removal date must be on or after the rule effective date')
    error.code = 'KPI_RULE_REMOVAL_DATE_INVALID'
    return { action: 'failed', rule: null, error }
  }

  if (normalizedEffectiveFrom > normalizedRuleStart) {
    // Keep the original rule effective through the day before the selected
    // boundary. A disabled successor changes only the selected date onward.
    const { data: disabledRule, error: disableError } = await client
      .from('employee_kpi_rules')
      .upsert({
        salary_profile_id: rule.salary_profile_id,
        effective_from: normalizedEffectiveFrom,
        rate_bps: rule.rate_bps,
        is_enabled: false,
        created_by: createdBy,
        created_by_name: createdByName,
      }, { onConflict: 'salary_profile_id,effective_from' })
      .select('id')
      .single()

    return disableError
      ? { action: 'failed', rule: null, error: disableError }
      : { action: 'disabled', rule: disabledRule, error: null }
  }

  const { data: deletedRules, error: deleteError } = await client
    .from('employee_kpi_rules')
    .delete()
    .eq('id', rule.id)
    .select('id')

  if (!deleteError) {
    return Array.isArray(deletedRules) && deletedRules.length === 1
      ? { action: 'deleted', rule: deletedRules[0], error: null }
      : { action: 'not_deleted', rule: null, error: null }
  }

  return { action: 'failed', rule: null, error: deleteError }
}

export function normalizeKpiResult(result = {}) {
  return {
    ...result,
    baseAmountUzs: normalizeWholeAmount(result.sales_base_amount),
    bonusAmountUzs: normalizeWholeAmount(result.bonus_amount),
    rateBps: Number.isFinite(Number(result.rate_bps)) ? Number(result.rate_bps) : 0,
  }
}

export function indexKpiResultsByBonusId(results = []) {
  return new Map(results
    .filter(result => result?.bonus_id)
    .map(result => [result.bonus_id, normalizeKpiResult(result)]))
}
