import test from 'node:test'
import assert from 'node:assert/strict'

import {
  allocateSplitPaymentsToOrders,
  calculateLoyaltyCashback,
  getGroupedOrderItems,
  getOrderPaymentBreakdown,
  getOrderPaymentFields,
  getOrderTotal,
  getOrderPaymentSummary,
  getPaymentMethodSummary,
  getMaxLoyaltyRedeemAmount,
  clampMoneyInput,
  getMaxPaymentAmount,
  getSplitPaymentValidation,
  mergeOrderItemsByIdentity,
  groupOrdersBySession,
  isActiveNeedsBillOrder,
  isPaidOrder,
  normalizeServiceRatePct,
  normalizeSplitPayments,
  removeSentCartItems,
  validateLoyaltyRedeemAmount,
} from '../src/lib/analytics.js'
import { canDeleteTeamMember, canEditTeamMember, defaultPath, isPublicOnlyRole } from '../src/lib/permissions.js'
import { getQuickItemSortOrder, isCashierQuickItem } from '../src/lib/menuItems.js'

const screenshotItems = [
  { id: 'a', menu_item_id: 'lula-en', name: 'Lula kebab', quantity: 1, price: 24000 },
  { id: 'b', menu_item_id: 'cola', name: 'Кока-Кола 0.5L', quantity: 3, price: 12000 },
  { id: 'c', menu_item_id: 'lagman', name: 'Лагман', quantity: 4, price: 32000 },
  { id: 'd', menu_item_id: 'chicken', name: 'Shashlik tovuq', quantity: 1, price: 22000 },
  { id: 'e', menu_item_id: 'chiroqchi', name: 'Chiroqchi', quantity: 1, price: 17000 },
  { id: 'f', menu_item_id: 'lula-ru', name: 'Люля-кебаб', quantity: 3, price: 24000 },
  { id: 'g', menu_item_id: 'lentil', name: 'Чечевица', quantity: 4, price: 25000 },
]

test('signed-in internal roles resolve to workspace routes while guest stays public menu', () => {
  assert.equal(isPublicOnlyRole('guest'), true)
  assert.equal(isPublicOnlyRole('customer'), true)
  assert.equal(isPublicOnlyRole('owner'), false)
  assert.equal(defaultPath('owner'), '/admin')
  assert.equal(defaultPath('admin'), '/admin')
  assert.equal(defaultPath('cashier'), '/cashier/tables')
  assert.equal(defaultPath('waiter'), '/waiter/tables')
  assert.equal(defaultPath('kitchen'), '/pending-approval')
  assert.equal(defaultPath('guest'), '/menu')
})

test('only owner can delete non-protected team profiles and cannot delete self', () => {
  assert.equal(canDeleteTeamMember('owner', 'waiter'), true)
  assert.equal(canDeleteTeamMember('owner', 'cashier'), true)
  assert.equal(canDeleteTeamMember('owner', 'admin'), true)
  assert.equal(canDeleteTeamMember('owner', 'guest'), true)
  assert.equal(canDeleteTeamMember('owner', 'owner'), false)
  assert.equal(canDeleteTeamMember('owner', 'stakeholder'), false)
  assert.equal(canDeleteTeamMember('owner', 'waiter', true), false)
  assert.equal(canDeleteTeamMember('admin', 'waiter'), false)
  assert.equal(canDeleteTeamMember('cashier', 'guest'), false)
})

test('admins cannot change roles or statuses of other admins', () => {
  assert.equal(canEditTeamMember('owner', 'admin'), true)
  assert.equal(canEditTeamMember('admin', 'waiter'), true)
  assert.equal(canEditTeamMember('admin', 'cashier'), true)
  assert.equal(canEditTeamMember('admin', 'guest'), true)
  assert.equal(canEditTeamMember('admin', 'admin'), false)
  assert.equal(canEditTeamMember('admin', 'owner'), false)
  assert.equal(canEditTeamMember('admin', 'stakeholder'), false)
})

test('order subtotal is calculated from item rows, not stale stored subtotal', () => {
  const summary = getOrderPaymentSummary(
    { subtotal: 465000, service_rate_pct: 17 },
    screenshotItems,
    20
  )

  assert.equal(summary.subtotal, 399000)
})

test('service fee uses saved/configured service_rate_pct', () => {
  const summary = getOrderPaymentSummary(
    { service_rate_pct: 17 },
    screenshotItems,
    20
  )

  assert.equal(summary.serviceRatePct, 17)
  assert.equal(summary.serviceFee, 67830)
})

test('service rate normalization preserves zero and clamps invalid settings', () => {
  assert.equal(normalizeServiceRatePct(0), 0)
  assert.equal(normalizeServiceRatePct('0'), 0)
  assert.equal(normalizeServiceRatePct(15), 15)
  assert.equal(normalizeServiceRatePct(150), 100)
  assert.equal(normalizeServiceRatePct(-10), 0)
  assert.equal(normalizeServiceRatePct(null, 15), 15)
  assert.equal(normalizeServiceRatePct(undefined, 15), 15)
  assert.equal(normalizeServiceRatePct('bad', 15), 15)
})

test('money input clamping prevents oversized loyalty and split payment amounts', () => {
  assert.equal(clampMoneyInput('6666666643', getMaxLoyaltyRedeemAmount(70800, 231150)), 70800)
  assert.equal(clampMoneyInput('999999', getMaxLoyaltyRedeemAmount(500000, 231150)), 231150)
  assert.equal(clampMoneyInput('100000', getMaxLoyaltyRedeemAmount(70800, 70800)), 70800)
  assert.equal(clampMoneyInput('10000', getMaxLoyaltyRedeemAmount(0, 231150)), 0)
  assert.equal(clampMoneyInput('10000', getMaxLoyaltyRedeemAmount(70800, 0)), 0)
  assert.equal(clampMoneyInput('-10000', getMaxLoyaltyRedeemAmount(70800, 231150)), 0)
  assert.equal(clampMoneyInput('100.5', getMaxLoyaltyRedeemAmount(70800, 231150)), 0)
  assert.equal(clampMoneyInput('abc', getMaxLoyaltyRedeemAmount(70800, 231150)), 0)
  assert.equal(clampMoneyInput('1e9', getMaxLoyaltyRedeemAmount(70800, 231150)), 0)
  assert.equal(clampMoneyInput('999999999999999999999999999999', getMaxLoyaltyRedeemAmount(70800, 231150)), 70800)

  assert.equal(clampMoneyInput('312312312132', getMaxPaymentAmount(231150)), 231150)
  assert.equal(clampMoneyInput('231150', getMaxPaymentAmount(231150)), 231150)
  assert.equal(clampMoneyInput('150000', getMaxPaymentAmount(231150)), 150000)
  assert.equal(clampMoneyInput('0', getMaxPaymentAmount(231150)), 0)
  assert.equal(clampMoneyInput('-1', getMaxPaymentAmount(231150)), 0)
  assert.equal(clampMoneyInput('10.5', getMaxPaymentAmount(231150)), 0)
  assert.equal(clampMoneyInput('ten', getMaxPaymentAmount(231150)), 0)
})

