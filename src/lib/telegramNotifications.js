import { supabase } from './supabase.js'

const NOTIFIABLE_STATUSES = new Set(['accepted', 'preparing', 'ready', 'completed', 'cancelled', 'served'])

export async function notifyTelegramOrderStatus(orderIdOrIds, status) {
  const orderIds = (Array.isArray(orderIdOrIds) ? orderIdOrIds : [orderIdOrIds]).filter(Boolean)
  if (orderIds.length === 0 || !NOTIFIABLE_STATUSES.has(status)) return

  try {
    const response = await fetch('/api/telegram/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderIds.length === 1
        ? { orderId: orderIds[0], status }
        : { orderIds, status }),
    })
    if (!response.ok) throw new Error(`Telegram notification failed with ${response.status}`)
  } catch (error) {
    console.warn('[telegram] order status notification failed:', error)
  }
}

async function notifyTelegramSalaryEvent(type, eventId) {
  const failedResult = {
    ok: false,
    allSent: false,
    employee: { status: 'failed' },
    group: { status: 'failed' },
  }
  if (!eventId || !['payment', 'fine', 'bonus', 'absence'].includes(type)) return failedResult
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.access_token) throw new Error('Authentication required')

    const response = await fetch('/api/telegram/employee-notification', {
      method: 'POST',
      keepalive: true,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, [`${type}Id`]: eventId }),
    })
    if (!response.ok) throw new Error(`Telegram ${type} notification failed with ${response.status}`)
    const result = await response.json().catch(() => ({}))
    return {
      ...failedResult,
      ...result,
      employee: { ...failedResult.employee, ...(result?.employee || {}) },
      group: { ...failedResult.group, ...(result?.group || {}) },
    }
  } catch (error) {
    console.warn(`[telegram] employee ${type} notification failed:`, error)
    return failedResult
  }
}

export function notifyTelegramEmployeePayment(paymentId) {
  return notifyTelegramSalaryEvent('payment', paymentId)
}

export function notifyTelegramEmployeeFine(fineId) {
  return notifyTelegramSalaryEvent('fine', fineId)
}

export function notifyTelegramEmployeeBonus(bonusId) {
  return notifyTelegramSalaryEvent('bonus', bonusId)
}

export function notifyTelegramEmployeeAbsence(absenceId) {
  return notifyTelegramSalaryEvent('absence', absenceId)
}
