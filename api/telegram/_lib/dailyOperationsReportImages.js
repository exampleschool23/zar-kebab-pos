import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import { formatCurrency } from '../../../src/lib/formatCurrency.js'
import {
  bazaarUnitLabel,
  calculateBazaarExpectedTotal,
  calculateBazaarPriceDifference,
  calculateBazaarTotal,
  formatBazaarQuantity,
  getBazaarDisplayQuantity,
  getBazaarNormalLineTotal,
  getBazaarPriceDifference,
  normalizeBazaarPurchase,
} from '../../../src/lib/bazaar.js'

const WIDTH = 1200
const MAX_ROWS = 18
let fontsConfigured = false

function escapeSvg(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character])
}

function configureFonts() {
  if (fontsConfigured) return
  const fontDirectory = fileURLToPath(new URL('../../../node_modules/notosans-fontface/fonts/', import.meta.url))
  const configDirectory = join(tmpdir(), 'zar-kebab-fontconfig')
  const configPath = join(configDirectory, 'fonts.conf')
  mkdirSync(configDirectory, { recursive: true })
  writeFileSync(configPath, `<?xml version="1.0"?><fontconfig><dir>${escapeSvg(fontDirectory)}</dir><cachedir>${escapeSvg(join(tmpdir(), 'zar-kebab-font-cache'))}</cachedir><config></config></fontconfig>`)
  process.env.FONTCONFIG_FILE = configPath
  fontsConfigured = true
}

function signedMoney(value) {
  const amount = Math.round(Number(value) || 0)
  return `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`
}

function quantity(value) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(Number(value) || 0)
}