test('cancelled kitchen items are excluded from service total and cashback', () => {
  const rows = [
    item({ id: 'kept', menu_item_id: 'kebab', price: 100000, quantity: 1, status: 'ready' }),
    item({ id: 'missing', menu_item_id: 'soup', price: 50000, quantity: 1, status: 'cancelled' }),
  ]
  const summary = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15 }, rows, 15)

  assert.equal(summary.subtotal, 100000)
  assert.equal(summary.serviceFee, 15000)
  assert.equal(summary.total, 115000)
  assert.equal(calculateLoyaltyCashback({ status: 'paid', payment_status: 'paid', service_rate_pct: 15 }, rows, 10), 11500)

  const grouped = getGroupedOrderItems(rows)
  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].menu_item_id, 'kebab')
})

test('all-cancelled supplied items produce a zero bill instead of stale stored totals', () => {
  const rows = [
    item({ id: 'missing', menu_item_id: 'beef-shashlik', price: 25000, quantity: 1, status: 'cancelled' }),
  ]
  const summary = getOrderPaymentSummary({ subtotal: 25000, total: 30000, service_rate_pct: 20 }, rows, 20)

  assert.equal(summary.subtotal, 0)
  assert.equal(summary.serviceFee, 0)
  assert.equal(summary.total, 0)
  assert.equal(getGroupedOrderItems(rows).length, 0)
})

test('ready waiter cards and cashier totals ignore stale stored totals when item rows exist', () => {
  const rows = [
    item({ id: 'chicken', menu_item_id: 'chicken', price: 22000, quantity: 1, status: 'ready' }),
    item({ id: 'zar', menu_item_id: 'zar-kebab', price: 80000, quantity: 1, status: 'ready' }),
    item({ id: 'beef', menu_item_id: 'beef', price: 25000, quantity: 1, status: 'ready' }),
    item({ id: 'dolma', menu_item_id: 'dolma', price: 25000, quantity: 1, status: 'ready' }),
    item({ id: 'lula', menu_item_id: 'lula', price: 24000, quantity: 1, status: 'ready' }),
  ]
  const staleOrder = {
    order_type: 'dine_in',
    service_rate_pct: 20,
    subtotal: 777000,
    service_fee: 155400,
    total: 932400,
  }

  const summary = getOrderPaymentSummary(staleOrder, rows, 20)

  assert.equal(summary.subtotal, 176000)
  assert.equal(summary.serviceFee, 35200)
  assert.equal(summary.total, 211200)
  assert.equal(getOrderTotal({ ...staleOrder, items: rows }), 211200)
})

test('sent cart snapshot removal preserves items added while send is pending', () => {
  const cart = [
    item({ id: 'lula-current', menu_item_id: 'lula', quantity: 3, price: 24000 }),
    item({ id: 'cola-current', menu_item_id: 'cola', quantity: 1, price: 12000 }),
  ]
  const sentSnapshot = [
    item({ id: 'lula-sent', menu_item_id: 'lula', quantity: 2, price: 24000 }),
  ]

  assert.deepEqual(removeSentCartItems(cart, sentSnapshot), [
    item({ id: 'lula-current', menu_item_id: 'lula', quantity: 1, price: 24000 }),
    item({ id: 'cola-current', menu_item_id: 'cola', quantity: 1, price: 12000 }),
  ])
})

test('receipt total equals order details total', () => {
  const order = { subtotal: 465000, total: 544800, service_rate_pct: 17 }

  const receiptSummary = getOrderPaymentSummary(order, screenshotItems, 20)
  const orderDetailsSummary = getOrderPaymentSummary(order, screenshotItems, 20)

  assert.equal(receiptSummary.total, 466830)
  assert.equal(receiptSummary.total, orderDetailsSummary.total)
})

test('loyalty discount is applied after subtotal plus service for cashier receipt reports and dashboard', () => {
  const rows = [item({ id: 'loyalty-row', menu_item_id: 'mixed', quantity: 1, price: 214000 })]
  const order = paidOrder({
    id: 'loyalty-5',
    table_id: 'table-10',
    items: rows,
    service_rate_pct: 20,
    loyalty_discount_pct: 5,
  })

  const cashier = pagePaymentSummary(order, 20)
  const receipt = pagePaymentSummary({ ...order, items: getGroupedOrderItems(rows) }, 20)
  const reportsRevenue = paidRevenue([order])
  const dashboardRevenue = paidRevenue(groupOrdersBySession([order]))

  assert.equal(cashier.subtotal, 214000)
  assert.equal(cashier.serviceFee, 42800)
  assert.equal(cashier.grossAmount, 256800)
  assert.equal(cashier.discountAmount, 12840)
  assert.equal(cashier.total, 243960)
  assert.deepEqual(receipt, cashier)
  assert.equal(reportsRevenue, 243960)
  assert.equal(dashboardRevenue, reportsRevenue)
})

test('old loyalty percent fields no longer reduce new order totals', () => {
  const rows = [item({ id: 'combo-row', menu_item_id: 'combo', quantity: 1, price: 100000 })]

  const both = getOrderPaymentSummary({ service_rate_pct: 20, loyalty_discount_pct: 10 }, rows, 20)
  assert.equal(both.serviceFee, 20000)
  assert.equal(both.grossAmount, 120000)
  assert.equal(both.discountAmount, 0)
  assert.equal(both.total, 120000)

  const discountOnly = getOrderPaymentSummary({ service_rate_pct: 0, loyalty_discount_pct: 10 }, rows, 20)
  assert.equal(discountOnly.serviceFee, 0)
  assert.equal(discountOnly.discountAmount, 0)
  assert.equal(discountOnly.total, 100000)

  const serviceOnly = getOrderPaymentSummary({ service_rate_pct: 20 }, rows, 20)
  assert.equal(serviceOnly.serviceFee, 20000)
  assert.equal(serviceOnly.discountAmount, 0)
  assert.equal(serviceOnly.total, 120000)

  const neither = getOrderPaymentSummary({ service_rate_pct: 0 }, rows, 20)
  assert.equal(neither.serviceFee, 0)
  assert.equal(neither.discountAmount, 0)
  assert.equal(neither.total, 100000)
})

