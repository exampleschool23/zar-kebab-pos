import { formatCurrency } from '../../../src/lib/formatCurrency.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import {
  bazaarUnitLabel,
  calculateBazaarExpectedTotal,
  calculateBazaarPriceDifference,
  calculateBazaarTotal,
  formatBazaarQuantity,
  getBazaarDisplayQuantity,
  getBazaarUnitCost,
  getBazaarNormalLineTotal,
  getBazaarPriceDifference,
  normalizeBazaarPurchase,
  normalizeBazaarQuantityToBase,
} from '../../../src/lib/bazaar.js'
import { escapeTelegramHtml } from './telegram.js'

const COPY = {
  uz: {
    title: 'Kunlik bozor',
    date: 'Sana',
    quantity: 'Miqdor',
    unitPrice: 'Birlik narxi',
    total: 'Bozor jami',
    normalTotal: 'Odatiy narx bo‘yicha jami',
    difference: 'Farq',
  },
  ru: {
    title: 'Ежедневный базар',
    date: 'Дата',
    quantity: 'Количество',
    unitPrice: 'Цена за единицу',
    total: 'Итого по базару',
    normalTotal: 'Итого по обычной цене',
    difference: 'Разница',
  },
  en: {
    title: 'Daily Bazaar',
    date: 'Date',
    quantity: 'Quantity',
    unitPrice: 'Unit price',
    total: 'Bazaar total',
    normalTotal: 'Normal-price total',
    difference: 'Difference',
  },
}

function normalizeLanguage(language) {
  return ['uz', 'ru', 'en'].includes(language) ? language : 'ru'
}

function formatSignedCurrency(value) {
  const amount = Math.round(Number(value) || 0)
  return amount > 0 ? `+${formatCurrency(amount)}` : formatCurrency(amount)
}

export function buildDailyBazaarGroupMessage(purchases = [], purchaseDate = '', language = 'ru') {
  const lang = normalizeLanguage(language)
  const copy = COPY[lang]
  const normalizedPurchases = purchases.map(normalizeBazaarPurchase)
  const items = normalizedPurchases.flatMap(purchase => purchase.items || [])
  const total = normalizedPurchases.reduce(
    (sum, purchase) => sum + calculateBazaarTotal(purchase.items || []),
    0,
  )
  const lines = [
    `🧺 <b>${copy.title}</b>`,
    `${copy.date}: ${escapeTelegramHtml(formatLongDate(purchaseDate, lang, purchaseDate || '—'))}`,
  ]

  for (const [index, item] of items.entries()) {
    const baseUnit = normalizeBazaarQuantityToBase(item.quantity, item.unit).unit
    const displayQuantity = getBazaarDisplayQuantity(item.quantity, item.unit)
    lines.push(
      '',
      `${index + 1}. <b>${escapeTelegramHtml(item.product_name)}</b>`,
      `${copy.quantity}: ${escapeTelegramHtml(formatBazaarQuantity(displayQuantity.quantity))} ${escapeTelegramHtml(bazaarUnitLabel(displayQuantity.unit, lang))} · ${copy.unitPrice}: ${escapeTelegramHtml(formatCurrency(Math.round(getBazaarUnitCost(item))))} / ${escapeTelegramHtml(bazaarUnitLabel(baseUnit, lang))}`,
      `${copy.normalTotal}: ${escapeTelegramHtml(formatCurrency(getBazaarNormalLineTotal(item)))} · ${copy.difference}: <b>${escapeTelegramHtml(formatSignedCurrency(getBazaarPriceDifference(item)))}</b>`,
    )
  }

  lines.push(
    '',
    `${copy.total}: <b>${escapeTelegramHtml(formatCurrency(total))}</b>`,
    `${copy.normalTotal}: <b>${escapeTelegramHtml(formatCurrency(calculateBazaarExpectedTotal(items)))}</b>`,
    `${copy.difference}: <b>${escapeTelegramHtml(formatSignedCurrency(calculateBazaarPriceDifference(items)))}</b>`,
  )
  return lines.join('\n')
}
