import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CASHBACK_TYPES,
  DEFAULT_CASHBACK_TYPE,
  adjustLoyaltyBalance,
  canAdjustLoyaltyBalance,
  canCreateLoyaltyCard,
  canDeactivateLoyaltyCard,
  canEditLoyaltyCard,
  canViewLoyaltyCards,
  completeOrderCashback,
  createLoyaltyCardRecord,
  deactivateLoyaltyCardRecord,
  editLoyaltyCardRecord,
  formatUzPhoneNumberInput,
  getCashbackTypePercent,
  getLoyaltyCardCashbackPercent,
  getLoyaltyCardCashbackType,
  getLoyaltyCardDisplay,
  getLoyaltyCashbackPreview,
  getLoyaltyTransactionHistory,
  getPublicLoyaltyCardView,
  isMissingLoyaltySchemaColumn,
  isValidUzPhoneNumber,
  normalizeCardNumber,
  normalizeCashbackType,
  redeemLoyaltyBalance,
  validateLoyaltyPayment,
} from '../src/lib/loyalty.js'
import {
  getMaxLoyaltyRedeemAmount,
  getOrderPaymentSummary,
  getSplitPaymentValidation,
} from '../src/lib/analytics.js'

function assertLoyaltyError(fn, code) {
  assert.throws(fn, error => error?.name === 'LoyaltyError' && error?.code === code)
}

function card(overrides = {}) {
  return {
    id: 'lc-1',
    card_number: '00123456',
    public_token: 'public-token-1',
    customer_name: 'Ali Valiyev',
    phone_number: '+998901112233',
    cashback_type: 'silver',
    balance: 50000,
    total_earned: 120000,
    total_redeemed: 70000,
    is_active: true,
    updated_at: '2026-05-20T10:00:00.000Z',
    ...overrides,
  }
}

function item(overrides = {}) {
  return {
    id: 'item-1',
    menu_item_id: 'kebab',
    name: 'Kebab',
    quantity: 1,
    price: 100000,
    ...overrides,
  }
}

function unpaidOrder(overrides = {}) {
  return {
    id: 'order-1',
    status: 'needs_bill',
    payment_status: 'unpaid',
    order_type: 'dine_in',
    service_rate_pct: 15,
    ...overrides,
  }
}

function paidOrder(overrides = {}) {
  return {
    ...unpaidOrder(),
    status: 'paid',
    payment_status: 'paid',
    paid_at: '2026-05-20T12:00:00.000Z',
    ...overrides,
  }
}

test('loyalty card registration is owner-only and preserves exact 8-digit card numbers', () => {
  const created = createLoyaltyCardRecord({
    role: 'owner',
    cardNumber: '00123456',
    customerName: ' Ali Valiyev ',
    phoneNumber: ' +998901112233 ',
    publicToken: 'token-00123456',
    existingCardNumbers: [],
    now: '2026-05-20T10:00:00.000Z',
  })

  assert.equal(created.card_number, '00123456')
  assert.equal(typeof created.card_number, 'string')
  assert.equal(created.customer_name, 'Ali Valiyev')
  assert.equal(created.phone_number, '+998 90 111 22 33')
  assert.equal(created.cashback_type, DEFAULT_CASHBACK_TYPE)
  assert.equal(created.public_token, 'token-00123456')
  assert.equal(created.balance, 0)
  assert.equal(created.total_earned, 0)
  assert.equal(created.total_redeemed, 0)
  assert.equal(created.is_active, true)

  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'admin', cardNumber: '11112222' }), 'forbidden')
  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'cashier', cardNumber: '11112222' }), 'forbidden')
  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'owner', cardNumber: '1234567' }), 'invalid_card_number')
  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'owner', cardNumber: '123456789' }), 'invalid_card_number')
  assertLoyaltyError(() => createLoyaltyCardRecord({ role: 'owner', cardNumber: '1234abcd' }), 'invalid_card_number')
  assertLoyaltyError(() => createLoyaltyCardRecord({
    role: 'owner',
    cardNumber: '00123456',
    existingCardNumbers: ['00123456'],
    customerName: 'Ali',
    phoneNumber: '+998 91 132 32 32',
  }), 'duplicate_card_number')
  assertLoyaltyError(() => createLoyaltyCardRecord({
    role: 'owner',
    cardNumber: '11112222',
    customerName: '',
    phoneNumber: '+998 91 132 32 32',
  }), 'customer_name_required')
  assertLoyaltyError(() => createLoyaltyCardRecord({
    role: 'owner',
    cardNumber: '11112222',
    customerName: 'Ali',
    phoneNumber: '+998 91 132',
  }), 'invalid_phone_number')
  assert.equal(normalizeCardNumber('00000001'), '00000001')
})

