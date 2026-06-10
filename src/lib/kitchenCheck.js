const CANCELLED_STATUS = 'cancelled'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function orderItemRoundId(item, fallbackOrderId) {
  return (
    item?.kitchen_round_id ||
    item?.kitchenRoundId ||
    item?.submitted_at ||
    item?.submittedAt ||
    item?.created_at ||
    item?.createdAt ||
    item?.order_id ||
    item?._orderId ||
    item?.orderId ||
    fallbackOrderId ||
    'order'
  )
}

function itemCreatedAt(item) {
  return item?.submitted_at || item?.submittedAt || item?.created_at || item?.createdAt || ''
}

export function getKitchenCheckGroups(order) {
  if (!order) return []
  const groups = new Map()

  for (const item of order.items || []) {
    if (String(item?.status || '').toLowerCase() === CANCELLED_STATUS) continue
    const roundId = orderItemRoundId(item, order.id)
    if (!groups.has(roundId)) {
      groups.set(roundId, {
        orderId: item.order_id || item._orderId || item.orderId || order.id,
        roundId,
        orderNumber: item.order_number || item.orderNumber || order.order_number || '',
        tableName: item.table_name || item.tableName || order.table_name || '',
        waiterName: item.waiter_name || item.waiterName || order.waiter_name || '',
        createdAt: itemCreatedAt(item) || order.created_at || '',
        items: [],
      })
    }
    groups.get(roundId).items.push(item)
  }

  return [...groups.values()].sort((a, b) => {
    const aTime = Date.parse(a.createdAt)
    const bTime = Date.parse(b.createdAt)
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0
    return aTime - bTime
  })
}

export function kitchenCheckLabels(lang = 'en') {
  const labels = {
    uz: {
      title: 'Oshpaz cheki',
      table: 'Stol',
      waiter: 'Ofitsiant',
      order: 'Buyurtma',
      time: 'Vaqt',
      qty: 'Soni',
      notes: 'Izoh',
    },
    ru: {
      title: 'Чек для повара',
      table: 'Стол',
      waiter: 'Официант',
      order: 'Заказ',
      time: 'Время',
      qty: 'Кол-во',
      notes: 'Заметка',
    },
    en: {
      title: 'Cook Check',
      table: 'Table',
      waiter: 'Waiter',
      order: 'Order',
      time: 'Time',
      qty: 'Qty',
      notes: 'Note',
    },
  }
  return labels[lang] || labels.en
}

export function buildKitchenCheckHtml({ group, lang = 'en', restaurantName = 'Zar Kebab' }) {
  const l = kitchenCheckLabels(lang)
  const date = group?.createdAt
    ? new Date(group.createdAt).toLocaleString()
    : new Date().toLocaleString()

  const rows = (group?.items || []).map(item => `
    <tr>
      <td class="qty">${escapeHtml(item.quantity || 1)}</td>
      <td>
        <div class="name">${escapeHtml(item.name)}</div>
        ${item.notes ? `<div class="notes">${escapeHtml(l.notes)}: ${escapeHtml(item.notes)}</div>` : ''}
      </td>
    </tr>
  `).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(l.title)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 4mm; width: 80mm; font-family: Arial, sans-serif; color: #000; }
    h1 { margin: 0 0 6px; text-align: center; font-size: 18px; text-transform: uppercase; }
    .brand { text-align: center; font-size: 12px; font-weight: 700; margin-bottom: 8px; }
    .meta { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px; font-size: 12px; }
    .meta div { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 6px 0; border-bottom: 1px dashed #999; vertical-align: top; }
    .qty { width: 28px; font-weight: 800; font-size: 15px; }
    .name { font-weight: 800; }
    .notes { margin-top: 2px; font-size: 11px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(l.title)}</h1>
  <div class="brand">${escapeHtml(restaurantName)}</div>
  <div class="meta">
    <div><strong>${escapeHtml(l.table)}</strong><span>${escapeHtml(group?.tableName || '-')}</span></div>
    <div><strong>${escapeHtml(l.waiter)}</strong><span>${escapeHtml(group?.waiterName || '-')}</span></div>
    <div><strong>${escapeHtml(l.order)}</strong><span>${escapeHtml(group?.orderNumber || group?.orderId || '-')}</span></div>
    <div><strong>${escapeHtml(l.time)}</strong><span>${escapeHtml(date)}</span></div>
  </div>
  <table>${rows}</table>
</body>
</html>`
}
