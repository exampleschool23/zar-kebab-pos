import sharp from 'sharp'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { formatSalaryNotificationAmount } from './salaryMessages.js'

const WIDTH = 1200
const HEIGHT = 1800
const CIRCLE_RADIUS = 205
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS

function escapeSvg(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character])
}

function normalizeAmount(value) {
  return Math.round(Number(value) || 0)
}

function normalizePercent(value) {
  const percentage = Number.isFinite(Number(value)) ? Number(value) : 0
  return Math.max(0, Math.min(100, percentage))
}

function formatPercent(value) {
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(normalizePercent(value))}%`
}

function formatMoney(value) {
  return `${formatSalaryNotificationAmount(normalizeAmount(value))} UZS`
}

function donutSegment(percentage, offset, color) {
  const length = CIRCLE_LENGTH * normalizePercent(percentage) / 100
  const remaining = Math.max(0, CIRCLE_LENGTH - length)
  return `<circle r="${CIRCLE_RADIUS}" fill="none" stroke="${color}" stroke-width="112" stroke-dasharray="${length.toFixed(2)} ${remaining.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`
}

function donutPercentageLabel(percentage, offset, centerX, centerY) {
  const normalizedPercentage = normalizePercent(percentage)
  const middleRatio = (offset + (CIRCLE_LENGTH * normalizedPercentage / 200)) / CIRCLE_LENGTH
  const angle = (-90 + middleRatio * 360) * Math.PI / 180
  const labelRadius = normalizedPercentage < 8 ? CIRCLE_RADIUS + 2 : CIRCLE_RADIUS
  const x = centerX + Math.cos(angle) * labelRadius
  const y = centerY + Math.sin(angle) * labelRadius + 10
  const fontSize = normalizedPercentage < 8 ? 22 : 34
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="${fontSize}" font-weight="800" fill="#FFFFFF" stroke="#173B3F" stroke-opacity="0.28" stroke-width="5" paint-order="stroke">${escapeSvg(formatPercent(normalizedPercentage))}</text>`
}

function expenseRow(label, value, y, { labelSize = 29, accent = '#173B3F' } = {}) {
  return `
    <circle cx="126" cy="${y - 10}" r="7" fill="${accent}"/>
    <text x="154" y="${y}" font-size="${labelSize}" fill="#4D5A59">${escapeSvg(label)}</text>
    <text x="1065" y="${y}" text-anchor="end" font-size="31" font-weight="700" fill="#173B3F">${escapeSvg(value)}</text>`
}

export function buildDailyPayrollGroupReportSvg(summary, date) {
  const cafeIncome = normalizeAmount(summary?.cafeIncomeTotal)
  const dineInPercentage = normalizePercent(summary?.dineInPercentage)
  const offPremisePercentage = normalizePercent(summary?.offPremisePercentage)
  const touristPercentage = normalizePercent(summary?.touristPercentage)
  const firstSegmentLength = CIRCLE_LENGTH * dineInPercentage / 100
  const secondSegmentLength = CIRCLE_LENGTH * offPremisePercentage / 100
  const cafeNetProfit = Number.isFinite(Number(summary?.cafeNetProfit))
    ? formatMoney(summary.cafeNetProfit)
    : 'Недоступно'
  const netProfit = Number.isFinite(Number(summary?.netProfit))
    ? formatMoney(summary.netProfit)
    : 'Недоступно'
  const employeeMealLabel = `Среднее питание сотрудников (${normalizeAmount(summary?.presentEmployeeCount)} × ${formatSalaryNotificationAmount(summary?.employeeMealPerEmployeeTotal)})`
  const compactDate = formatLongDate(date, 'ru', date, { includeYear: false }).replace(/\s+/, '-')
  const chartCenterX = 365
  const chartCenterY = 613
  const regularColor = '#0D9488'
  const offPremiseColor = '#F97316'
  const touristColor = '#C026D3'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="header" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#173B3F"/>
      <stop offset="1" stop-color="#0F5B59"/>
    </linearGradient>
    <linearGradient id="profit" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#DDF7EC"/>
      <stop offset="1" stop-color="#ECFAF4"/>
    </linearGradient>
    <linearGradient id="average" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#173B3F"/>
      <stop offset="1" stop-color="#0D766F"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="52" fill="#EAF0EE"/>
  <rect x="34" y="34" width="1132" height="1732" rx="44" fill="#F8FAF9"/>
  <g font-family="Arial, DejaVu Sans, sans-serif">
    <rect x="34" y="34" width="1132" height="204" rx="44" fill="url(#header)"/>
    <rect x="78" y="78" width="64" height="56" rx="14" fill="#FFFFFF" fill-opacity="0.14"/>
    <path d="M94 94h32v27H94z M102 87h16v8h-16z" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round"/>
    <text x="174" y="105" font-size="20" font-weight="700" letter-spacing="3" fill="#9FE3D8">ZAR KEBAB · DAILY FINANCE</text>
    <text x="174" y="157" font-size="42" font-weight="700" fill="#FFFFFF">Зарплата, KPI и прибыль</text>
    <rect x="905" y="92" width="195" height="58" rx="29" fill="#FFFFFF" fill-opacity="0.14"/>
    <text x="1002" y="130" text-anchor="middle" font-size="27" font-weight="700" fill="#FFFFFF">${escapeSvg(compactDate)}</text>

    <rect x="68" y="270" width="1064" height="642" rx="34" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <text x="664" y="324" font-size="20" font-weight="700" letter-spacing="2.5" fill="#70817E">ВЫРУЧКА КАФЕ ЗА ДЕНЬ</text>
    <text x="664" y="382" font-size="49" font-weight="800" fill="#173B3F">${escapeSvg(formatMoney(cafeIncome))}</text>

    <g transform="translate(${chartCenterX} ${chartCenterY}) rotate(-90)">
      <circle r="${CIRCLE_RADIUS}" fill="none" stroke="#E8EFED" stroke-width="112"/>
      ${donutSegment(dineInPercentage, 0, regularColor)}
      ${donutSegment(offPremisePercentage, firstSegmentLength, offPremiseColor)}
      ${donutSegment(touristPercentage, firstSegmentLength + secondSegmentLength, touristColor)}
    </g>
    <circle cx="${chartCenterX}" cy="${chartCenterY}" r="143" fill="#FFFFFF"/>
    <text x="${chartCenterX}" y="602" text-anchor="middle" font-size="20" font-weight="700" letter-spacing="2" fill="#82918F">СТРУКТУРА</text>
    <text x="${chartCenterX}" y="638" text-anchor="middle" font-size="29" font-weight="700" fill="#173B3F">выручки</text>
    ${donutPercentageLabel(dineInPercentage, 0, chartCenterX, chartCenterY)}
    ${donutPercentageLabel(offPremisePercentage, firstSegmentLength, chartCenterX, chartCenterY)}
    ${donutPercentageLabel(touristPercentage, firstSegmentLength + secondSegmentLength, chartCenterX, chartCenterY)}

    <text x="664" y="485" font-size="19" font-weight="700" letter-spacing="1.6" fill="${regularColor}">● ЗАЛ</text>
    <text x="664" y="521" font-size="29" font-weight="700" fill="#173B3F">Обычная выручка</text>
    <text x="664" y="580" font-size="19" font-weight="700" letter-spacing="1.6" fill="${offPremiseColor}">● ВНЕ ЗАЛА</text>
    <text x="664" y="616" font-size="29" font-weight="700" fill="#173B3F">С собой + доставка</text>
    <text x="664" y="675" font-size="19" font-weight="700" letter-spacing="1.6" fill="${touristColor}">● ТУРИСТЫ</text>
    <text x="664" y="711" font-size="29" font-weight="700" fill="#173B3F">Туристическая выручка</text>

    <rect x="646" y="760" width="424" height="104" rx="24" fill="#EAF8F3"/>
    <text x="676" y="802" font-size="22" font-weight="700" fill="#4A6A61">ЧИСТАЯ ПРИБЫЛЬ КАФЕ</text>
    <text x="676" y="842" font-size="34" font-weight="800" fill="#137A58">${escapeSvg(cafeNetProfit)}</text>

    <rect x="68" y="940" width="1064" height="448" rx="34" fill="#FFFFFF" stroke="#DDE8E5" stroke-width="2"/>
    <circle cx="112" cy="992" r="22" fill="#FFF0E7"/>
    <path d="M102 992h20 M106 982v20 M118 982v20" stroke="#F97316" stroke-width="4" stroke-linecap="round"/>
    <text x="150" y="1003" font-size="24" font-weight="800" letter-spacing="2" fill="#173B3F">РАСХОДЫ И НАЧИСЛЕНИЯ</text>
    <line x1="106" y1="1032" x2="1094" y2="1032" stroke="#E7EEEC" stroke-width="2"/>
    ${expenseRow('Начисленная зарплата', formatMoney(summary?.salaryTotal), 1088, { accent: regularColor })}
    ${expenseRow('Автоматические KPI-бонусы', formatMoney(summary?.kpiBonusTotal), 1152, { accent: touristColor })}
    ${expenseRow('Аренда', formatMoney(summary?.rentTotal), 1216, { accent: '#3B82F6' })}
    ${expenseRow('Коммуналка', formatMoney(summary?.utilitiesTotal), 1280, { accent: '#EAB308' })}
    ${expenseRow(employeeMealLabel, formatMoney(summary?.employeeMealTotal), 1344, { labelSize: 26, accent: offPremiseColor })}

    <rect x="68" y="1418" width="1064" height="142" rx="32" fill="url(#profit)" stroke="#BDEBD8" stroke-width="2"/>
    <circle cx="128" cy="1489" r="32" fill="#137A58"/>
    <path d="M113 1497l11-11 9 8 15-18" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="182" y="1477" font-size="22" font-weight="800" letter-spacing="1.8" fill="#447164">ЧИСТАЯ ПРИБЫЛЬ ЗА ДЕНЬ</text>
    <text x="182" y="1525" font-size="42" font-weight="800" fill="#137A58">${escapeSvg(netProfit)}</text>

    <rect x="68" y="1590" width="1064" height="142" rx="32" fill="url(#average)"/>
    <circle cx="128" cy="1661" r="32" fill="#FFFFFF" fill-opacity="0.14"/>
    <path d="M111 1669v-22 M123 1669v-34 M135 1669v-15 M147 1669v-43" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/>
    <text x="182" y="1649" font-size="22" font-weight="800" letter-spacing="1.4" fill="#A8E6DC">СРЕДНЯЯ ДНЕВНАЯ ВЫРУЧКА КАФЕ ЗА МЕСЯЦ</text>
    <text x="182" y="1697" font-size="42" font-weight="800" fill="#FFFFFF">${escapeSvg(formatMoney(summary?.monthlyAverageCafeIncome))}</text>
  </g>
</svg>`
}

export async function buildDailyPayrollGroupReportPng(summary, date) {
  const svg = buildDailyPayrollGroupReportSvg(summary, date)
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}
