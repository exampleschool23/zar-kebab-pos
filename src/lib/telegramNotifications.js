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
