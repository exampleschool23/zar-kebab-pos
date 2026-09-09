import { getSalaryAccruedAmount, getSalaryAbsenceForDate, normalizeExpenseAmount } from '../../../src/lib/expenses.js'
import { addSalaryDateDays, formatSalaryNotificationAmount } from './salaryMessages.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
const number = formatSalaryNotificationAmount
const colors = { ink: '#071e49', salary: '#135b32', kpi: '#1743a3', fine: '#bd1818', manual: '#7432a3', muted: '#8b8c87' }

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && addSalaryDateDays(value, 0) === value
}

// The scheduled image covers month-to-date. An explicit start supports a short
// cross-month employment report without changing the scheduled delivery window.
export function buildEmployeePayrollCalendar(profile, date, startDate = `${date.slice(0, 7)}-01`) {
  if (!validDate(date) || !validDate(startDate) || startDate > date) throw new Error('Invalid payroll calendar range')
  const joined = String(profile?.joined_at || '').slice(0, 10)
  const ended = String(profile?.ended_at || '').slice(0, 10)
  const deleted = String(profile?.deleted_at || '').slice(0, 10)
  const start = joined > startDate && joined <= date ? joined : startDate
  const days = []
  for (let day = start; day <= date; day = addSalaryDateDays(day, 1)) {
    if (days.length >= 62) throw new Error('Payroll calendar range exceeds 62 days')
    const employed = (!joined || day >= joined) && (!ended || day <= ended) && (!deleted || day < deleted)
    const absence = employed && !!getSalaryAbsenceForDate(profile, day)
    const salary = employed ? getSalaryAccruedAmount(profile, day, day) : 0
    const bonuses = (profile?.bonuses || []).filter(row => row.bonus_date?.slice(0, 10) === day)
    const kpi = bonuses.filter(row => row.source_type === 'daily_kpi').reduce((sum, row) => sum + normalizeExpenseAmount(row.amount), 0)
    const manual = bonuses.filter(row => row.source_type !== 'daily_kpi').reduce((sum, row) => sum + normalizeExpenseAmount(row.amount), 0)
    const fine = (profile?.fines || []).filter(row => row.fine_date?.slice(0, 10) === day).reduce((sum, row) => sum + normalizeExpenseAmount(row.amount), 0)
    days.push({ date: day, employed, absence, salary, kpi, manual, fine, first: day === joined, last: day === ended || (deleted && day === addSalaryDateDays(deleted, -1)) })
  }
  const totals = days.reduce((sum, day) => ({ salary: sum.salary + day.salary, kpi: sum.kpi + day.kpi, manual: sum.manual + day.manual, fine: sum.fine + day.fine, paidDays: sum.paidDays + Number(day.salary > 0) }), { salary: 0, kpi: 0, manual: 0, fine: 0, paidDays: 0 })
  totals.net = totals.salary + totals.kpi + totals.manual - totals.fine
  return { start, end: date, days, totals }
}