test('loyalty card phone input masks and validates Uzbek numbers', () => {
  assert.equal(formatUzPhoneNumberInput('911323232'), '+998 91 132 32 32')
  assert.equal(formatUzPhoneNumberInput('+998911323232'), '+998 91 132 32 32')
  assert.equal(isValidUzPhoneNumber('+998 91 132 32 32'), true)
  assert.equal(isValidUzPhoneNumber('+998 911 32 32'), false)
})

test('loyalty schema cache helper detects missing migration columns without masking other errors', () => {
  assert.equal(isMissingLoyaltySchemaColumn({
    message: "Could not find the 'cashback_type' column of 'loyalty_cards' in the schema cache",
  }, 'cashback_type'), true)
  assert.equal(isMissingLoyaltySchemaColumn({
    message: "Could not find the 'cashback_percent_used' column of 'loyalty_transactions' in the schema cache",
  }, 'cashback_percent_used'), true)
  assert.equal(isMissingLoyaltySchemaColumn({ message: 'duplicate key value violates unique constraint' }, 'cashback_type'), false)
})

test('loyalty card display keeps card number, phone number, balance, type and fallbacks distinct', () => {
  const display = getLoyaltyCardDisplay(card({ cashback_type: 'gold' }))

  assert.equal(display.cardNumber, '00123456')
  assert.equal(display.customerName, 'Ali Valiyev')
  assert.equal(display.phoneNumber, '+998901112233')
  assert.equal(display.cashbackType, 'Gold')
  assert.equal(display.cashbackPercent, 7)
  assert.equal(display.balance, 50000)
  assert.equal(display.totalEarned, 120000)
  assert.equal(display.totalRedeemed, 70000)
  assert.equal(display.status, 'Active')

  const missing = getLoyaltyCardDisplay(card({ customer_name: '', phone_number: '', card_number: '00000009' }))
  assert.equal(missing.customerName, 'Unnamed customer')
  assert.equal(missing.phoneNumber, 'No phone')
  assert.equal(missing.cardNumber, '00000009')
  assert.notEqual(missing.cardNumber, missing.phoneNumber)
})

test('cashback types use fixed rates and reject invalid types', () => {
  assert.deepEqual(Object.keys(CASHBACK_TYPES), ['bronze', 'silver', 'gold', 'premium', 'black'])
  assert.equal(getCashbackTypePercent('bronze'), 3)
  assert.equal(getCashbackTypePercent('silver'), 5)
  assert.equal(getCashbackTypePercent('gold'), 7)
  assert.equal(getCashbackTypePercent('premium'), 10)
  assert.equal(getCashbackTypePercent('black'), 15)
  assert.equal(normalizeCashbackType('Gold'), 'gold')
  assert.equal(getLoyaltyCardCashbackType({ cashbackType: 'Premium' }), 'premium')
  assert.equal(getLoyaltyCardCashbackPercent({ cashbackType: 'Premium' }), 10)
  assert.equal(getLoyaltyCardCashbackPercent({ cashback_type: 'black' }), 15)
  assertLoyaltyError(() => normalizeCashbackType('diamond'), 'invalid_cashback_type')
})