test('cashier-entered loyalty redeem amount reduces remaining payable total', () => {
  const rows = [
    item({ id: 'chicken', menu_item_id: 'chicken', quantity: 1, price: 22000 }),
    item({ id: 'beef', menu_item_id: 'beef', quantity: 1, price: 25000 }),
    item({ id: 'lula', menu_item_id: 'lula', quantity: 1, price: 24000 }),
  ]
  const summary = getOrderPaymentSummary(
    { order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 8000 },
    rows,
    15
  )

  assert.equal(summary.menuItemsSubtotal, 71000)
  assert.equal(summary.counterItemsSubtotal, 0)
  assert.equal(summary.subtotal, 71000)
  assert.equal(summary.serviceFeeBase, 71000)
  assert.equal(summary.serviceFee, 10650)
  assert.equal(summary.discountBase, 81650)
  assert.equal(summary.discountAmount, 8000)
  assert.equal(summary.loyaltyUsedAmount, 8000)
  assert.equal(summary.total, 73650)
})

test('dine-in counter items are included in subtotal cashback while excluded from service fee', () => {
  const rows = [
    item({ id: 'chicken', menu_item_id: 'chicken', quantity: 1, price: 22000 }),
    item({ id: 'beef', menu_item_id: 'beef', quantity: 1, price: 25000 }),
    item({ id: 'lula', menu_item_id: 'lula', quantity: 1, price: 24000 }),
    item({ id: 'water', menu_item_id: 'water', quantity: 3, price: 5000, item_type: 'counter', is_counter_item: true }),
  ]
  const summary = getOrderPaymentSummary(
    { order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 8000 },
    rows,
    15
  )

  assert.equal(summary.menuItemsSubtotal, 71000)
  assert.equal(summary.counterItemsSubtotal, 15000)
  assert.equal(summary.subtotal, 86000)
  assert.equal(summary.serviceFee, 10650)
  assert.equal(summary.discountBase, 81650)
  assert.equal(summary.discountAmount, 8000)
  assert.equal(summary.total, 88650)
  assert.equal(calculateLoyaltyCashback(
    { status: 'paid', payment_status: 'paid', service_rate_pct: 15, loyalty_used_amount: 8000 },
    rows,
    10
  ), 8865)
})

test('take-away loyalty wallet redemption has no service fee', () => {
  const rows = [
    item({ id: 'meal', menu_item_id: 'meal', quantity: 1, price: 71000 }),
    item({ id: 'counter', menu_item_id: 'counter', quantity: 1, price: 15000, item_type: 'counter', is_counter_item: true }),
  ]
  const summary = getOrderPaymentSummary(
    { order_type: 'take_away', service_rate_pct: 15, loyalty_used_amount: 7000 },
    rows,
    15
  )

  assert.equal(summary.serviceRatePct, 0)
  assert.equal(summary.serviceFee, 0)
  assert.equal(summary.discountBase, 71000)
  assert.equal(summary.discountAmount, 7000)
  assert.equal(summary.total, 79000)
})

test('counter-only order has no service fee and no loyalty discount', () => {
  const rows = [
    item({ id: 'counter-only', menu_item_id: 'water', quantity: 4, price: 5000, item_type: 'counter', is_counter_item: true }),
  ]
  const summary = getOrderPaymentSummary(
    { order_type: 'dine_in', service_rate_pct: 15, loyalty_discount_pct: 10 },
    rows,
    15
  )

  assert.equal(summary.menuItemsSubtotal, 0)
  assert.equal(summary.counterItemsSubtotal, 20000)
  assert.equal(summary.subtotal, 20000)
  assert.equal(summary.serviceFee, 0)
  assert.equal(summary.discountAmount, 0)
  assert.equal(summary.total, 20000)
})

test('cashback uses integer UZS from subtotal plus service minus loyalty used', () => {
  const rows = [item({ id: 'rounding', menu_item_id: 'rounding', quantity: 1, price: 33333 })]
  const summary = getOrderPaymentSummary(
    { order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 3333 },
    rows,
    15
  )

  assert.equal(summary.serviceFee, 5000)
  assert.equal(summary.discountBase, 38333)
  assert.equal(summary.discountAmount, 3333)
  assert.equal(summary.total, 35000)
  assert.equal(calculateLoyaltyCashback(
    { order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 3333, status: 'paid', payment_status: 'paid' },
    rows,
    10
  ), 3500)
})

test('cashback reward base is subtotal plus service fee from the cashier total block', () => {
  const rows = [
    item({ id: 'menu-a', menu_item_id: 'menu-a', quantity: 1, price: 176000 }),
  ]
  const summary = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 20 }, rows, 20)

  assert.equal(summary.subtotal, 176000)
  assert.equal(summary.serviceFee, 35200)
  assert.equal(summary.grossAmount, 211200)
  assert.equal(calculateLoyaltyCashback(
    { order_type: 'dine_in', service_rate_pct: 20, status: 'paid', payment_status: 'paid' },
    rows,
    10
  ), 21120)
})

test('cashback settlement uses fresh cashier items when database relation fetch is stale', () => {
  const staleDbItems = [
    item({ id: 'lula', menu_item_id: 'lula', quantity: 1, price: 24000 }),
    item({ id: 'chicken', menu_item_id: 'chicken', quantity: 1, price: 22000 }),
    item({ id: 'beef', menu_item_id: 'beef', quantity: 1, price: 25000 }),
    item({ id: 'orbit', menu_item_id: 'orbit', quantity: 1, price: 8000, item_type: 'counter', is_counter_item: true }),
  ]
  const freshCashierItems = [
    ...staleDbItems,
    item({ id: 'zar-kebab', menu_item_id: 'zar-kebab', quantity: 1, price: 80000 }),
  ]
  const mergedItems = mergeOrderItemsByIdentity(staleDbItems, freshCashierItems)
  const order = {
    order_type: 'take_away',
    status: 'paid',
    payment_status: 'paid',
    loyalty_used_amount: 25100,
  }

  const summary = getOrderPaymentSummary(order, mergedItems, 0)

  assert.equal(summary.subtotal, 159000)
  assert.equal(summary.menuItemsSubtotal, 151000)
  assert.equal(calculateLoyaltyCashback(order, mergedItems, 10), 13390)
  assert.notEqual(calculateLoyaltyCashback(order, mergedItems, 10), 4590)
})

test('payment validation follows the helper total after loyalty wallet redemption', () => {
  const rows = [item({ id: 'validation-row', menu_item_id: 'combo', quantity: 1, price: 71000 })]
  const withoutDiscount = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15, loyalty_discount_pct: 0 }, rows, 15)
  const withDiscount = getOrderPaymentSummary({ order_type: 'dine_in', service_rate_pct: 15, loyalty_used_amount: 8000 }, rows, 15)

  assert.equal(withoutDiscount.total, 81650)
  assert.equal(withDiscount.total, 73650)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 81650 }], withDiscount.total).canConfirmPayment, false)
  assert.equal(getSplitPaymentValidation([{ method: 'cash', amount: 73650 }], withDiscount.total).canConfirmPayment, true)
  assert.deepEqual(validateLoyaltyRedeemAmount(8000, 10000, 81650), { ok: true, amount: 8000 })
  assert.equal(validateLoyaltyRedeemAmount(12000, 10000, 81650).reason, 'balance')
  assert.equal(validateLoyaltyRedeemAmount(90000, 100000, 81650).reason, 'bill')
})

