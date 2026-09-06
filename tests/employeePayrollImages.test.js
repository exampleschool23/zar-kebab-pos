import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
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
test('private daily image separates KPI and manual bonuses and preserves salary balance', () => {
 const svg = buildEmployeePayrollImageSvg(profile, '2026-09-05')
 assert.match(svg, /46\s651/)
 assert.match(svg, /10\s000/)
 assert.match(svg, /106\s651/)
 const absent = buildEmployeePayrollImageSvg({ ...profile, absences: [{ absence_date: '2026-09-05' }] }, '2026-09-05')
 assert.match(absent, /Отсутствие/)
})
test('both notification renderers produce valid PNG files', async () => {
 for (const buffer of [await renderTeamKpiImage(event), await renderEmployeePayrollImage(profile, '2026-09-05')]) {
   const meta = await sharp(buffer).metadata()
   assert.equal(meta.format, 'png')
   assert.equal(meta.width, 1100)
 }
})