test('cashback preview uses selected loyalty card type for exact 151000 UZS bug regression', () => {
  const rows = [
    item({ id: 'menu-total', menu_item_id: 'menu-total', price: 151000 }),
    item({ id: 'counter-total', menu_item_id: 'cola', price: 99000, item_type: 'counter', is_counter_item: true }),
  ]
  const order = paidOrder({ service_rate_pct: 15, tip_amount: 50000 })
  const expectedByType = {
    bronze: 4530,
    silver: 7550,
    gold: 10570,
    premium: 15100,
    black: 22650,
  }

  for (const [cashbackType, expected] of Object.entries(expectedByType)) {
    const preview = getLoyaltyCashbackPreview({
      order,
      items: rows,
      loyaltyUsedAmount: 0,
      card: card({ cashback_type: undefined, cashbackType }),
    })
    assert.equal(preview.cashback, expected)
  }

  const premiumPreview = getLoyaltyCashbackPreview({
    order,
    items: rows,
    loyaltyUsedAmount: 0,
    card: card({ cashback_type: undefined, cashbackType: 'premium' }),
  })
  assert.equal(premiumPreview.cashback, 15100)
  assert.notEqual(premiumPreview.cashback, 7550)

  const premiumPartial = getLoyaltyCashbackPreview({
    order,
    items: rows,
    loyaltyUsedAmount: 50000,
    card: card({ cashback_type: undefined, cashbackType: 'premium' }),
  })
  assert.equal(premiumPartial.cashback, 10100)

  const premiumOverRedeemed = getLoyaltyCashbackPreview({
    order,
    items: rows,
    loyaltyUsedAmount: 200000,
    card: card({ cashback_type: undefined, cashbackType: 'premium' }),
  })
  assert.equal(premiumOverRedeemed.cashback, 0)
})

test('owner can edit cashback type while old transaction snapshots keep historical rate and type', () => {
  const original = card({ cashback_type: 'bronze' })
  const oldSettlement = completeOrderCashback({
    card: original,
    order: paidOrder(),
    items: [item({ price: 99999 })],
    loyaltyUsedAmount: 0,
    now: '2026-05-20T12:00:00.000Z',
  })
  const edited = editLoyaltyCardRecord({ role: 'owner', card: original, patch: { cashback_type: 'black' } })
  const newSettlement = completeOrderCashback({
    card: edited,
    order: paidOrder({ id: 'order-2' }),
    items: [item({ price: 99999 })],
    loyaltyUsedAmount: 0,
    now: '2026-05-21T12:00:00.000Z',
  })

  assert.equal(edited.cashback_type, 'black')
  assert.equal(oldSettlement.transaction.card_type_at_transaction, 'bronze')
  assert.equal(oldSettlement.transaction.cashback_percent_used, 3)
  assert.equal(oldSettlement.cashback, 2999)
  assert.equal(newSettlement.transaction.card_type_at_transaction, 'black')
  assert.equal(newSettlement.transaction.cashback_percent_used, 15)
  assert.equal(newSettlement.cashback, 14999)
  assertLoyaltyError(() => editLoyaltyCardRecord({ role: 'admin', card: original, patch: { cashback_type: 'gold' } }), 'forbidden')
})

