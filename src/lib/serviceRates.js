import { normalizeServiceRatePct } from './analytics.js'
import { PRICE_MODE_TOURIST, normalizePriceMode } from './priceModes.js'

export const DEFAULT_REGULAR_SERVICE_RATE_PCT = 15
export const DEFAULT_TOURIST_SERVICE_RATE_PCT = 20

export function getConfiguredServiceRatePct(settings, priceMode) {
  if (normalizePriceMode(priceMode) === PRICE_MODE_TOURIST) {
    return normalizeServiceRatePct(
      settings?.touristServiceRate,
      DEFAULT_TOURIST_SERVICE_RATE_PCT
    )
  }

  return normalizeServiceRatePct(
    settings?.serviceRate,
    DEFAULT_REGULAR_SERVICE_RATE_PCT
  )
}
