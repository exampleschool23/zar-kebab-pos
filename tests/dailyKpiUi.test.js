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

test('only owners can remove active KPI rules and zero-row deletes are rejected', () => {
  assert.match(salaries, /const canRemoveKpiRules = role === 'owner'/)
  assert.match(salaries, /canRemoveRules=\{canRemoveKpiRules\}/)
  assert.match(salaries, /const canRemoveSelectedRule = canRemoveRules[\s\S]*?selectedRule\.is_enabled !== false/)
  assert.match(salaries, /canRemoveSelectedRule && \([\s\S]*?touch-manipulation[\s\S]*?<Trash2/)
  assert.match(salaries, /role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?labels\.kpiRemoveWarning/)
  assert.match(salaries, /setKpiRuleToRemove\(\{ salaryProfile, rule, effectiveFrom: removalDate \}\)/)
  assert.match(salaries, /removeKpiRulePreservingHistory\(\{[\s\S]*?effectiveFrom,[\s\S]*?createdBy:/)
  assert.match(salaries, /labels\.kpiRemoveFrom[\s\S]*?ruleToRemove\.effectiveFrom/)
  assert.doesNotMatch(salaries, /removeKpiRulePreservingHistory\(\{[\s\S]*?effectiveFrom: today/)
  assert.match(salaries, /removalResult\.action === 'not_deleted'/)
  assert.match(salaries, /removalResult\.action === 'disabled' \? l\.kpiStopped : l\.kpiRemoved/)
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

test('salary setup keeps KPI content inside the mobile viewport', () => {
  const settingsSection = salaries.slice(
    salaries.indexOf('aria-labelledby="salary-settings-heading"'),
    salaries.indexOf('function DailyKpiSection')
  )

  assert.match(settingsSection, /grid w-full min-w-0 grid-cols-1 items-stretch gap-4/)
  assert.match(settingsSection, /h-full w-full min-w-0 rounded-2xl/)
  assert.match(salaries, /embedded \? 'min-w-0'/)
  assert.match(salaries, /grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2/)
  assert.match(salaries, /absolute left-0 top-1 h-4 w-4/)
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