test('maximum loyalty redeem amount is capped by balance and remaining order total', () => {
  assert.equal(getMaxLoyaltyRedeemAmount(50000, 180000), 50000)
  assert.equal(getMaxLoyaltyRedeemAmount(120000, 80000), 80000)
  assert.equal(getMaxLoyaltyRedeemAmount(80000, 80000), 80000)
  assert.equal(getMaxLoyaltyRedeemAmount(0, 180000), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(50000, 0), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(-50000, 180000), 0)
  assert.equal(getMaxLoyaltyRedeemAmount(9007199254740991, 9007199254740000), 9007199254740000)
})

test('split payment can settle one order with cash card loyalty and qr methods', () => {
  const rows = [item({ id: 'split-row', menu_item_id: 'table-bill', quantity: 1, price: 214000 })]
  const order = paidOrder({
    id: 'split-payment-order',
    table_id: 'table-8',
    items: rows,
    service_rate_pct: 20,
    loyalty_discount_pct: 5,
  })
  const summary = getOrderPaymentSummary(order, rows, 20)
  const payments = normalizeSplitPayments([
    { method: 'cash', amount: 50000 },
    { method: 'card', amount: 100000 },
    { method: 'loyalty_card', amount: 40000 },
    { method: 'qr', amount: 53960 },
  ], summary.total)
  const paid = payments.reduce((sum, row) => sum + row.amount, 0)
  const paymentOrder = { ...order, payments, payment_method: getPaymentMethodSummary(payments) }

  assert.equal(summary.subtotal, 214000)
  assert.equal(summary.serviceFee, 42800)
  assert.equal(summary.discountAmount, 12840)
  assert.equal(summary.total, 243960)
  assert.equal(paid, summary.total)
  assert.equal(paymentOrder.payment_method, 'mixed')
  assert.deepEqual(getOrderPaymentBreakdown(paymentOrder), payments)
  assert.equal(paidRevenue([paymentOrder]), summary.total)
})

test('cashier validation rejects overpayment instead of treating it as fully paid', () => {
  const validation = getSplitPaymentValidation([
    { method: 'cash', amount: 81650 },
  ], 65320)

  assert.equal(validation.paidAmount, 81650)
  assert.equal(validation.remainingAmount, 0)
  assert.equal(validation.overpaidAmount, 16330)
  assert.equal(validation.isOverpaid, true)
  assert.equal(validation.isFullyPaid, false)
  assert.equal(validation.canConfirmPayment, false)
})

test('cashier payment row quick amount is capped by remaining total', () => {
  const total = 976120
  const existingRows = [
    { id: 'cash', amount: 300000 },
    { id: 'card', amount: 100000 },
  ]
  const otherPaid = existingRows.reduce((sum, row) => (
    row.id === 'cash' ? sum : sum + row.amount
  ), 0)
  const maxForCashRow = Math.max(0, total - otherPaid)
  const requestedCashAmount = 3312314
  const clampedCashAmount = Math.min(Math.max(0, requestedCashAmount), maxForCashRow)

  assert.equal(maxForCashRow, 876120)
  assert.equal(clampedCashAmount, 876120)
  assert.equal(clampedCashAmount + otherPaid, total)
})

test('split payment confirm is enabled only when paid amount exactly matches total', () => {
  const underpaid = getSplitPaymentValidation([
    { method: 'cash', amount: 40000 },
    { method: 'card', amount: 20000 },
  ], 65320)
  const exact = getSplitPaymentValidation([
    { method: 'cash', amount: 40000 },
    { method: 'card', amount: 25320 },
  ], 65320)
  const overpaid = getSplitPaymentValidation([
    { method: 'cash', amount: 40000 },
    { method: 'card', amount: 30000 },
  ], 65320)

  assert.equal(underpaid.canConfirmPayment, false)
  assert.equal(underpaid.remainingAmount, 5320)
  assert.equal(exact.isFullyPaid, true)
  assert.equal(exact.canConfirmPayment, true)
  assert.equal(overpaid.canConfirmPayment, false)
  assert.equal(overpaid.overpaidAmount, 4680)
})

test('single payment keeps its original method for legacy reports and badges', () => {
  const payments = normalizeSplitPayments([{ method: 'qr_code', amount: 58500 }], 58500)

  assert.equal(getPaymentMethodSummary(payments), 'qr')
  assert.deepEqual(payments, [{ method: 'qr', amount: 58500 }])
})

test('unpaid bills do not invent a payment breakdown before checkout', () => {
  const order = activeOrder({
    id: 'unpaid-bill',
    table_id: 'table-8',
    payment_method: null,
    items: [item({ id: 'u1', menu_item_id: 'kebab', quantity: 1, price: 25000 })],
  })

  assert.deepEqual(getOrderPaymentBreakdown(order), [])
})

test('split payment allocation covers multiple unpaid rounds without double-counting', () => {
  const orderRounds = [
    { id: 'round-1', total: 80000 },
    { id: 'round-2', total: 50000 },
    { id: 'round-3', total: 30000 },
  ]
  const payments = normalizeSplitPayments([
    { method: 'cash', amount: 70000 },
    { method: 'card', amount: 60000 },
    { method: 'loyalty_card', amount: 30000 },
  ], 160000)

  const allocations = allocateSplitPaymentsToOrders(orderRounds, payments)

  assert.deepEqual(allocations, [
    { order_id: 'round-1', method: 'cash', amount: 70000 },
    { order_id: 'round-1', method: 'card', amount: 10000 },
    { order_id: 'round-2', method: 'card', amount: 50000 },
    { order_id: 'round-3', method: 'loyalty_card', amount: 30000 },
  ])
  assert.equal(allocations.reduce((sum, row) => sum + row.amount, 0), 160000)
})

