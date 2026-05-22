import {
  calculateLoyaltyCashback,
  getMaxLoyaltyRedeemAmount,
  getOrderPaymentSummary,
  isPaidOrder,
  validateLoyaltyRedeemAmount,
} from './analytics.js'

export const CASHBACK_TYPES = Object.freeze({
  bronze: { label: 'Bronze', percent: 3 },
  silver: { label: 'Silver', percent: 5 },
  gold: { label: 'Gold', percent: 7 },
  premium: { label: 'Premium', percent: 10 },
  black: { label: 'Black', percent: 15 },
})

export const DEFAULT_CASHBACK_TYPE = 'bronze'

export class LoyaltyError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'LoyaltyError'
    this.code = code
    this.status = details.status || (code === 'forbidden' ? 403 : 400)
    this.details = details
  }
}

export function isMissingLoyaltySchemaColumn(error, columnName) {
  const message = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return message.includes('schema cache') && message.includes(String(columnName || '').toLowerCase())
}

function fail(code, message, details) {
  throw new LoyaltyError(code, message, details)
}

export function normalizeRole(role) {
  return String(role || '').toLowerCase().trim()
}

export function canViewLoyaltyCards(role) {
  return ['owner', 'admin', 'cashier'].includes(normalizeRole(role))
}

export function canCreateLoyaltyCard(role) {
  return normalizeRole(role) === 'owner'
}

export function canEditLoyaltyCard(role) {
  return normalizeRole(role) === 'owner'
}

export function canDeactivateLoyaltyCard(role) {
  return normalizeRole(role) === 'owner'
}

export function canAdjustLoyaltyBalance(role) {
  return normalizeRole(role) === 'owner'
}

export function requireLoyaltyPermission(role, action) {
  const allowed = action === 'view'
    ? canViewLoyaltyCards(role)
    : action === 'create'
      ? canCreateLoyaltyCard(role)
      : action === 'edit'
        ? canEditLoyaltyCard(role)
        : action === 'deactivate'
          ? canDeactivateLoyaltyCard(role)
          : action === 'adjust'
            ? canAdjustLoyaltyBalance(role)
            : false
  if (!allowed) fail('forbidden', 'Forbidden loyalty card action', { action, role: normalizeRole(role), status: 403 })
  return true
}

export function normalizeCardNumber(cardNumber) {
  const value = String(cardNumber ?? '').trim()
  if (!/^\d{8}$/.test(value)) fail('invalid_card_number', 'Card number must be exactly 8 digits')
  return value
}

export function formatUzPhoneNumberInput(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.startsWith('998')) digits = digits.slice(3)
  digits = digits.slice(0, 9)
  const parts = []
  if (digits.length > 0) parts.push(digits.slice(0, 2))
  if (digits.length > 2) parts.push(digits.slice(2, 5))
  if (digits.length > 5) parts.push(digits.slice(5, 7))
  if (digits.length > 7) parts.push(digits.slice(7, 9))
  return parts.length ? `+998 ${parts.join(' ')}` : '+998 '
}

export function isValidUzPhoneNumber(value) {
  return /^\+998 \d{2} \d{3} \d{2} \d{2}$/.test(String(value || '').trim())
}

export function normalizeCashbackType(type = DEFAULT_CASHBACK_TYPE) {
  const value = String(type || DEFAULT_CASHBACK_TYPE).toLowerCase().trim()
  if (!CASHBACK_TYPES[value]) fail('invalid_cashback_type', 'Invalid cashback type')
  return value
}

export function getCashbackTypePercent(type = DEFAULT_CASHBACK_TYPE) {
  return CASHBACK_TYPES[normalizeCashbackType(type)].percent
}

export function getLoyaltyCardCashbackType(cardOrType = DEFAULT_CASHBACK_TYPE) {
  if (typeof cardOrType === 'string') return normalizeCashbackType(cardOrType)
  return normalizeCashbackType(
    cardOrType?.cashback_type ??
    cardOrType?.cashbackType ??
    cardOrType?.card_type_at_transaction ??
    cardOrType?.cardTypeAtTransaction ??
    DEFAULT_CASHBACK_TYPE
  )
}

