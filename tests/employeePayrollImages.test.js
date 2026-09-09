import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { buildEmployeePayrollCalendar } from '../api/telegram/_lib/employeePayrollCalendar.js'
import { buildTeamKpiImageSvg, buildEmployeePayrollImageSvg, renderTeamKpiImage, renderEmployeePayrollImage } from '../api/telegram/_lib/employeePayrollImages.js'

const event = { salary_profile: { employee_name: 'Malika <&>' }, bonus_date: '2026-09-05', amount: 46651, source_metadata: { sales: 999999 }, created_by_name: 'Automatic KPI' }
const profile = { employee_name: 'Malika', joined_at: '2026-09-05', rates: [{ effective_from: '2026-09-05', amount: 50000, rate_unit: 'daily' }], bonuses: [{ bonus_date: '2026-09-05', amount: 46651, source_type: 'daily_kpi', accrues_to_salary: true }, { bonus_date: '2026-09-05', amount: 10000, source_type: 'manual', accrues_to_salary: true }], payments: [], fines: [], absences: [] }
test('Team KPI image shows only permitted fields and escapes employee text', () => {
 const svg = buildTeamKpiImageSvg(event)
 assert.match(svg, /Malika &lt;&amp;&gt;/)
 assert.match(svg, /46\s651/)
 assert.match(svg, /Система/)
 assert.doesNotMatch(svg, /999999|Остаток|Automatic KPI|Зарплата/)
})
test('private calendar separates KPI and manual bonuses and labels accrual before payments', () => {
 const svg = buildEmployeePayrollImageSvg(profile, '2026-09-05')
 assert.match(svg, /46\s651/)
 assert.match(svg, /10\s000/)
 assert.match(svg, /106\s651/)
 assert.match(svg, /Календарь начислений/)
 assert.match(svg, /Не является остатком к оплате/)
 const absent = buildEmployeePayrollImageSvg({ ...profile, absences: [{ absence_date: '2026-09-05' }] }, '2026-09-05')
 assert.match(absent, /Отсутствие/)
})
test('both notification renderers produce valid PNG files', async () => {
 for (const [buffer, width] of [[await renderTeamKpiImage(event), 1100], [await renderEmployeePayrollImage(profile, '2026-09-05'), 1680]]) {
   const meta = await sharp(buffer).metadata()
   assert.equal(meta.format, 'png')
   assert.equal(meta.width, width)
 }
})

test('calendar totals reconcile daily rates, absence, fines and both bonus settlement modes without deducting payments', () => {
 const data = { ...profile, joined_at: '2026-08-31', rates: [{ effective_from: '2026-08-31', amount: 100000, rate_unit: 'daily' }, { effective_from: '2026-09-02', amount: 120000, rate_unit: 'daily' }], absences: [{ absence_date: '2026-09-03' }], fines: [{ fine_date: '2026-09-02', amount: 30000 }], payments: [{ paid_date: '2026-09-02', amount: 999999 }], bonuses: [{ bonus_date: '2026-09-01', amount: 5000, source_type: 'manual', accrues_to_salary: false }, { bonus_date: '2026-09-02', amount: 10000, source_type: 'daily_kpi', accrues_to_salary: true }, { bonus_date: '2026-09-04', amount: 900000, source_type: 'manual' }] }
 const report = buildEmployeePayrollCalendar(data, '2026-09-03', '2026-08-31')
 assert.deepEqual(report.totals, { salary: 320000, kpi: 10000, manual: 5000, fine: 30000, paidDays: 3, net: 305000 })
 assert.equal(report.days[3].salary, 0)
 assert.equal(report.days[3].absence, true)
 assert.equal(report.days[0].first, true)
 const svg = buildEmployeePayrollImageSvg(data, '2026-09-03', '2026-08-31')
 assert.match(svg, /Штраф −30 000/)
 assert.doesNotMatch(svg, /999 999|900 000/)
 assert.equal(buildEmployeePayrollCalendar(data, '2026-09-03').start, '2026-09-01')
})
test('calendar handles six-week months, archive boundaries and XML in names', async () => {
 const data = { ...profile, employee_name: 'Имя <&>', joined_at: '2026-08-01', deleted_at: '2026-08-03T00:00:00Z', rates: [{ effective_from: '2026-08-01', amount: 100000, rate_unit: 'daily' }], bonuses: [] }
 const report = buildEmployeePayrollCalendar(data, '2026-08-31')
 assert.equal(report.days.length, 31)
 assert.equal(report.days[1].last, true)
 assert.equal(report.days[2].employed, false)
 assert.equal(report.totals.salary, 200000)
 const svg = buildEmployeePayrollImageSvg(data, '2026-08-31')
 assert.match(svg, /ИМЯ &lt;&amp;&gt;/)
 assert.match(svg, /Конец работы/)
 assert.equal((svg.match(/width="224" height="240"/g) || []).length, 42)
 assert.throws(() => buildEmployeePayrollCalendar(data, '2026-02-30'), /Invalid/)
 assert.throws(() => buildEmployeePayrollCalendar(data, '2026-12-31', '2026-01-01'), /62 days/)
})