test('manual balance adjustment is owner-only, reasoned, transactional and never negative', () => {
  const base = card({ balance: 50000, total_earned: 10000, total_redeemed: 2000 })
  const credit = adjustLoyaltyBalance({
    role: 'owner',
    card: base,
    amount: 25000,
    reason: 'Service recovery',
    createdBy: 'owner-1',
    now: '2026-05-20T11:00:00.000Z',
  })

  assert.equal(credit.card.balance, 75000)
  assert.equal(credit.card.total_earned, 35000)
  assert.equal(credit.card.total_redeemed, 2000)
  assert.equal(credit.transaction.type, 'manual_adjustment')
  assert.equal(credit.transaction.amount, 25000)
  assert.equal(credit.transaction.balance_before, 50000)
  assert.equal(credit.transaction.balance_after, 75000)
  assert.equal(credit.transaction.reason, 'Service recovery')
  assert.equal(credit.transaction.created_by, 'owner-1')

  const debit = adjustLoyaltyBalance({ role: 'owner', card: credit.card, amount: -10000, reason: 'Correction' })
  assert.equal(debit.card.balance, 65000)
  assert.equal(debit.card.total_redeemed, 12000)
  assert.equal(debit.transaction.balance_before, 75000)
  assert.equal(debit.transaction.balance_after, 65000)

  for (const role of ['admin', 'cashier', 'waiter', 'kitchen']) {
    assertLoyaltyError(() => adjustLoyaltyBalance({ role, card: base, amount: 1000, reason: 'Nope' }), 'forbidden')
  }
  assertLoyaltyError(() => adjustLoyaltyBalance({ role: 'owner', card: base, amount: 1000, reason: '' }), 'reason_required')
  assertLoyaltyError(() => adjustLoyaltyBalance({ role: 'owner', card: base, amount: -60000, reason: 'Too much' }), 'negative_balance')
  assert.equal(base.balance, 50000)
})

test('loyalty permissions enforce owner mutations and admin read-only behavior', () => {
  assert.equal(canViewLoyaltyCards('owner'), true)
  assert.equal(canViewLoyaltyCards('admin'), true)
  assert.equal(canViewLoyaltyCards('cashier'), true)
  assert.equal(canViewLoyaltyCards('waiter'), false)
  assert.equal(canCreateLoyaltyCard('owner'), true)
  assert.equal(canEditLoyaltyCard('owner'), true)
  assert.equal(canAdjustLoyaltyBalance('owner'), true)
  assert.equal(canDeactivateLoyaltyCard('owner'), true)

  for (const role of ['admin', 'cashier', 'waiter', 'kitchen', 'guest']) {
    assert.equal(canCreateLoyaltyCard(role), false)
    assert.equal(canEditLoyaltyCard(role), false)
    assert.equal(canAdjustLoyaltyBalance(role), false)
    assert.equal(canDeactivateLoyaltyCard(role), false)
  }

  assertLoyaltyError(() => deactivateLoyaltyCardRecord({ role: 'admin', card: card() }), 'forbidden')
  assert.equal(deactivateLoyaltyCardRecord({ role: 'owner', card: card() }).is_active, false)
})

test('cashier loyalty payment validates search, card state, order state, bill cap and balance cap', () => {
  const found = card({ card_number: '00001234', balance: 80000 })
  const remainingOrderAmount = 120000

  assert.equal(found.card_number, '00001234')
  assert.equal(validateLoyaltyPayment({ card: found, amount: 50000, remainingOrderAmount, order: unpaidOrder() }).amount, 50000)
  assert.equal(validateLoyaltyPayment({ card: found, amount: 80000, remainingOrderAmount, order: unpaidOrder() }).amount, 80000)
  assert.equal(validateLoyaltyPayment({ card: found, amount: 80000, remainingOrderAmount: 120000, order: unpaidOrder(), }).maxRedeemAmount, 80000)

  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 80001, remainingOrderAmount, order: unpaidOrder() }), 'exceeds_balance')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 80001, remainingOrderAmount: 80000, order: unpaidOrder() }), 'exceeds_balance')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 60000, remainingOrderAmount: 50000, order: unpaidOrder() }), 'exceeds_bill')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 0, remainingOrderAmount, order: unpaidOrder() }), 'invalid_amount')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: -1, remainingOrderAmount, order: unpaidOrder() }), 'invalid_amount')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 100.5, remainingOrderAmount, order: unpaidOrder() }), 'invalid_amount')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: card({ is_active: false }), amount: 1000, remainingOrderAmount, order: unpaidOrder() }), 'inactive_card')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: null, amount: 1000, remainingOrderAmount, order: unpaidOrder() }), 'card_not_found')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 1000, remainingOrderAmount, order: paidOrder() }), 'order_completed')
  assertLoyaltyError(() => validateLoyaltyPayment({ card: found, amount: 1000, remainingOrderAmount, order: unpaidOrder({ status: 'cancelled' }) }), 'order_cancelled')
})