function reportShell({ title, subtitle, totalLabel, totalValue, rows, footer = '', accent = '#F97316' }) {
  const visibleRows = rows.slice(0, MAX_ROWS)
  const height = 390 + Math.max(visibleRows.length, 1) * 74 + (footer ? 76 : 0)
  const rowMarkup = visibleRows.length > 0
    ? visibleRows.map((row, index) => {
        const y = 330 + index * 74
        return `<g>
          <rect x="64" y="${y - 42}" width="1072" height="62" rx="16" fill="${index % 2 ? '#F8FAF9' : '#F1F6F4'}"/>
          <text x="88" y="${y - 5}" font-size="25" font-weight="700" fill="#173B3F">${escapeSvg(row.name)}</text>
          <text x="760" y="${y - 5}" text-anchor="end" font-size="23" fill="#526461">${escapeSvg(row.detail)}</text>
          <text x="1110" y="${y - 5}" text-anchor="end" font-size="25" font-weight="800" fill="${row.color || '#173B3F'}">${escapeSvg(row.value)}</text>
        </g>`
      }).join('')
    : `<text x="600" y="350" text-anchor="middle" font-size="28" fill="#879592">Нет данных за этот день</text>`
  const hiddenCount = Math.max(0, rows.length - visibleRows.length)
  const footerY = 335 + Math.max(visibleRows.length, 1) * 74
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
    <rect width="${WIDTH}" height="${height}" rx="48" fill="#EAF0EE"/>
    <rect x="28" y="28" width="1144" height="${height - 56}" rx="38" fill="#FFFFFF"/>
    <g font-family="Noto Sans">
      <circle cx="92" cy="93" r="34" fill="#FFF1E8"/>
      <circle cx="92" cy="93" r="12" fill="${accent}"/>
      <text x="146" y="87" font-size="34" font-weight="800" fill="#173B3F">${escapeSvg(title)}</text>
      <text x="146" y="121" font-size="21" fill="#74827F">${escapeSvg(subtitle)}</text>
      <rect x="64" y="158" width="1072" height="102" rx="24" fill="#173B3F"/>
      <text x="92" y="199" font-size="19" font-weight="700" letter-spacing="1.5" fill="#A8D7D0">${escapeSvg(totalLabel)}</text>
      <text x="92" y="239" font-size="35" font-weight="800" fill="#FFFFFF">${escapeSvg(totalValue)}</text>
      ${rowMarkup}
      ${hiddenCount ? `<text x="600" y="${footerY}" text-anchor="middle" font-size="20" fill="#74827F">Ещё позиций: ${hiddenCount}</text>` : ''}
      ${footer ? `<text x="600" y="${height - 62}" text-anchor="middle" font-size="20" fill="#74827F">${escapeSvg(footer)}</text>` : ''}
    </g>
  </svg>`
}

export function buildDailyBazaarReportSvg(purchases = [], date = '') {
  const normalized = purchases.map(normalizeBazaarPurchase)
  const items = normalized.flatMap(purchase => purchase.items || [])
  const total = normalized.reduce((sum, purchase) => sum + calculateBazaarTotal(purchase.items || []), 0)
  const expected = calculateBazaarExpectedTotal(items)
  const difference = calculateBazaarPriceDifference(items)
  return reportShell({
    title: 'Ежедневный базар',
    subtitle: formatLongDate(date, 'ru', date),
    totalLabel: 'ОПЛАЧЕНО · ОБЫЧНАЯ ЦЕНА · РАЗНИЦА',
    totalValue: `${formatCurrency(total)}  ·  ${formatCurrency(expected)}  ·  ${signedMoney(difference)}`,
    rows: items.map(item => {
      const display = getBazaarDisplayQuantity(item.quantity, item.unit)
      const itemDifference = getBazaarPriceDifference(item)
      return {
        name: item.product_name,
        detail: `${formatBazaarQuantity(display.quantity)} ${bazaarUnitLabel(display.unit, 'ru')} · норма ${formatCurrency(getBazaarNormalLineTotal(item))}`,
        value: signedMoney(itemDifference),
        color: itemDifference > 0 ? '#C2410C' : itemDifference < 0 ? '#137A58' : '#526461',
      }
    }),
    footer: `Позиций: ${items.length}`,
  })
}

export function buildDailyIngredientConsumptionReportSvg(summary = {}, date = '') {
  const uncovered = Number(summary.uncoveredItemCount) || 0
  return reportShell({
    title: 'Расход ингредиентов',
    subtitle: `${formatLongDate(date, 'ru', date)} · по Tech Card проданных блюд`,
    totalLabel: 'РАСЧЁТНАЯ СТОИМОСТЬ ИНГРЕДИЕНТОВ',
    totalValue: formatCurrency(Math.round(Number(summary.totalSpent) || 0)),
    accent: '#0D9488',
    rows: (summary.ingredients || []).map(ingredient => ({
      name: ingredient.name,
      detail: `${quantity(ingredient.quantity)} ${ingredient.unit === 'piece' ? 'шт' : ingredient.unit}`,
      value: formatCurrency(ingredient.spent),
    })),
    footer: `Покрыто строк продаж: ${Number(summary.coveredItemCount) || 0} · без снимка Tech Card: ${uncovered}`,
  })
}

export function buildDailyBazaarReportCaption(date) {
  return `🧺 <b>Ежедневный базар</b>\n📅 ${escapeSvg(formatLongDate(date, 'ru', date))}`
}

export function buildDailyInvestorReportsCaption(date) {
  return `📊 <b>Ежедневный финансовый отчёт и базар</b>\n📅 ${escapeSvg(formatLongDate(date, 'ru', date))}`
}

export function buildDailyIngredientConsumptionReportCaption(date) {
  return `🥕 <b>Расход ингредиентов по Tech Card</b>\n📅 ${escapeSvg(formatLongDate(date, 'ru', date))}`
}

export async function buildDailyBazaarReportPng(purchases, date) {
  configureFonts()
  return sharp(Buffer.from(buildDailyBazaarReportSvg(purchases, date))).png({ compressionLevel: 9 }).toBuffer()
}

export async function buildDailyIngredientConsumptionReportPng(summary, date) {
  configureFonts()
  return sharp(Buffer.from(buildDailyIngredientConsumptionReportSvg(summary, date))).png({ compressionLevel: 9 }).toBuffer()
}