export function getLoyaltyCardCashbackPercent(cardOrType = DEFAULT_CASHBACK_TYPE) {
  return getCashbackTypePercent(getLoyaltyCardCashbackType(cardOrType))
}

export function normalizeMoneyAmount(value, { positive = false, allowZero = true } = {}) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) fail('invalid_amount', 'Amount must be a valid number')
  if (!Number.isInteger(numberValue)) fail('invalid_amount', 'UZS amount must be an integer')
  if (numberValue < 0) fail('invalid_amount', 'Amount cannot be negative')
  if (positive && numberValue <= 0) fail('invalid_amount', 'Amount must be greater than zero')
  if (!allowZero && numberValue === 0) fail('invalid_amount', 'Amount must be greater than zero')
  if (!Number.isSafeInteger(numberValue)) fail('invalid_amount', 'Amount is too large')
  return numberValue
}

export function normalizeTransactionAmount(value) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) fail('invalid_amount', 'Amount must be a valid number')
  if (!Number.isInteger(numberValue)) fail('invalid_amount', 'UZS amount must be an integer')
  if (numberValue === 0) fail('invalid_amount', 'Transaction amount must be non-zero')
  if (!Number.isSafeInteger(numberValue)) fail('invalid_amount', 'Amount is too large')
  return numberValue
}

export function makePublicToken(seed = '') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `loyalty-${Date.now()}-${Math.random().toString(16).slice(2)}${seed ? `-${seed}` : ''}`
}

export function createLoyaltyCardRecord({
  role = 'owner',
  cardNumber,
  customerName = '',
  phoneNumber = '',
  cashbackType = DEFAULT_CASHBACK_TYPE,
  existingCardNumbers = [],
  now = new Date().toISOString(),
  publicToken,
} = {}) {
  requireLoyaltyPermission(role, 'create')
  const normalizedCardNumber = normalizeCardNumber(cardNumber)
  const normalizedCustomerName = String(customerName || '').trim()
  const normalizedPhoneNumber = formatUzPhoneNumberInput(phoneNumber).trim()
  if (!normalizedCustomerName) fail('customer_name_required', 'Customer name is required')
  if (!isValidUzPhoneNumber(normalizedPhoneNumber)) fail('invalid_phone_number', 'Phone number must match +998 91 132 32 32')
  if (existingCardNumbers.map(String).includes(normalizedCardNumber)) {
    fail('duplicate_card_number', 'Duplicate loyalty card number', { status: 409 })
  }
  const normalizedType = normalizeCashbackType(cashbackType)
  return {
    card_number: normalizedCardNumber,
    public_token: publicToken || makePublicToken(normalizedCardNumber),
    customer_name: normalizedCustomerName,
    phone_number: normalizedPhoneNumber,
    cashback_type: normalizedType,
    balance: 0,
    total_earned: 0,
    total_redeemed: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
  }
}

export function editLoyaltyCardRecord({ role = 'owner', card, patch = {}, now = new Date().toISOString() } = {}) {
  requireLoyaltyPermission(role, 'edit')
  const next = { ...card }
  if (patch.card_number != null) next.card_number = normalizeCardNumber(patch.card_number)
  if (patch.customer_name != null) next.customer_name = String(patch.customer_name).trim()
  if (patch.phone_number != null) next.phone_number = String(patch.phone_number).trim()
  if (patch.cashback_type != null) next.cashback_type = normalizeCashbackType(patch.cashback_type)
  next.updated_at = now
  return next
}

export function deactivateLoyaltyCardRecord({ role = 'owner', card, now = new Date().toISOString() } = {}) {
  requireLoyaltyPermission(role, 'deactivate')
  return { ...card, is_active: false, updated_at: now }
}

export function makeLoyaltyTransaction({
  loyaltyCardId,
  orderId = null,
  type,
  amount,
  balanceBefore,
  balanceAfter,
  reason = null,
  createdBy = null,
  cashbackPercentUsed = null,
  cardTypeAtTransaction = null,
  now = new Date().toISOString(),
} = {}) {
  return {
    loyalty_card_id: loyaltyCardId,
    order_id: orderId,
    type,
    amount: normalizeTransactionAmount(amount),
    balance_before: normalizeMoneyAmount(balanceBefore),
    balance_after: normalizeMoneyAmount(balanceAfter),
    reason,
    created_by: createdBy,
    cashback_percent_used: cashbackPercentUsed,
    card_type_at_transaction: cardTypeAtTransaction,
    created_at: now,
  }
}