test('successful loyalty redeem updates balance and history; failed redeem leaves money unchanged', () => {
  const base = card({ balance: 90000, total_redeemed: 5000 })
  const result = redeemLoyaltyBalance({
    card: base,
    amount: 30000,
    remainingOrderAmount: 120000,
    order: unpaidOrder(),
    createdBy: 'cashier-1',
    now: '2026-05-20T13:00:00.000Z',
  })

  assert.equal(result.card.balance, 60000)
  assert.equal(result.card.total_redeemed, 35000)
  assert.equal(result.transaction.type, 'redeemed')
  assert.equal(result.transaction.amount, 30000)
  assert.equal(result.transaction.balance_before, 90000)
  assert.equal(result.transaction.balance_after, 60000)
  assert.equal(result.transaction.created_by, 'cashier-1')
  assertLoyaltyError(() => redeemLoyaltyBalance({ card: base, amount: 100000, remainingOrderAmount: 120000, order: unpaidOrder() }), 'exceeds_balance')
  assert.equal(base.balance, 90000)
})

test('tap-to-fill max loyalty amount uses min(balance, remaining bill) and does not auto-apply payment', () => {
  assert.equal(getMaxLoyaltyRedeemAmount(50000, 180000), 50000)
  assert.equal(getMaxLoyaltyRedeemAmount(120000, 80000), 80000)
  assert.equal(getMaxLoyaltyRedeemAmount(80000, 80000), 80000)
  assert.equal(getMaxLoyaltyRedeemAmount(0, 180000), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(50000, 0), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(-1, -1), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 2), Number.MAX_SAFE_INTEGER - 2)

  const inputState = { value: '' }
  const max = getMaxLoyaltyRedeemAmount(50000, 180000)
  inputState.value = String(max)
  assert.equal(inputState.value, '50000')
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 130000 }], 130000).canConfirmPayment, true)
})

test('cashier split payment validation supports loyalty-reduced totals and rejects under/over payment', () => {
  const rows = [
    item({ id: 'meal', menu_item_id: 'meal', price: 100000 }),
    item({ id: 'water', menu_item_id: 'water', price: 12000, item_type: 'counter', is_counter_item: true }),
  ]
  const summary = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 20000 }, rows, 15)

  assert.equal(summary.total, 107000)
  assert.equal(summary.counterItemsSubtotal, 12000)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 107000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'card', amount: 107000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'terminal', amount: 107000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'qr', amount: 107000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 50000 }, { method: 'card', amount: 57000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'terminal', amount: 50000 }, { method: 'qr', amount: 57000 }], summary.total).canConfirmPayment, true)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 106999 }], summary.total).canConfirmPayment, false)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 107001 }], summary.total).canConfirmPayment, false)
})

test('cashback calculation uses menu items minus loyalty only, floors integer UZS and excludes counter/service/tip', () => {
  const rates = [
    ['bronze', 2999],
    ['silver', 4999],
    ['gold', 6999],
    ['premium', 9999],
    ['black', 14999],
  ]

  for (const [type, expected] of rates) {
    const result = completeOrderCashback({
      card: card({ cashback_type: type, balance: 0, total_earned: 0 }),
      order: paidOrder({ tip_amount: 50000 }),
      items: [
        item({ price: 99999 }),
        item({ id: 'counter', menu_item_id: 'cola', price: 100000, item_type: 'counter', is_counter_item: true }),
      ],
      loyaltyUsedAmount: 0,
    })
    assert.equal(result.cashback, expected)
    assert.equal(result.transaction.cashback_percent_used, getCashbackTypePercent(type))
  }

  assert.equal(completeOrderCashback({
    card: card({ cashback_type: 'black' }),
    order: paidOrder(),
    items: [item({ price: 99999 })],
    loyaltyUsedAmount: 99999,
  }).cashback, 0)
  assert.equal(completeOrderCashback({
    card: card({ cashback_type: 'black' }),
    order: paidOrder(),
    items: [item({ price: 0 })],
    loyaltyUsedAmount: 0,
  }).cashback, 0)
  assertLoyaltyError(() => completeOrderCashback({ card: card(), order: paidOrder(), items: [item()], loyaltyUsedAmount: -1 }), 'invalid_amount')
  assertLoyaltyError(() => completeOrderCashback({ card: card(), order: paidOrder(), items: [item()], loyaltyUsedAmount: 1.5 }), 'invalid_amount')
})

