import { formatTime } from './dateFormat.js'

const CANCELLED_STATUS = 'cancelled'
const DEFAULT_TITLE = 'ЧЕК ДЛЯ КУХНИ'
const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━'

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

function formatKitchenTime(value) {
  return formatTime(value || new Date())
}

function formatKitchenOrderNumber(group) {
  const raw = group?.orderNumber || group?.orderId || ''
  if (!raw) return ''
  const text = String(raw)
  if (text.startsWith('#')) return text
  const numericSuffix = text.match(/\d+$/)?.[0]
  return `#${numericSuffix || text}`
}

function formatKitchenTableName(value) {
  const text = String(value || '-').trim()
  const tableNumber = text.match(/^(table|стол)\s+(.+)$/i)?.[2]
  return tableNumber ? `СТОЛ ${tableNumber}` : text.toLocaleUpperCase('ru-RU')
}

function kitchenItemName(item) {
  return String(item?.name || '').trim().toLocaleUpperCase('ru-RU')
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
  const title = DEFAULT_TITLE
  const time = formatKitchenTime(group?.createdAt)
  const orderNumber = formatKitchenOrderNumber(group)
  const tableName = formatKitchenTableName(group?.tableName)
  const waiterName = group?.waiterName || '-'

  const rows = (group?.items || []).map(item => `
    <div class="item">
      ${escapeHtml(item.quantity || 1)} × ${escapeHtml(kitchenItemName(item))}
      ${item.notes ? `<div class="notes">${escapeHtml(item.notes)}</div>` : ''}
    </div>
  `).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 5mm 4mm;
      width: 80mm;
      font-family: "Courier New", monospace;
      color: #000;
      font-size: 15px;
      line-height: 1.35;
      font-weight: 700;
    }
    h1 {
      margin: 0 0 14px;
      text-align: center;
      font-size: 18px;
      line-height: 1.1;
      font-weight: 900;
      letter-spacing: 0;
    }
    .meta { margin-bottom: 13px; }
    .line { display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; }
    .separator { margin: 12px 0; text-align: center; font-weight: 900; }
    .items { margin: 0; }
    .item { margin: 0 0 16px; font-size: 16px; font-weight: 900; }
    .item:last-child { margin-bottom: 0; }
    .notes { margin: 3px 0 0 28px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    <div class="line"><span>${escapeHtml(tableName)}</span><span>${escapeHtml(orderNumber)}</span></div>
    <div class="line"><span>${escapeHtml(time)}</span><span>${escapeHtml(waiterName)}</span></div>
  </div>
  <div class="separator">${SEPARATOR}</div>
  <div class="items">${rows}</div>
  <div class="separator">${SEPARATOR}</div>
</body>
</html>`
}
