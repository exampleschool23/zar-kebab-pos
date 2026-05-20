const NOTIFIABLE_STATUSES = new Set(['accepted', 'preparing', 'ready', 'completed', 'cancelled', 'served'])

export async function notifyTelegramOrderStatus(orderId, status) {
  if (!orderId || !NOTIFIABLE_STATUSES.has(status)) return

  try {
    await fetch('/api/telegram/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status }),
    })
  } catch (error) {
    console.warn('[telegram] order status notification failed:', error)
  }
}