export function adjustLoyaltyBalance({ role = 'owner', card, amount, reason, createdBy = null, now = new Date().toISOString() } = {}) {
  requireLoyaltyPermission(role, 'adjust')
  const delta = Number(amount)
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    fail('invalid_amount', 'Adjustment amount must be a non-zero integer')
  }
  if (!String(reason || '').trim()) fail('reason_required', 'Adjustment reason is required')
  const before = normalizeMoneyAmount(card?.balance || 0)
  const after = before + delta
  if (after < 0) fail('negative_balance', 'Loyalty balance cannot go negative')
  if (!Number.isSafeInteger(after)) fail('invalid_amount', 'Amount is too large')

  const updatedCard = {
    ...card,
    balance: after,
    total_earned: delta > 0 ? (Number(card?.total_earned) || 0) + delta : (Number(card?.total_earned) || 0),
    total_redeemed: delta < 0 ? (Number(card?.total_redeemed) || 0) + Math.abs(delta) : (Number(card?.total_redeemed) || 0),
    updated_at: now,
  }
  return {
    card: updatedCard,
    transaction: makeLoyaltyTransaction({
      loyaltyCardId: card.id,
      type: 'manual_adjustment',
      amount: Math.abs(delta),
      balanceBefore: before,
      balanceAfter: after,
      reason: String(reason).trim(),
      createdBy,
      now,
    }),
  }
}

export function validateLoyaltyPayment({ card, amount, remainingOrderAmount, order } = {}) {
  if (!card) fail('card_not_found', 'Loyalty card not found', { status: 404 })
  if (card.is_active === false) fail('inactive_card', 'Loyalty card is inactive')
  if (order?.status === 'cancelled' || order?.payment_status === 'cancelled') fail('order_cancelled', 'Cancelled orders cannot redeem loyalty')
  if (isPaidOrder(order)) fail('order_completed', 'Completed orders cannot redeem loyalty')
  const redeemAmount = normalizeMoneyAmount(amount, { positive: true })
  const validation = validateLoyaltyRedeemAmount(redeemAmount, card.balance || 0, remainingOrderAmount || 0)
  if (!validation.ok) fail(validation.reason === 'balance' ? 'exceeds_balance' : 'exceeds_bill', 'Invalid loyalty redeem amount')
  return {
    amount: validation.amount,
    maxRedeemAmount: getMaxLoyaltyRedeemAmount(card.balance || 0, remainingOrderAmount || 0),
  }
}

export function redeemLoyaltyBalance({ card, amount, remainingOrderAmount, order, createdBy = null, now = new Date().toISOString() } = {}) {
  const { amount: redeemAmount } = validateLoyaltyPayment({ card, amount, remainingOrderAmount, order })
  const before = normalizeMoneyAmount(card.balance || 0)
  const after = before - redeemAmount
  if (after < 0) fail('negative_balance', 'Loyalty balance cannot go negative')
  const updatedCard = {
    ...card,
    balance: after,
    total_redeemed: (Number(card.total_redeemed) || 0) + redeemAmount,
    updated_at: now,
  }
  return {
    card: updatedCard,
    transaction: makeLoyaltyTransaction({
      loyaltyCardId: card.id,
      orderId: order?.id || null,
      type: 'redeemed',
      amount: -redeemAmount,
      balanceBefore: before,
      balanceAfter: after,
      reason: 'Loyalty used for order payment',
      createdBy,
      now,
    }),
  }
}