test('grouped paid session keeps split payment breakdown equal to final revenue', () => {
  const orderA = paidOrder({
    id: 'split-session-a',
    table_id: 'table-10',
    paid_at: '2026-05-16T18:22:00.000Z',
    items: [item({ id: 'a1', menu_item_id: 'kebab', quantity: 2, price: 25000 })],
    payments: [
      { method: 'cash', amount: 50000 },
      { method: 'card', amount: 8500 },
    ],
    payment_method: 'mixed',
  })
  const orderB = paidOrder({
    id: 'split-session-b',
    table_id: 'table-10',
    paid_at: '2026-05-16T18:22:30.000Z',
    items: [item({ id: 'b1', menu_item_id: 'cola', quantity: 2, price: 12000 })],
    payments: [
      { method: 'card', amount: 19580 },
      { method: 'loyalty_card', amount: 8500 },
    ],
    payment_method: 'mixed',
  })

  const [session] = groupOrdersBySession([orderA, orderB])
  const breakdown = getOrderPaymentBreakdown(session)
  const paidByMethod = breakdown.reduce((sum, row) => sum + row.amount, 0)

  assert.equal(groupOrdersBySession([orderA, orderB]).length, 1)
  assert.equal(paidByMethod, getOrderTotal(session))
  assert.equal(paidByMethod, paidRevenue([session]))
  assert.deepEqual(breakdown, [
    { method: 'cash', amount: 50000 },
    { method: 'card', amount: 28080 },
    { method: 'loyalty_card', amount: 8500 },
  ])
})

test('dashboard needs bill ignores paid or stale orders whose table is no longer waiting for bill', () => {
  const tables = [
    { id: 'table-6', status: 'available' },
    { id: 'table-8', status: 'needs_bill' },
  ]
  const stale = activeOrder({
    id: 'stale-needs-bill',
    table_id: 'table-6',
    status: 'needs_bill',
    items: [item({ id: 'stale-item', menu_item_id: 'kebab', quantity: 1, price: 25000 })],
  })
  const paidButOldStatus = paidOrder({
    id: 'paid-old-status',
    table_id: 'table-8',
    status: 'needs_bill',
    items: [item({ id: 'paid-item', menu_item_id: 'cola', quantity: 1, price: 12000 })],
  })
  const realNeedsBill = activeOrder({
    id: 'real-needs-bill',
    table_id: 'table-8',
    status: 'needs_bill',
    items: [item({ id: 'real-item', menu_item_id: 'lagman', quantity: 1, price: 32000 })],
  })

  assert.equal(isActiveNeedsBillOrder(stale, tables), false)
  assert.equal(isActiveNeedsBillOrder(paidButOldStatus, tables), false)
  assert.equal(isActiveNeedsBillOrder(realNeedsBill, tables), true)
})

test('database write fields are generated from the shared payment summary', () => {
  const rows = [
    item({ id: 'write-a', menu_item_id: 'kebab', quantity: 2, price: 25000 }),
    item({ id: 'write-b', menu_item_id: 'cola', quantity: 3, price: 12000 }),
  ]

  const summary = getOrderPaymentSummary(
    { service_rate_pct: 17, loyalty_discount_pct: 5 },
    rows,
    20
  )
  const fields = getOrderPaymentFields(
    { service_rate_pct: 17, loyalty_discount_pct: 5 },
    rows,
    20
  )

  assert.deepEqual(fields, {
    subtotal: summary.subtotal,
    service_fee: summary.serviceFee,
    service_rate_pct: summary.serviceRatePct,
    total: summary.total,
  })
})

test('repeated table additions use write fields that match receipt and reports totals', () => {
  const firstRound = [
    item({ id: 'wf-1', menu_item_id: 'lula', quantity: 1, price: 24000 }),
    item({ id: 'wf-2', menu_item_id: 'cola', quantity: 3, price: 12000 }),
  ]
  const secondRound = [
    item({ id: 'wf-3', menu_item_id: 'lagman', quantity: 4, price: 32000 }),
    item({ id: 'wf-4', menu_item_id: 'lula', quantity: 2, price: 24000 }),
  ]
  const allItems = [...firstRound, ...secondRound]
  const orderForWrite = { service_rate_pct: 17, loyalty_used_amount: 12000 }
  const written = getOrderPaymentFields(orderForWrite, allItems, 20)
  const storedOrder = paidOrder({
    id: 'write-rounds',
    table_id: 'table-10',
    items: allItems,
    ...written,
    service_rate_pct: written.service_rate_pct,
    loyalty_used_amount: written.loyalty_used_amount,
    loyalty_discount_amount: written.loyalty_discount_amount,
  })

  const receiptSummary = getOrderPaymentSummary(storedOrder, getGroupedOrderItems(allItems), 20)
  const reportsRevenue = paidRevenue([storedOrder])

  assert.equal(written.subtotal, 236000)
  assert.equal(written.service_fee, 40120)
  assert.equal(written.total, 264120)
  assert.equal(receiptSummary.total, written.total)
  assert.equal(reportsRevenue, written.total)
})

test('cashier counter items are real order items and immediately change totals and remaining payment', () => {
  const beforeItems = [
    item({ id: 'meal-1', menu_item_id: 'kebab', quantity: 1, price: 81650 }),
  ]
  const paidBeforeCounterItem = 81650
  const before = getOrderPaymentSummary({ service_rate_pct: 0 }, beforeItems, 0)
  assert.equal(before.total, 81650)

  const afterItems = [
    ...beforeItems,
    item({ id: 'counter-cola', menu_item_id: 'coca-cola', name: 'Coca-Cola', quantity: 1, price: 12000, status: 'served', item_type: 'counter', is_counter_item: true }),
  ]
  const after = getOrderPaymentSummary({ service_rate_pct: 0 }, afterItems, 0)
  const validation = getSplitPaymentValidation([{ method: 'cash', amount: paidBeforeCounterItem }], after.total)
  const groupedForReceipt = getGroupedOrderItems(afterItems)

  assert.equal(after.total, 93650)
  assert.equal(validation.canConfirmPayment, false)
  assert.equal(validation.remainingAmount, 12000)
  assert.equal(groupedForReceipt.some(row => row.menu_item_id === 'coca-cola' && row.quantity === 1), true)
})

test('cashier quick items are explicit menu items with independent cashier ordering', () => {
  const menuItems = [
    { id: 'kebab', name_en: 'Kebab', show_in_cashier_quick_items: false, sort_order: 1 },
    { id: 'cola', name_en: 'Coca-Cola', show_in_cashier_quick_items: true, quick_item_sort_order: 2, sort_order: 10 },
    { id: 'orbit', name_en: 'Orbit', show_in_cashier_quick_items: true, quick_item_sort_order: 1, sort_order: 20 },
  ]
  const quickItems = menuItems
    .filter(isCashierQuickItem)
    .sort((a, b) => getQuickItemSortOrder(a) - getQuickItemSortOrder(b))

  assert.deepEqual(quickItems.map(item => item.id), ['orbit', 'cola'])
  assert.equal(isCashierQuickItem({ id: 'legacy', isCounterItem: true }), true)
  assert.equal(isCashierQuickItem({ id: 'plain-cola-by-name-only', name_en: 'Coca-Cola' }), false)
})