export function buildEmployeePayrollCalendarSvg(profile, date, startDate) {
  const report = buildEmployeePayrollCalendar(profile, date, startDate)
  const { totals } = report
  const width = 1680, margin = 56, cellWidth = 224, top = 390, headerHeight = 46, rowHeight = 240
  const offset = (new Date(`${report.start}T12:00:00Z`).getUTCDay() + 6) % 7
  const weekCount = Math.ceil((offset + report.days.length) / 7)
  const bottom = top + headerHeight + weekCount * rowHeight
  const height = bottom + 150
  const text = (x, y, value, size = 24, color = colors.ink, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${escape(value)}</text>`
  const name = profile?.employee_name || profile?.profile?.full_name || 'Сотрудник'
  const nameSize = Math.min(76, 1400 / Math.max([...name].length, 1))
  const shortDate = day => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))
  const cells = Array.from({ length: weekCount * 7 }, (_, index) => {
    const day = report.days[index - offset]
    const cellDate = addSalaryDateDays(report.start, index - offset)
    const x = margin + index % 7 * cellWidth, y = top + headerHeight + Math.floor(index / 7) * rowHeight
    const lines = []
    if (day) {
      if (day.first) lines.push(['Первый день', colors.ink])
      if (day.absence) lines.push(['Отсутствие', colors.fine])
      if (!day.employed) lines.push(['Вне периода работы', colors.muted])
      lines.push([`Зарплата ${number(day.salary)}`, colors.salary])
      lines.push([`KPI ${day.kpi ? number(day.kpi) : '—'}`, colors.kpi])
      if (day.fine) lines.push([`Штраф −${number(day.fine)}`, colors.fine])
      if (day.manual) lines.push([`Бонус +${number(day.manual)}`, colors.manual])
      if (day.last) lines.push(['Конец работы', colors.ink])
    }
    return `<g><rect x="${x}" y="${y}" width="${cellWidth}" height="${rowHeight}" fill="${day?.absence ? '#fee2e2' : day ? '#fffdf8' : '#f4f2ec'}" stroke="#aeb3b6"/>${text(x + 16, y + 34, shortDate(cellDate), 27, day ? colors.ink : colors.muted, 'font-weight="700"')}${lines.map(([label, color], i) => text(x + 16, y + 65 + i * 25, label, 20, color, 'font-weight="600"')).join('')}</g>`
  }).join('')
  const cards = [ ['ЗАРПЛАТА', totals.salary, colors.salary, '#f1f7ef'], ['KPI-БОНУСЫ', totals.kpi, colors.kpi, '#f0f4fa'], ['ШТРАФЫ', totals.fine ? `−${number(totals.fine)}` : '0', colors.fine, '#fcf1ec'] ]
  const rates = [...new Set(report.days.filter(day => day.salary > 0).map(day => day.salary))]
  const salaryFooter = rates.length === 1 ? `${totals.paidDays} дн. × ${number(rates[0])} сум` : `Дней с начислением: ${totals.paidDays}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#faf8f0"/><g font-family="Noto Sans">
  ${text(width / 2, 94, name.toLocaleUpperCase('ru-RU'), nameSize, colors.ink, 'text-anchor="middle" font-weight="700"')}
  ${text(width / 2, 148, `Календарь начислений · ${formatLongDate(report.start, 'ru', report.start)} – ${formatLongDate(report.end, 'ru', report.end)}`, 28, colors.ink, 'text-anchor="middle" font-weight="700"')}
  ${text(width / 2, 185, 'Zar Kebab · Все суммы в сумах', 25, colors.ink, 'text-anchor="middle"')}
  ${cards.map(([label, value, color, fill], i) => { const x = margin + i * 530; return `<rect x="${x}" y="212" width="508" height="112" rx="10" fill="${fill}" stroke="${color}" stroke-width="2"/>${text(x + 254, 246, label, 23, color, 'text-anchor="middle" font-weight="700"')}${text(x + 254, 299, typeof value === 'number' ? number(value) : value, 44, color, 'text-anchor="middle" font-weight="700"')}` }).join('')}
  ${text(width / 2, 365, `Ручные бонусы: ${number(totals.manual)} сум`, 27, colors.manual, 'text-anchor="middle" font-weight="700"')}
  <rect x="${margin}" y="${top}" width="1568" height="${headerHeight}" rx="4" fill="${colors.ink}"/>
  ${['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((day, i) => text(margin + i * cellWidth + cellWidth / 2, top + 32, day, 26, '#ffffff', 'text-anchor="middle" font-weight="700"')).join('')}
  ${cells}
  <path d="M ${margin} ${bottom + 22} H ${width - margin}" stroke="${colors.ink}" stroke-width="2"/>
  ${text(margin, bottom + 66, salaryFooter, 25, colors.ink, 'font-weight="700"')}
  ${text(600, bottom + 63, `Начислено за вычетом штрафов: ${number(totals.net)} сум`, 27, colors.ink, 'font-weight="700"')}
  ${text(600, bottom + 102, 'До вычета выплат · Не является остатком к оплате', 23)}
  </g></svg>`
}
