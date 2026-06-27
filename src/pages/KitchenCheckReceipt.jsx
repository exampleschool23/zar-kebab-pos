import React, { useEffect, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { getItemName } from '../lib/i18n'
import { formatTime } from '../lib/dateFormat'
import {
  formatKitchenOrderNumber,
  formatKitchenTableName,
  getKitchenCheckGroups,
  kitchenItemName,
} from '../lib/kitchenCheck'
import { getManualOrderNotes, getOrderItemOptionLines } from '../components/MenuProductCards'
import { useAppDataStatus } from '../store/appHooks'

const PRINT_CSS = `
@page {
  size: 80mm auto;
  margin: 0;
}

@media print {
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html,
  body {
    width: 80mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
  }
  body * {
    visibility: hidden !important;
  }
  .no-print { display: none !important; }
  button,
  nav,
  aside,
  header,
  footer,
  dialog,
  [role="dialog"] {
    display: none !important;
  }
  .kitchen-check-bg {
    display: block !important;
    background: #fff !important;
    padding: 0 !important;
    min-height: unset !important;
  }
  .kitchen-check-print-area,
  .kitchen-check-print-area * {
    visibility: visible !important;
  }
  .kitchen-check-print-area {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    display: block !important;
    width: 80mm !important;
    max-width: 80mm !important;
    margin: 0 !important;
    padding: 5mm 4mm !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: visible !important;
    box-sizing: border-box !important;
    background: #fff !important;
    color: #000 !important;
    font-family: "Courier New", monospace !important;
    font-size: 15px !important;
    line-height: 1.35 !important;
    font-weight: 700 !important;
  }
  .kitchen-check-print-area * {
    color: #000 !important;
    border-color: #000 !important;
    box-shadow: none !important;
  }
}
`

const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━'

function sanitizeBackPath(value) {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return ''
  if (raw.startsWith('/login') || raw.startsWith('/auth/callback')) return ''
  return raw
}

function handlePrintKitchenCheck(delay = 300) {
  window.setTimeout(() => window.print(), delay)
}

function localizeKitchenGroup(group, menuItemMap, lang = 'ru') {
  return {
    ...group,
    items: (group?.items || []).map(item => {
      const menuItem = menuItemMap?.[item.menu_item_id]
      return {
        ...item,
        name: menuItem ? getItemName(menuItem, lang) : item.name,
        notes: [
          ...getOrderItemOptionLines(item, menuItem, lang),
          getManualOrderNotes(item, menuItem, lang),
        ].filter(Boolean).join('\n'),
      }
    }),
  }
}

function KitchenCheckPaper({ group }) {
  const time = formatTime(group?.createdAt || new Date())
  const orderNumber = formatKitchenOrderNumber(group)
  const tableName = formatKitchenTableName(group?.tableName)
  const waiterName = group?.waiterName || '-'

  return (
    <div
      className="kitchen-check-print-area bg-white"
      style={{
        width: '320px',
        maxWidth: '100%',
        padding: '26px 20px',
        fontFamily: '"Courier New", monospace',
        color: '#000',
        fontSize: '15px',
        lineHeight: 1.35,
        fontWeight: 700,
      }}
    >
      <h1 style={{ margin: '0 0 14px', textAlign: 'center', fontSize: '18px', lineHeight: 1.1, fontWeight: 900 }}>
        ЧЕК ДЛЯ КУХНИ
      </h1>

      <div style={{ marginBottom: '13px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', whiteSpace: 'nowrap' }}>
          <span>{tableName}</span>
          <span>{orderNumber}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', whiteSpace: 'nowrap' }}>
          <span>{time}</span>
          <span>{waiterName}</span>
        </div>
      </div>

      <div style={{ margin: '12px 0', textAlign: 'center', fontWeight: 900 }}>{SEPARATOR}</div>

      <div>
        {(group?.items || []).map(item => (
          <div key={item.id || `${item.menu_item_id}-${item.name}`} style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 900 }}>
            {Number(item.quantity) || 1} × {kitchenItemName(item)}
            {item.notes && (
              <div style={{ margin: '3px 0 0 28px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                {item.notes}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ margin: '12px 0', textAlign: 'center', fontWeight: 900 }}>{SEPARATOR}</div>
    </div>
  )
}

export default function KitchenCheckReceipt() {
  const { orderId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { state } = useApp()
  const { loaded, loadError } = useAppDataStatus()
  const params = new URLSearchParams(location.search)
  const roundId = params.get('round') || ''
  const autoPrint = params.get('print') === '1'
  const backPath = sanitizeBackPath(params.get('back')) || '/waiter/tables'
  const lang = state.lang || 'ru'

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(item => { map[item.id] = item })
    return map
  }, [state.menuItems])

  const group = useMemo(() => {
    const order = state.orders.find(item => item.id === orderId)
    const groups = getKitchenCheckGroups(order)
    const selected = groups.find(item => String(item.roundId) === roundId) || groups[0]
    return selected ? localizeKitchenGroup(selected, menuItemMap, 'ru') : null
  }, [menuItemMap, orderId, roundId, state.orders])

  useEffect(() => {
    if (!autoPrint || !group) return
    const timer = setTimeout(() => handlePrintKitchenCheck(0), 600)
    return () => clearTimeout(timer)
  }, [autoPrint, group])

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <Loader2 size={28} className="animate-spin text-[#ff5a00]" />
      </div>
    )
  }

  if (loadError || !group) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="mb-4 text-sm font-black text-red-600">
            {lang === 'uz' ? 'Oshxona cheki topilmadi.' : lang === 'ru' ? 'Чек кухни не найден.' : 'Kitchen check not found.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="rounded-xl bg-[#ff5a00] px-4 py-2 text-sm font-black text-white"
          >
            {lang === 'uz' ? 'Orqaga' : lang === 'ru' ? 'Назад' : 'Back'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <style>{PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
        >
          <ArrowLeft size={16} />
          {lang === 'uz' ? 'Orqaga' : lang === 'ru' ? 'Назад' : 'Back'}
        </button>
        <button
          type="button"
          onClick={() => handlePrintKitchenCheck()}
          className="flex items-center gap-2 rounded-xl bg-[#ff5a00] px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-[#e64d00]"
        >
          <Printer size={15} />
          {lang === 'uz' ? 'Chop etish' : lang === 'ru' ? 'Печать' : 'Print'}
        </button>
      </div>

      <div className="kitchen-check-bg flex min-h-screen justify-center px-4 py-10">
        <KitchenCheckPaper group={group} />
      </div>
    </div>
  )
}
