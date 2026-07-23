import test from 'node:test'
import assert from 'node:assert/strict'

import { formatCurrencyWithPercentage } from '../src/lib/formatCurrency.js'

test('profit values format amount and localized margin together', () => {
  assert.match(
    formatCurrencyWithPercentage(1_790_306, 63.4, 'en'),
    /^1[,\s]790[,\s]306 UZS · 63\.4%$/
  )
  assert.match(formatCurrencyWithPercentage(1_790_306, 63.4, 'ru'), / · 63,4%$/)
  assert.match(formatCurrencyWithPercentage(1_790_306, 63.4, 'uz'), / · 63,4%$/)
  assert.match(formatCurrencyWithPercentage(1_790_306, null, 'en'), / UZS$/)
})