test('premium card completion matches preview and stores transaction snapshots', () => {
  const rows = [item({ id: 'exact-premium', menu_item_id: 'exact-premium', price: 151000 })]
  const premiumCard = card({ cashback_type: undefined, cashbackType: 'premium', balance: 0, total_earned: 0 })
  const preview = getLoyaltyCashbackPreview({
    order: paidOrder({ service_rate_pct: 15 }),
    items: rows,
    loyaltyUsedAmount: 0,
    card: premiumCard,
  })
  const settlement = completeOrderCashback({
    card: premiumCard,
    order: paidOrder({ service_rate_pct: 15 }),
    items: rows,
    loyaltyUsedAmount: 0,
  })

  assert.equal(preview.cashback, 15100)
  assert.equal(settlement.cashback, preview.cashback)
  assert.equal(settlement.transaction.amount, 15100)
  assert.equal(settlement.transaction.cashback_percent_used, 10)
  assert.equal(settlement.transaction.card_type_at_transaction, 'premium')
})

test('order completion creates cashback only after successful paid order and stores order fields', () => {
  assertLoyaltyError(() => completeOrderCashback({ card: card(), order: unpaidOrder(), items: [item()], loyaltyUsedAmount: 0 }), 'order_not_completed')
  assertLoyaltyError(() => completeOrderCashback({ card: card(), order: paidOrder({ status: 'cancelled', payment_status: 'cancelled' }), items: [item()], loyaltyUsedAmount: 0 }), 'order_cancelled')

  const partial = completeOrderCashback({
    card: card({ cashback_type: 'silver', balance: 10000, total_earned: 0 }),
    order: paidOrder(),
    items: [item({ price: 100000 })],
    loyaltyUsedAmount: 25000,
  })

  assert.equal(partial.cashback, 3750)
  assert.equal(partial.card.balance, 13750)
  assert.equal(partial.card.total_earned, 3750)
  assert.equal(partial.order.loyalty_used_amount, 25000)
  assert.equal(partial.order.cashback_earned, 3750)
  assert.equal(partial.order.cashback_percent, 5)
  assert.equal(partial.transaction.type, 'cashback_earned')

  const counterOnly = completeOrderCashback({
    card: card({ cashback_type: 'black' }),
    order: paidOrder(),
    items: [item({ item_type: 'counter', is_counter_item: true })],
    loyaltyUsedAmount: 0,
  })
  assert.equal(counterOnly.cashback, 0)
  assert.equal(counterOnly.transaction, null)
})

test('transaction history is newest first and preserves amount signs, balances, rates and card type snapshots', () => {
  const transactions = [
    { id: 'old', type: 'cashback_earned', amount: 3000, balance_before: 0, balance_after: 3000, cashback_percent_used: 3, card_type_at_transaction: 'bronze', created_at: '2026-05-19T10:00:00.000Z' },
    { id: 'new', type: 'redeemed', amount: 1000, balance_before: 3000, balance_after: 2000, created_at: '2026-05-20T10:00:00.000Z' },
    { id: 'mid', type: 'manual_adjustment', amount: 500, balance_before: 2000, balance_after: 2500, created_at: '2026-05-19T12:00:00.000Z' },
  ]
  const history = getLoyaltyTransactionHistory(transactions)

  assert.deepEqual(history.map(tx => tx.id), ['new', 'mid', 'old'])
  assert.equal(history[0].amount, 1000)
  assert.equal(history[0].balance_before, 3000)
  assert.equal(history[0].balance_after, 2000)
  assert.equal(history[2].cashback_percent_used, 3)
  assert.equal(history[2].card_type_at_transaction, 'bronze')
})

