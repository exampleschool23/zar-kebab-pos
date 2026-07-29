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

export async function notifyTelegramEmployeeFine(fineId) {
  if (!fineId) return false
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.access_token) throw new Error('Authentication required')

    const response = await fetch('/api/telegram/employee-notification', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'fine', fineId }),
    })
    if (!response.ok) throw new Error(`Telegram fine notification failed with ${response.status}`)
    return true
  } catch (error) {
    console.warn('[telegram] employee fine notification failed:', error)
    return false
  }
}

export async function notifyTelegramEmployeePayment(paymentId) {
  if (!paymentId) return false
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) throw sessionError
    if (!session?.access_token) throw new Error('Authentication required')

    const response = await fetch('/api/telegram/employee-notification', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'payment', paymentId }),
    })
    if (!response.ok) throw new Error(`Telegram payment notification failed with ${response.status}`)
    const result = await response.json().catch(() => ({}))
    return result?.ok === true
  } catch (error) {
    console.warn('[telegram] employee payment notification failed:', error)
    return false
  }
}