test('items with different menu_item_id but similar localized names are not merged', () => {
  const items = [
    { id: '1', menu_item_id: 'lula-en', name: 'Lula kebab', quantity: 1, price: 24000 },
    { id: '2', menu_item_id: 'lula-ru', name: 'Люля-кебаб', quantity: 3, price: 24000 },
  ]

  const grouped = getGroupedOrderItems(items)

  assert.equal(grouped.length, 2)
  assert.deepEqual(grouped.map(item => item.quantity), [1, 3])
})

test('items with same menu_item_id but different modifiers/options are not merged', () => {
  const items = [
    { id: '1', menu_item_id: 'kebab', name: 'Kebab', quantity: 1, price: 24000, modifiers: [{ id: 'spicy' }] },
    { id: '2', menu_item_id: 'kebab', name: 'Kebab', quantity: 1, price: 24000, modifiers: [{ id: 'no-onion' }] },
  ]

  const grouped = getGroupedOrderItems(items)

  assert.equal(grouped.length, 2)
})

test('items with same menu_item_id and same modifiers/options are merged correctly', () => {
  const items = [
    { id: '1', menu_item_id: 'kebab', name: 'Kebab', quantity: 1, price: 24000, modifiers: [{ id: 'spicy' }] },
    { id: '2', menu_item_id: 'kebab', name: 'Kebab', quantity: 3, price: 24000, modifiers: [{ id: 'spicy' }] },
  ]

  const grouped = getGroupedOrderItems(items)

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].quantity, 4)
})

test('grouped cashier rows preserve source ids so minus can update duplicate counter rows', () => {
  const items = [
    item({ id: 'counter-a', menu_item_id: 'water', quantity: 1, price: 5000, item_type: 'counter', is_counter_item: true }),
    item({ id: 'counter-b', menu_item_id: 'water', quantity: 2, price: 5000, item_type: 'counter', is_counter_item: true }),
  ]
  const grouped = getGroupedOrderItems(items)
  const nextQty = grouped[0].quantity - 1
  const sourceIds = new Set(grouped[0].source_item_ids)
  const collapsedAfterMinus = items.flatMap(row => {
    if (!sourceIds.has(row.id)) return [row]
    if (row.id !== grouped[0].id) return []
    return [{ ...row, quantity: nextQty }]
  })
  const summary = getOrderPaymentSummary({ service_rate_pct: 15, loyalty_discount_pct: 10 }, collapsedAfterMinus, 15)

  assert.deepEqual(grouped[0].source_item_ids, ['counter-a', 'counter-b'])
  assert.equal(grouped[0].quantity, 3)
  assert.equal(collapsedAfterMinus.length, 1)
  assert.equal(collapsedAfterMinus[0].quantity, 2)
  assert.equal(summary.counterItemsSubtotal, 10000)
  assert.equal(summary.total, 10000)
})

function item(overrides) {
  return {
    id: overrides.id || `item-${Math.random()}`,
    menu_item_id: overrides.menu_item_id,
    name: overrides.name || overrides.menu_item_id,
    quantity: overrides.quantity ?? 1,
    price: overrides.price ?? 0,
    status: overrides.status || 'new',
    ...overrides,
  }
}

function paidOrder(overrides) {
  const items = overrides.items || []
  const serviceRatePct = overrides.service_rate_pct ?? 17
  const summary = getOrderPaymentSummary({
    order_type: overrides.order_type,
    service_rate_pct: serviceRatePct,
    loyalty_discount_pct: overrides.loyalty_discount_pct,
    discount_percent: overrides.discount_percent,
    loyalty_discount_amount: overrides.loyalty_discount_amount,
    loyalty_used_amount: overrides.loyalty_used_amount,
    loyalty_redeem_amount: overrides.loyalty_redeem_amount,
    cashback_earned: overrides.cashback_earned,
    discount_amount: overrides.discount_amount,
  }, items, serviceRatePct)
  return {
    id: overrides.id,
    table_id: overrides.table_id,
    table_name: overrides.table_name,
    created_at: overrides.created_at || '2026-05-16T10:00:00.000Z',
    paid_at: overrides.paid_at || overrides.created_at || '2026-05-16T10:30:00.000Z',
    payment_status: overrides.payment_status || 'paid',
    status: overrides.status || 'paid',
    items,
    subtotal: overrides.subtotal ?? summary.subtotal,
    service_fee: overrides.service_fee ?? summary.serviceFee,
    service_rate_pct: summary.serviceRatePct,
    loyalty_discount_pct: overrides.loyalty_discount_pct,
    loyalty_discount_amount: overrides.loyalty_discount_amount ?? summary.discountAmount,
    loyalty_used_amount: overrides.loyalty_used_amount,
    loyalty_redeem_amount: overrides.loyalty_redeem_amount,
    cashback_earned: overrides.cashback_earned,
    total: overrides.total ?? summary.total,
    ...overrides,
  }
}

function activeOrder(overrides) {
  const items = overrides.items || []
  const serviceRatePct = overrides.service_rate_pct ?? 17
  const summary = getOrderPaymentSummary({ order_type: overrides.order_type, service_rate_pct: serviceRatePct }, items, serviceRatePct)
  return {
    id: overrides.id,
    table_id: overrides.table_id,
    table_name: overrides.table_name,
    created_at: overrides.created_at || '2026-05-16T10:00:00.000Z',
    payment_status: overrides.payment_status || 'unpaid',
    status: overrides.status || 'sent_to_kitchen',
    items,
    subtotal: overrides.subtotal ?? summary.subtotal,
    service_fee: overrides.service_fee ?? summary.serviceFee,
    service_rate_pct: summary.serviceRatePct,
    total: overrides.total ?? summary.total,
    ...overrides,
  }
}

function paidRevenue(orders) {
  return orders.filter(isPaidOrder).reduce((sum, order) => sum + getOrderTotal(order), 0)
}

function pagePaymentSummary(order, fallbackServicePct = 20) {
  return getOrderPaymentSummary(order, getOrderItemsForTest(order), fallbackServicePct)
}

function getOrderItemsForTest(order) {
  return order.items || order.order_items || []
}

test('same table multiple order rounds include all additions and merge repeated plain items', () => {
  const rounds = [
    activeOrder({
      id: 'round-1',
      table_id: 'table-10',
      items: [
        item({ id: 'r1-a', menu_item_id: 'lula', name: 'Lula kebab', quantity: 1, price: 24000 }),
        item({ id: 'r1-b', menu_item_id: 'cola', name: 'Cola', quantity: 3, price: 12000 }),
      ],
    }),
    activeOrder({
      id: 'round-2',
      table_id: 'table-10',
      items: [item({ id: 'r2-a', menu_item_id: 'lagman', name: 'Lagman', quantity: 1, price: 32000 })],
    }),
    activeOrder({
      id: 'round-3',
      table_id: 'table-10',
      items: [item({ id: 'r3-a', menu_item_id: 'lula', name: 'Lula kebab', quantity: 2, price: 24000 })],
    }),
  ]
  const allItems = rounds.flatMap(order => order.items)
  const grouped = getGroupedOrderItems(allItems)
  const summary = getOrderPaymentSummary({ service_rate_pct: 17 }, allItems, 17)

  assert.equal(grouped.find(row => row.menu_item_id === 'lula').quantity, 3)
  assert.equal(summary.subtotal, 140000)
  assert.equal(summary.total, 163800)
})