export function completeOrderCashback({ card, order, items = [], loyaltyUsedAmount = 0, createdBy = null, now = new Date().toISOString() } = {}) {
  if (!card) fail('card_not_found', 'Loyalty card not found', { status: 404 })
  if (card.is_active === false) fail('inactive_card', 'Loyalty card is inactive')
  if (order?.status === 'cancelled' || order?.payment_status === 'cancelled') fail('order_cancelled', 'Cancelled orders do not earn cashback')
  if (!isPaidOrder(order)) fail('order_not_completed', 'Cashback is created only after successful order completion')

  const cardType = getLoyaltyCardCashbackType(card)
  const percent = getLoyaltyCardCashbackPercent(card)
  const cashback = calculateLoyaltyCashback(
    { ...order, loyalty_used_amount: normalizeMoneyAmount(loyaltyUsedAmount) },
    items,
    percent
  )
  const before = normalizeMoneyAmount(card.balance || 0)
  const after = before + cashback
  const updatedOrder = {
    ...order,
    loyalty_used_amount: normalizeMoneyAmount(loyaltyUsedAmount),
    cashback_earned: cashback,
    cashback_percent: percent,
  }

  if (cashback <= 0) {
    return { card: { ...card }, order: updatedOrder, transaction: null, cashback }
  }

  return {
    card: {
      ...card,
      balance: after,
      total_earned: (Number(card.total_earned) || 0) + cashback,
      updated_at: now,
    },
    order: updatedOrder,
    cashback,
    transaction: makeLoyaltyTransaction({
      loyaltyCardId: card.id,
      orderId: order?.id || null,
      type: 'cashback_earned',
      amount: cashback,
      balanceBefore: before,
      balanceAfter: after,
      createdBy,
      cashbackPercentUsed: percent,
      cardTypeAtTransaction: cardType,
      now,
    }),
  }
}

export function getLoyaltyTransactionHistory(transactions = []) {
  return [...transactions].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
}

export function getLoyaltyCardDisplay(card, lang = 'en') {
  const missingName = lang === 'uz' ? 'Nomsiz mijoz' : lang === 'ru' ? 'Клиент без имени' : 'Unnamed customer'
  const missingPhone = lang === 'uz' ? 'Telefon yo‘q' : lang === 'ru' ? 'Телефон не указан' : 'No phone'
  const type = getLoyaltyCardCashbackType(card)
  return {
    cardNumber: String(card?.card_number || ''),
    customerName: card?.customer_name || missingName,
    phoneNumber: card?.phone_number || missingPhone,
    cashbackType: CASHBACK_TYPES[type].label,
    cashbackPercent: CASHBACK_TYPES[type].percent,
    balance: normalizeMoneyAmount(card?.balance || 0),
    totalEarned: normalizeMoneyAmount(card?.total_earned || 0),
    totalRedeemed: normalizeMoneyAmount(card?.total_redeemed || 0),
    status: card?.is_active === false ? 'Inactive' : 'Active',
  }
}

export function getPublicLoyaltyCardView({ card, transactions = [], orders = [], publicToken } = {}) {
  if (!card || card.public_token !== publicToken) fail('not_found', 'Loyalty card not found', { status: 404 })
  return {
    balance: normalizeMoneyAmount(card.balance || 0),
    totalEarned: normalizeMoneyAmount(card.total_earned || 0),
    totalRedeemed: normalizeMoneyAmount(card.total_redeemed || 0),
    transactions: getLoyaltyTransactionHistory(transactions),
    orders: orders.map(order => ({
      id: order.id,
      cashbackEarned: normalizeMoneyAmount(order.cashback_earned || order.cashbackEarned || 0),
      loyaltyUsed: normalizeMoneyAmount(order.loyalty_used_amount || order.loyaltyUsedAmount || 0),
    })),
    canEdit: false,
    canAdjust: false,
    canDeactivate: false,
  }
}

export function getLoyaltyCashbackPreview({ order, items = [], loyaltyUsedAmount = 0, cashbackType = null, card = null } = {}) {
  const percent = card || cashbackType ? getLoyaltyCardCashbackPercent(card || cashbackType) : 0
  return {
    summary: getOrderPaymentSummary({ ...order, loyalty_used_amount: loyaltyUsedAmount }, items),
    cashback: calculateLoyaltyCashback(
      { ...order, loyalty_used_amount: loyaltyUsedAmount, status: 'paid', payment_status: 'paid' },
      items,
      percent
    ),
    cashbackPercent: percent,
  }
}
