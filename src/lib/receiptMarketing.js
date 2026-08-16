import { normalizePriceMode } from './priceModes.js'

const RECEIPT_MARKETING_MODES = new Set(['none', 'compactFooter', 'loyaltyOnly', 'instagramOnly', 'full'])

export function normalizeReceiptMarketing(value) {
  return RECEIPT_MARKETING_MODES.has(value) ? value : 'compactFooter'
}

export function getReceiptFooterVisibility(receiptMarketing, priceMode) {
  const mode = normalizeReceiptMarketing(receiptMarketing)
  const marketingAllowed = normalizePriceMode(priceMode) !== 'tourist' && mode !== 'none'

  return {
    mode,
    showCustomFooter: marketingAllowed,
    showLoyalty: marketingAllowed && ['compactFooter', 'loyaltyOnly', 'full'].includes(mode),
    showInstagram: marketingAllowed && ['compactFooter', 'instagramOnly', 'full'].includes(mode),
    showThanks: true,
  }
}
