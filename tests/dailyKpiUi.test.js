import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const salaries = fs.readFileSync(new URL('../src/pages/Salaries.jsx', import.meta.url), 'utf8')
const employees = fs.readFileSync(new URL('../src/pages/Employees.jsx', import.meta.url), 'utf8')
const employeeHistory = fs.readFileSync(new URL('../src/pages/EmployeeSalaryHistory.jsx', import.meta.url), 'utf8')

test('Salaries configures effective-dated KPI rules behind Accounting write access', () => {
  assert.match(salaries, /canEditFeature\(profile \|\| \{ role \}, 'expenses'\)/)
  assert.match(salaries, /\.from\('employee_kpi_rules'\)[\s\S]*\.upsert\([\s\S]*onConflict: 'salary_profile_id,effective_from'/)
  assert.match(salaries, /rate_bps: rateBps/)
  assert.match(salaries, /is_enabled: Boolean\(kpiForm\.is_enabled\)/)
  assert.match(salaries, /disabled=\{!canManage[\s\S]*labels\.kpiSave/)
})

test('only owners see the touch-safe KPI rule removal flow and zero-row deletes are rejected', () => {
  assert.match(salaries, /const canRemoveKpiRules = role === 'owner'/)
  assert.match(salaries, /canRemoveRules=\{canRemoveKpiRules\}/)
  assert.match(salaries, /const canRemoveSelectedRule = canRemoveRules && selectedKpiProfile && selectedRule/)
  assert.match(salaries, /canRemoveSelectedRule && \([\s\S]*?touch-manipulation[\s\S]*?<Trash2/)
  assert.match(salaries, /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?labels\.kpiRemoveWarning/)
  assert.match(salaries, /\.from\('employee_kpi_rules'\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\('id', rule\.id\)[\s\S]*?\.select\('id'\)/)
  assert.match(salaries, /!Array\.isArray\(deletedRules\) \|\| deletedRules\.length !== 1/)
  assert.match(salaries, /isFinalizedKpiRuleError\(deleteError\)[\s\S]*?l\.kpiRemoveUsedError/)
  assert.doesNotMatch(salaries, /window\.confirm\(/)
})

test('Salaries keeps only KPI configuration while result history stays on employee history', () => {
  assert.match(salaries, /selectedRule=\{selectedKpiRule\}/)
  assert.doesNotMatch(salaries, /\.from\('employee_daily_kpi_results'\)/)
  assert.doesNotMatch(salaries, /labels\.kpiHistory/)
  assert.doesNotMatch(salaries, /labels\.kpiCurrent/)
  assert.doesNotMatch(salaries, /generate_daily_kpi_bonuses/)
})

test('salary setup forms share one tabbed card', () => {
  const settingsSection = salaries.slice(
    salaries.indexOf('aria-labelledby="salary-settings-heading"'),
    salaries.indexOf('function DailyKpiSection')
  )

  assert.match(settingsSection, /salarySetupMode === 'kpi' \? Percent : salarySetupMode === 'change' \? Save : Plus/)
  assert.match(settingsSection, /\{ key: 'add',[\s\S]*\{ key: 'change',[\s\S]*\{ key: 'kpi'/)
  assert.match(settingsSection, /salarySetupMode === 'add'[\s\S]*salarySetupMode === 'kpi'[\s\S]*<DailyKpiSection[\s\S]*salarySetupMode === 'change'/)
  assert.doesNotMatch(salaries, /<section className="mb-7" aria-labelledby="daily-kpi-heading">/)
})

test('automatic KPI bonuses are identified and show their immutable formula in employee history', () => {
  assert.match(employeeHistory, /employee_daily_kpi_results/)
  assert.match(employeeHistory, /entry\.automaticKpi/)
  assert.match(employeeHistory, /entry\.kpiResult\.baseAmountUzs/)
  assert.match(employeeHistory, /formatKpiRatePercent\(entry\.kpiResult\.rateBps, lang\)/)
  assert.match(employeeHistory, /entry\.kpiResult\.bonusAmountUzs/)
  assert.match(employeeHistory, /label=\{l\.kpiBonusTotal\}[\s\S]*monthSummary\.kpiBonusAmount/)
})

test('employee cards show the current effective KPI percentage and enabled state', () => {
  assert.match(employees, /\.from\('employee_kpi_rules'\)[\s\S]*?\.lte\('effective_from', today\)/)
  assert.match(employees, /getEffectiveKpiRule\(kpiRules, employee\.id, today\)/)
  assert.match(employees, /<EmployeeKpiRow[\s\S]*?rule=\{effectiveKpiRule\}/)

  const cardRow = employees.slice(
    employees.indexOf('function EmployeeKpiRow'),
    employees.indexOf('function DateInput')
  )
  assert.match(cardRow, /rule\.is_enabled !== false/)
  assert.match(cardRow, /formatKpiRatePercent\(rule\.rate_bps, lang\)/)
  assert.match(cardRow, /enabledLabel/)
  assert.match(cardRow, /disabledLabel/)
  assert.match(cardRow, /notConfiguredLabel/)
})