test('customer public loyalty page is read-only and protected by public token', () => {
  const view = getPublicLoyaltyCardView({
    card: card(),
    publicToken: 'public-token-1',
    transactions: [{ id: 'tx-1', created_at: '2026-05-20T10:00:00.000Z' }],
    orders: [{ id: 'order-1', cashback_earned: 5000, loyalty_used_amount: 10000 }],
  })

  assert.equal(view.balance, 50000)
  assert.equal(view.orders[0].cashbackEarned, 5000)
  assert.equal(view.orders[0].loyaltyUsed, 10000)
  assert.equal(view.transactions.length, 1)
  assert.equal(view.canEdit, false)
  assert.equal(view.canAdjust, false)
  assert.equal(view.canDeactivate, false)
  assertLoyaltyError(() => getPublicLoyaltyCardView({ card: card(), publicToken: 'guessed-card-number' }), 'not_found')
})

test('old discount-card regression: loyalty wallet does not apply percent discount or stack with legacy card logic', () => {
  const rows = [item({ price: 100000 })]
  const legacyPercentOnly = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15, loyalty_discount_pct: 50 }, rows, 15)
  const wallet = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 20000, loyalty_discount_pct: 50 }, rows, 15)

  assert.equal(legacyPercentOnly.discountAmount, 0)
  assert.equal(legacyPercentOnly.total, 115000)
  assert.equal(wallet.discountAmount, 20000)
  assert.equal(wallet.loyaltyUsedAmount, 20000)
  assert.equal(wallet.total, 95000)
})

test('counter items update payable total and remaining amount without increasing cashback or service fee', () => {
  const mealOnly = [item({ price: 100000 })]
  const withCounter = [
    item({ price: 100000 }),
    item({ id: 'cola', menu_item_id: 'cola', price: 12000, item_type: 'counter', is_counter_item: true }),
  ]
  const before = getLoyaltyCashbackPreview({ order: paidOrder(), items: mealOnly, loyaltyUsedAmount: 0, cashbackType: 'silver' })
  const after = getLoyaltyCashbackPreview({ order: paidOrder(), items: withCounter, loyaltyUsedAmount: 0, cashbackType: 'silver' })

  assert.equal(before.summary.serviceFee, 15000)
  assert.equal(after.summary.serviceFee, 15000)
  assert.equal(before.cashback, 5000)
  assert.equal(after.cashback, 5000)
  assert.equal(after.summary.total - before.summary.total, 12000)
  assert.equal(getMaxLoyaltyRedeemAmount(200000, after.summary.grossAmount), after.summary.grossAmount)
})

test('fresh card validation handles balance or active-state changes before redeem to prevent stale lookup spend', () => {
  const lookedUp = card({ balance: 100000, is_active: true })
  const freshLowerBalance = { ...lookedUp, balance: 20000 }
  const freshInactive = { ...lookedUp, is_active: false }

  assertLoyaltyError(() => redeemLoyaltyBalance({
    card: freshLowerBalance,
    amount: 50000,
    remainingOrderAmount: 80000,
    order: unpaidOrder(),
  }), 'exceeds_balance')
  assertLoyaltyError(() => redeemLoyaltyBalance({
    card: freshInactive,
    amount: 10000,
    remainingOrderAmount: 80000,
    order: unpaidOrder(),
  }), 'inactive_card')
  assert.equal(lookedUp.balance, 100000)
})
