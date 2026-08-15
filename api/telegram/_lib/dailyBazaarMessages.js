import { formatCurrency } from '../../../src/lib/formatCurrency.js'
import { formatLongDate } from '../../../src/lib/dateFormat.js'
import {
  bazaarUnitLabel,
  calculateBazaarTotal,
  formatBazaarQuantity,
  getBazaarUnitCost,
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
  },
  ru: {
    title: 'Ежедневный базар',
    date: 'Дата',
    quantity: 'Количество',
    unitPrice: 'Цена за единицу',
    total: 'Итого по базару',
  },
  en: {
    title: 'Daily Bazaar',
    date: 'Date',
    quantity: 'Quantity',
    unitPrice: 'Unit price',
    total: 'Bazaar total',
  },
}

function normalizeLanguage(language) {
  return ['uz', 'ru', 'en'].includes(language) ? language : 'ru'
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
    lines.push(
      '',
      `${index + 1}. <b>${escapeTelegramHtml(item.product_name)}</b>`,
      `${copy.quantity}: ${escapeTelegramHtml(formatBazaarQuantity(item.quantity))} ${escapeTelegramHtml(bazaarUnitLabel(item.unit, lang))} · ${copy.unitPrice}: ${escapeTelegramHtml(formatCurrency(Math.round(getBazaarUnitCost(item))))} / ${escapeTelegramHtml(bazaarUnitLabel(baseUnit, lang))}`,
    )
  }

  lines.push('', `${copy.total}: <b>${escapeTelegramHtml(formatCurrency(total))}</b>`)
  return lines.join('\n')
}