test('same table ordering the same item over three rounds totals quantity and amount correctly', () => {
  const allItems = [
    item({ id: 'r1', menu_item_id: 'lula', quantity: 1, price: 24000 }),
    item({ id: 'r2', menu_item_id: 'lula', quantity: 2, price: 24000 }),
    item({ id: 'r3', menu_item_id: 'lula', quantity: 1, price: 24000 }),
  ]
  const grouped = getGroupedOrderItems(allItems)
  const summary = getOrderPaymentSummary({ subtotal: 24000, service_rate_pct: 17 }, allItems, 17)

  assert.equal(grouped.length, 1)
  assert.equal(grouped[0].quantity, 4)
  assert.equal(summary.subtotal, 96000)
  assert.equal(summary.total, 112320)
})

test('same table different items over several rounds have one consistent subtotal for details receipt and reports', () => {
  const allItems = [
    item({ id: 'shashlik', menu_item_id: 'shashlik', quantity: 2, price: 25000 }),
    item({ id: 'cola', menu_item_id: 'cola', quantity: 3, price: 12000 }),
    item({ id: 'lagman', menu_item_id: 'lagman', quantity: 1, price: 32000 }),
  ]
  const order = paidOrder({ id: 'paid-mixed', table_id: 'table-10', items: allItems, service_rate_pct: 17, subtotal: 1 })
  const details = getOrderPaymentSummary(order, allItems, 17)
  const receipt = getOrderPaymentSummary(order, getGroupedOrderItems(allItems), 17)

  assert.equal(details.subtotal, 118000)
  assert.equal(receipt.total, details.total)
  assert.equal(getOrderTotal(order, 17), details.total)
})

test('dine-in and takeaway mixed flow keeps sections distinct and totals include both', () => {
  const allItems = [
    item({ id: 'd1', menu_item_id: 'lula', quantity: 1, price: 24000, order_type: 'dine_in' }),
    item({ id: 't1', menu_item_id: 'chiroqchi', quantity: 1, price: 17000, order_type: 'take_away' }),
    item({ id: 'd2', menu_item_id: 'lagman', quantity: 4, price: 32000, order_type: 'dine_in' }),
  ]
  const dineIn = allItems.filter(row => row.order_type === 'dine_in')
  const takeAway = allItems.filter(row => row.order_type === 'take_away')
  const summary = getOrderPaymentSummary({ service_rate_pct: 17 }, allItems, 17)

  assert.equal(dineIn.length, 2)
  assert.equal(takeAway.length, 1)
  assert.equal(summary.subtotal, 169000)
  assert.equal(summary.total, 197730)
})

test('same table separate paid visits remain separate sessions and both count once in reports', () => {
  const orderA = paidOrder({
    id: 'order-a',
    table_id: 'table-10',
    paid_at: '2026-05-16T12:00:00.000Z',
    items: [item({ id: 'a1', menu_item_id: 'lula', quantity: 1, price: 24000 })],
  })
  const orderB = paidOrder({
    id: 'order-b',
    table_id: 'table-10',
    paid_at: '2026-05-16T15:30:00.000Z',
    items: [item({ id: 'b1', menu_item_id: 'lagman', quantity: 1, price: 32000 })],
  })
  const sessions = groupOrdersBySession([orderA, orderB])

  assert.equal(sessions.length, 2)
  assert.equal(paidRevenue(sessions), getOrderTotal(orderA) + getOrderTotal(orderB))
})

test('partial additions before payment include all final items without duplicating stale old items', () => {
  const firstSent = [item({ id: 'sent-1', menu_item_id: 'kebab', quantity: 2, price: 25000 })]
  const laterSent = [item({ id: 'sent-2', menu_item_id: 'cola', quantity: 2, price: 12000 })]
  const finalItems = [...firstSent, ...laterSent]
  const summary = getOrderPaymentSummary({ service_rate_pct: 17 }, finalItems, 17)

  assert.equal(getGroupedOrderItems(finalItems).length, 2)
  assert.equal(summary.subtotal, 74000)
  assert.equal(summary.total, 86580)
})

test('takeaway-only paid order without a table calculates and reports revenue correctly', () => {
  const order = paidOrder({
    id: 'takeaway-only',
    order_number: 'TA-1001',
    order_type: 'take_away',
    table_id: null,
    table_name: 'Take Away',
    items: [item({ id: 't1', menu_item_id: 'shashlik', quantity: 2, price: 25000, order_type: 'take_away' })],
  })

  assert.equal(getOrderPaymentSummary(order, order.items, 17).subtotal, 50000)
  assert.equal(getOrderPaymentSummary(order, order.items, 17).serviceFee, 0)
  assert.equal(paidRevenue([order]), 50000)
  assert.equal(order.table_id, null)
})

test('take-away order service fee is always zero even when restaurant service is configured', () => {
  const rows = [item({ id: 'ta-row', menu_item_id: 'lula', quantity: 3, price: 24000 })]
  const summary = getOrderPaymentSummary(
    { order_type: 'take_away', service_rate_pct: 20 },
    rows,
    20
  )

  assert.equal(summary.subtotal, 72000)
  assert.equal(summary.serviceRatePct, 0)
  assert.equal(summary.serviceFee, 0)
  assert.equal(summary.total, 72000)
})

test('dine-in order still requires table context and calculates configured service', () => {
  const order = paidOrder({
    id: 'dine-requires-table',
    order_type: 'dine_in',
    table_id: 'table-8',
    service_rate_pct: 15,
    items: [item({ id: 'dine-row', menu_item_id: 'lagman', quantity: 2, price: 32000 })],
  })
  const summary = getOrderPaymentSummary(order, order.items, 20)

  assert.equal(Boolean(order.table_id), true)
  assert.equal(summary.serviceRatePct, 15)
  assert.equal(summary.serviceFee, 9600)
  assert.equal(summary.total, 73600)
})

