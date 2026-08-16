import assert from 'node:assert/strict'
import test from 'node:test'

import { getReceiptFooterVisibility } from '../src/lib/receiptMarketing.js'

test('Tourist receipts suppress every marketing section but retain the final thank-you', () => {
  assert.deepEqual(getReceiptFooterVisibility('full', 'tourist'), {
    mode: 'full',
    showCustomFooter: false,
    showLoyalty: false,
    showInstagram: false,
    showThanks: true,
  })
})

test('turning receipt marketing off still retains the final thank-you', () => {
  assert.deepEqual(getReceiptFooterVisibility('none', 'regular'), {
    mode: 'none',
    showCustomFooter: false,
    showLoyalty: false,
    showInstagram: false,
    showThanks: true,
  })
})

test('Regular compact receipts retain selected marketing above the thank-you', () => {
  assert.deepEqual(getReceiptFooterVisibility('compactFooter', 'regular'), {
    mode: 'compactFooter',
    showCustomFooter: true,
    showLoyalty: true,
    showInstagram: true,
    showThanks: true,
  })
})
