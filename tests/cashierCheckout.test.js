import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canConfirmCashierCheckout,
  getFreshCashierPaymentQuote,
} from '../src/lib/cashierCheckout.js'

test('fresh cashier quote preserves the saved Tourist service-rate snapshot', () => {
  const quote = getFreshCashierPaymentQuote({
    tableId: 't6',
    settings: { serviceRatePct: 15, touristServiceRatePct: 20 },
    menuItems: [{ id: 'zor-set', show_in_cashier_quick_items: false }],
    orders: [{
      id: 'order-t6',
      table_id: 't6',
      status: 'needs_bill',
      payment_status: 'unpaid',
      price_mode: 'tourist',
      service_rate_pct: 20,
      items: [{
        id: 'item-1',
        menu_item_id: 'zor-set',
        quantity: 1,
        unit_price: 83_000,
        status: 'new',
        item_type: 'menu',
        is_counter_item: false,
      }],
    }],
  })

  assert.equal(quote.subtotal, 83_000)
  assert.equal(quote.serviceFee, 16_600)
  assert.equal(quote.total, 99_600)
})

test('fresh cashier quote sums separate saved service rates instead of flattening table rounds', () => {
  const quote = getFreshCashierPaymentQuote({
    tableId: 't1',
    orders: [
      {
        id: 'regular', table_id: 't1', status: 'needs_bill', payment_status: 'unpaid', service_rate_pct: 15,
        items: [{ id: 'r1', quantity: 1, unit_price: 100_000, status: 'new' }],
      },
      {
        id: 'tourist', table_id: 't1', status: 'needs_bill', payment_status: 'unpaid', service_rate_pct: 20,
        items: [{ id: 't1', quantity: 1, unit_price: 100_000, status: 'new' }],
      },
    ],
  })

  assert.equal(quote.total, 235_000)
})

test('cashier can confirm a bill paid completely with loyalty', () => {
  assert.equal(canConfirmCashierCheckout({
    canEditCashier: true,
    loyaltyReady: true,
    grossAmount: 99_600,
    loyaltyUsedAmount: 99_600,
    paymentValidation: { totalAmount: 0, canConfirmPayment: false },
    isProcessingPayment: false,
    isRefreshingBill: false,
  }), true)
})

test('cashier confirmation remains disabled while the authoritative bill refresh is pending', () => {
  assert.equal(canConfirmCashierCheckout({
    canEditCashier: true,
    loyaltyReady: true,
    grossAmount: 99_600,
    loyaltyUsedAmount: 0,
    paymentValidation: { totalAmount: 99_600, canConfirmPayment: true },
    isProcessingPayment: false,
    isRefreshingBill: true,
  }), false)
})