test('take-away orders with null table_id stay separate in cashier reports sessions', () => {
  const orderA = paidOrder({
    id: 'ta-a',
    order_number: 'TA-1001',
    order_type: 'take_away',
    table_id: null,
    paid_at: '2026-05-16T12:00:00.000Z',
    items: [item({ id: 'ta-a-item', menu_item_id: 'cola', quantity: 2, price: 12000 })],
  })
  const orderB = paidOrder({
    id: 'ta-b',
    order_number: 'TA-1002',
    order_type: 'take_away',
    table_id: null,
    paid_at: '2026-05-16T12:05:00.000Z',
    items: [item({ id: 'ta-b-item', menu_item_id: 'bread', quantity: 1, price: 8000 })],
  })
  const sessions = groupOrdersBySession([orderA, orderB])

  assert.equal(sessions.length, 2)
  assert.equal(paidRevenue(sessions), 32000)
})

test('dine-in-only order shows table context and calculates correct total', () => {
  const order = paidOrder({
    id: 'dine-only',
    table_id: 'table-10',
    table_name: 'Table 10',
    items: [item({ id: 'd1', menu_item_id: 'lagman', quantity: 2, price: 32000, order_type: 'dine_in' })],
  })

  assert.equal(order.table_name, 'Table 10')
  assert.equal(getOrderTotal(order), 74880)
})

test('same product with different order type is not merged when order type must remain visible', () => {
  const rows = [
    item({ id: 'd1', menu_item_id: 'lula', quantity: 1, price: 24000, order_type: 'dine_in' }),
    item({ id: 't1', menu_item_id: 'lula', quantity: 2, price: 24000, order_type: 'take_away' }),
  ]
  const grouped = getGroupedOrderItems(rows)
  const summary = getOrderPaymentSummary({ service_rate_pct: 17 }, rows, 17)

  assert.equal(grouped.length, 2)
  assert.equal(summary.subtotal, 72000)
})

test('same product with different notes stays separate while identical notes merge', () => {
  const rows = [
    item({ id: 's1', menu_item_id: 'kebab', quantity: 1, price: 25000, notes: 'spicy' }),
    item({ id: 'n1', menu_item_id: 'kebab', quantity: 1, price: 25000, notes: 'no onion' }),
    item({ id: 's2', menu_item_id: 'kebab', quantity: 2, price: 25000, notes: 'spicy' }),
  ]
  const grouped = getGroupedOrderItems(rows)

  assert.equal(grouped.length, 2)
  assert.equal(grouped.find(row => row.notes === 'spicy').quantity, 3)
  assert.equal(grouped.find(row => row.notes === 'no onion').quantity, 1)
})

test('removed items before payment are excluded from final quantity subtotal and reports', () => {
  const finalItems = [item({ id: 'kebab-final', menu_item_id: 'kebab', quantity: 2, price: 25000 })]
  const order = paidOrder({ id: 'removed-before-pay', table_id: 'table-10', items: finalItems, service_rate_pct: 17 })

  assert.equal(getGroupedOrderItems(finalItems)[0].quantity, 2)
  assert.equal(getOrderPaymentSummary(order, finalItems, 17).subtotal, 50000)
  assert.equal(paidRevenue([order]), 58500)
})

test('cancelled order is excluded from paid revenue even if it has totals', () => {
  const cancelled = paidOrder({
    id: 'cancelled',
    table_id: 'table-10',
    status: 'cancelled',
    payment_status: 'cancelled',
    items: [item({ id: 'c1', menu_item_id: 'kebab', quantity: 3, price: 25000 })],
  })

  assert.equal(isPaidOrder(cancelled), false)
  assert.equal(paidRevenue([cancelled]), 0)
})

test('paid order revenue is stable across refresh and regrouping', () => {
  const order = paidOrder({
    id: 'stable-paid',
    table_id: 'table-10',
    paid_at: '2026-05-16T20:15:00.000Z',
    items: [item({ id: 'p1', menu_item_id: 'kebab', quantity: 2, price: 25000 })],
  })
  const refreshed = { ...order, items: [...order.items] }

  assert.equal(paidRevenue([order]), paidRevenue([refreshed]))
  assert.equal(paidRevenue(groupOrdersBySession([order])), getOrderTotal(order))
})

test('service fee is consistent across dine-in takeaway and mixed orders for 0 17 and 20 percent', () => {
  const flows = [
    [item({ id: 'd', menu_item_id: 'kebab', quantity: 2, price: 25000, order_type: 'dine_in' })],
    [item({ id: 't', menu_item_id: 'kebab', quantity: 2, price: 25000, order_type: 'take_away' })],
    [
      item({ id: 'm1', menu_item_id: 'kebab', quantity: 1, price: 25000, order_type: 'dine_in' }),
      item({ id: 'm2', menu_item_id: 'cola', quantity: 1, price: 12000, order_type: 'take_away' }),
    ],
  ]

  for (const rate of [0, 17, 20]) {
    for (const rows of flows) {
      const summary = getOrderPaymentSummary({ service_rate_pct: rate }, rows, 20)
      assert.equal(summary.serviceRatePct, rate)
      assert.equal(summary.serviceFee, Math.round(summary.subtotal * rate / 100))
      assert.equal(summary.total, summary.subtotal + summary.serviceFee)
    }
  }
})

test('real mixed regression scenario preserves dine-in takeaway items names and paid revenue once', () => {
  const rows = [
    item({ id: 'lula-en', menu_item_id: 'lula-en', name: 'Lula kebab', quantity: 1, price: 24000, order_type: 'dine_in' }),
    item({ id: 'cola', menu_item_id: 'cola', name: 'Кока-Кола 0.5L', quantity: 3, price: 12000, order_type: 'dine_in' }),
    item({ id: 'chiroqchi', menu_item_id: 'chiroqchi', name: 'Chiroqchi', quantity: 1, price: 17000, order_type: 'take_away' }),
    item({ id: 'lagman', menu_item_id: 'lagman', name: 'Лагман', quantity: 4, price: 32000, order_type: 'dine_in' }),
    item({ id: 'lula-ru', menu_item_id: 'lula-ru', name: 'Люля-кебаб', quantity: 3, price: 24000, order_type: 'dine_in' }),
  ]
  const order = paidOrder({
    id: 'table-10-regression',
    table_id: 'table-10',
    table_name: 'Table 10',
    items: rows,
    subtotal: 999999,
    service_rate_pct: 17,
  })
  const grouped = getGroupedOrderItems(rows)
  const summary = getOrderPaymentSummary(order, rows, 20)

  assert.equal(summary.subtotal, 277000)
  assert.equal(summary.serviceFee, 47090)
  assert.equal(summary.total, 324090)
  assert.equal(grouped.some(row => row.order_type === 'take_away'), true)
  assert.equal(grouped.find(row => row.menu_item_id === 'lula-en').quantity, 1)
  assert.equal(grouped.find(row => row.menu_item_id === 'lula-ru').quantity, 3)
  assert.equal(getOrderPaymentSummary(order, grouped, 20).total, summary.total)
  assert.equal(paidRevenue([order]), summary.total)
})
