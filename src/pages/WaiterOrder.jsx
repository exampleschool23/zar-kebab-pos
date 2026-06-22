import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, ShoppingCart, Plus, UtensilsCrossed,
  Menu as MenuIcon, X, CheckCircle2, Clock,
  Receipt, Loader2, ArrowLeft, LogOut, Minus, Printer,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t, getItemName, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { getOrderPaymentSummary, normalizeServiceRatePct } from '../lib/analytics'
import CartPanel from '../components/CartPanel'
import UnifiedSidebar from '../components/UnifiedSidebar'
import AnimatedSearch from '../components/AnimatedSearch'
import MenuCategoryScroller, { menuCategorySectionId } from '../components/MenuCategoryScroller'
import { ProductCard, ProductDetailPage } from '../components/MenuProductCards'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useAppDataStatus } from '../store/appHooks'
import { buildKitchenCheckHtml, getKitchenCheckGroups } from '../lib/kitchenCheck'
import { isOffPremiseOrderType, normalizeOrderType, orderTypeLabel } from '../lib/orderTypes'
import { isCustomerMenuCategory, isCustomerMenuItem } from '../lib/menuItems'
import { DEFAULT_PRICE_MODE, getMenuItemForPriceMode, getPriceModeLabel, normalizePriceMode } from '../lib/priceModes'

// ── OrderActionPanel ───────────────────────────────────────────────────────────
function OrderActionPanel({ order, tableId, lang, dispatch, cartCount, menuItemMap, restaurantName, viewerRole }) {
  const [busy, setBusy] = useState(false)
  const [updatingItemId, setUpdatingItemId] = useState(null)

  if (!order) return null
  if (cartCount > 0) return null

  const items       = order.items || []
  const newCount    = items.filter(i => i.status === 'new').length
  const prepCount   = items.filter(i => i.status === 'preparing').length
  const readyCount  = items.filter(i => i.status === 'ready').length
  const inPreparation = newCount > 0 || prepCount > 0
  const allReady    = items.length > 0 && !inPreparation
  const isDelivered = !inPreparation && order.status === 'delivered'
  const isNeedsBill = !inPreparation && order.status === 'needs_bill'
  const canEditRequestedBill = ['admin', 'owner'].includes(String(viewerRole || '').toLowerCase())

  const L = {
    uz: {
      preparationTitle: 'Buyurtma tayyorlanmoqda',
      preparationSub: (n, p) => [n > 0 && `${n} yangi`, p > 0 && `${p} tayyorlanmoqda`].filter(Boolean).join(' · '),
      readyTitle: 'Barcha taomlar tayyor!',
      readySub: 'Mijozga yetkazilganini tasdiqlang',
      confirmBtn: 'Yetkazildi ✓',
      deliveredTitle: 'Yetkazildi',
      deliveredSub: 'Hisob so\'rash mumkin',
      billBtn: 'Hisob so\'rash',
      needsBillTitle: 'Hisob so\'raldi',
      needsBillSub: 'Kassir to\'lovni qayta ishlaydi',
      removeItem: 'Olib tashlash',
      decreaseItem: 'Kamaytirish',
      increaseItem: 'Ko‘paytirish',
      printCheck: 'Chek chiqarish',
      roundLabel: n => `Buyurtma ${n}`,
      missingItem: 'Menyuda yo‘q',
      removeReason: 'Menyuda mavjud emas',
    },
    ru: {
      preparationTitle: 'Заказ готовится',
      preparationSub: (n, p) => [n > 0 && `${n} новых`, p > 0 && `${p} готовится`].filter(Boolean).join(' · '),
      readyTitle: 'Все блюда готовы!',
      readySub: 'Подтвердите, что заказ подан гостю',
      confirmBtn: 'Подано ✓',
      deliveredTitle: 'Подано',
      deliveredSub: 'Можно запросить счёт',
      billBtn: 'Запросить счёт',
      needsBillTitle: 'Счёт запрошен',
      needsBillSub: 'Кассир обрабатывает оплату',
      removeItem: 'Убрать',
      decreaseItem: 'Уменьшить',
      increaseItem: 'Увеличить',
      printCheck: 'Печать чека',
      roundLabel: n => `Заказ ${n}`,
      missingItem: 'Нет в меню',
      removeReason: 'Нет в меню',
    },
    en: {
      preparationTitle: 'Order is preparing',
      preparationSub: (n, p) => [n > 0 && `${n} new`, p > 0 && `${p} preparing`].filter(Boolean).join(' · '),
      readyTitle: 'All items ready!',
      readySub: 'Confirm the order has been served to the guest',
      confirmBtn: 'Mark as Served ✓',
      deliveredTitle: 'Order Served',
      deliveredSub: 'You can now request the bill',
      billBtn: 'Request Bill',
      needsBillTitle: 'Bill Requested',
      needsBillSub: 'Cashier is processing payment',
      removeItem: 'Remove',
      decreaseItem: 'Decrease',
      increaseItem: 'Increase',
      printCheck: 'Print check',
      roundLabel: n => `Order ${n}`,
      missingItem: 'Not in menu',
      removeReason: 'Not present in menu',
    },
  }
  const l = L[lang] || L.en

  const preparationEditableItems = items.filter(item => !['served', 'cancelled'].includes(String(item.status || '').toLowerCase()))
  const requestedBillEditableItems = canEditRequestedBill
    ? items.filter(item => String(item.status || '').toLowerCase() !== 'cancelled')
    : []
  const kitchenCheckGroups = getKitchenCheckGroups(order)
  const preparationEditableGroups = kitchenCheckGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => !['served', 'cancelled'].includes(String(item.status || '').toLowerCase())),
    }))
    .filter(group => group.items.length > 0)
  const requestedBillEditableGroups = canEditRequestedBill
    ? kitchenCheckGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => String(item.status || '').toLowerCase() !== 'cancelled'),
      }))
      .filter(group => group.items.length > 0)
    : []

  function handlePrintKitchenCheck(group) {
    const printWindow = window.open('', '_blank', 'width=420,height=640')
    if (!printWindow) return
    const russianGroup = {
      ...group,
      items: group.items.map(item => ({
        ...item,
        name: menuItemMap?.[item.menu_item_id]
          ? getItemName(menuItemMap[item.menu_item_id], 'ru')
          : item.name,
      })),
    }
    printWindow.document.open()
    printWindow.document.write(buildKitchenCheckHtml({ group: russianGroup, lang: 'ru', restaurantName }))
    printWindow.document.close()
    printWindow.focus()
    window.setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 300)
  }

  async function handleUpdateItemQty(item, qty) {
    const itemKey = item.id || item.menu_item_id
    const sourceOrderId = item.order_id || item._orderId || order.id
    if (!sourceOrderId || !itemKey || updatingItemId) return
    setUpdatingItemId(itemKey)
    const result = await dispatch({
      type: 'UPDATE_BILL_ITEM_QTY',
      payload: {
        tableId,
        orderId: sourceOrderId,
        orderItemId: item.id,
        menuItemId: item.menu_item_id,
        sourceItemIds: item.source_item_ids || item.sourceItemIds || [],
        qty,
      },
    })
    if (result?.error) {
      setTimeout(() => setUpdatingItemId(null), 700)
      return
    }
    setUpdatingItemId(null)
  }

  function OrderItemQtyRow({ item }) {
    const itemKey = item.id || item.menu_item_id
    const menuItem = menuItemMap?.[item.menu_item_id]
    const missing = !menuItem || menuItem.available === false
    const updating = updatingItemId === itemKey
    const quantity = Number(item.quantity) || 1
    return (
      <div className="flex items-center gap-2 rounded-xl bg-white/75 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-black text-[#1F2937]">{item.name}</p>
          <p className="text-[10px] font-bold text-[#9CA3AF]">
            ×{quantity}
            {missing ? ` · ${l.missingItem}` : ''}
          </p>
        </div>
        <div className="flex h-9 flex-shrink-0 items-center gap-1 rounded-lg border border-orange-100 bg-white p-1">
          <button
            type="button"
            onClick={() => handleUpdateItemQty(item, quantity - 1)}
            disabled={!!updatingItemId}
            title={l.decreaseItem}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-wait disabled:opacity-50"
          >
            {updating ? <Loader2 size={12} className="animate-spin" /> : <Minus size={12} />}
          </button>
          <span className="min-w-6 text-center text-[12px] font-black tabular-nums text-[#1F2937]">{quantity}</span>
          <button
            type="button"
            onClick={() => handleUpdateItemQty(item, quantity + 1)}
            disabled={!!updatingItemId}
            title={l.increaseItem}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-[#ff5a00] text-white transition-colors hover:bg-[#cc4800] disabled:cursor-wait disabled:opacity-50"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>
    )
  }

  function handleConfirmDelivery() {
    if (busy) return
    setBusy(true)
    dispatch({ type: 'CONFIRM_ORDER_DELIVERED', payload: tableId })
    setTimeout(() => setBusy(false), 700)
  }
  function handleRequestBill() {
    if (busy) return
    setBusy(true)
    dispatch({ type: 'MARK_TABLE_NEEDS_BILL', payload: tableId })
    setTimeout(() => setBusy(false), 700)
  }

  if (inPreparation) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-orange-100 bg-[#fff7ed] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-[#ff5a00]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-[#ff5a00]">{l.preparationTitle}</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">{l.preparationSub(newCount, prepCount)}</p>
          </div>
          {readyCount > 0 && (
            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full flex-shrink-0">
              {readyCount} {lang === 'uz' ? 'tayyor' : lang === 'ru' ? 'готово' : 'ready'}
            </span>
          )}
        </div>
        {preparationEditableItems.length > 0 && (
          <div className="mt-3 space-y-3 border-t border-orange-100 pt-3">
            {preparationEditableGroups.map((group, index) => (
              <div key={group.roundId} className="space-y-2 rounded-2xl border border-orange-100 bg-white/35 p-2">
                <button
                  type="button"
                  onClick={() => handlePrintKitchenCheck(group)}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-3 text-[12px] font-black text-[#ff5a00] transition-colors hover:bg-orange-50"
                >
                  <Printer size={14} />
                  {l.printCheck} · {l.roundLabel(index + 1)}
                </button>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <OrderItemQtyRow key={item.id || `${group.roundId}-${item.menu_item_id}`} item={item} />
                  ))}
                </div>
              </div>
            ))}
            {preparationEditableGroups.length === 0 && kitchenCheckGroups.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                {kitchenCheckGroups.map((group, index) => (
                  <button
                    key={group.roundId}
                    type="button"
                    onClick={() => handlePrintKitchenCheck(group)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white px-3 text-[12px] font-black text-[#ff5a00] transition-colors hover:bg-orange-50"
                  >
                    <Printer size={14} />
                    {l.printCheck} · {l.roundLabel(index + 1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
  if (allReady && !isDelivered && !isNeedsBill) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border-2 border-green-300 bg-[#f0fdf4] px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-[#16A34A]" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-[#16A34A]">{l.readyTitle}</p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">{l.readySub}</p>
          </div>
        </div>
        <button
          onClick={handleConfirmDelivery}
          disabled={busy}
          className={`w-full py-2.5 rounded-xl font-black text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            busy ? 'bg-green-200 text-green-500 cursor-not-allowed' : 'bg-[#16A34A] text-white hover:bg-[#15803D] shadow-sm'
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
          {l.confirmBtn}
        </button>
      </div>
    )
  }
  if (isDelivered) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Receipt size={16} className="text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold text-blue-700">{l.deliveredTitle}</p>
            <p className="text-[11px] text-[#6B7280] mt-0.5">{l.deliveredSub}</p>
          </div>
        </div>
        <button
          onClick={handleRequestBill}
          disabled={busy}
          className={`w-full py-2.5 rounded-xl font-black text-[13px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            busy ? 'bg-blue-200 text-blue-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
          }`}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Receipt size={15} />}
          {l.billBtn}
        </button>
      </div>
    )
  }
  if (isNeedsBill) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <Clock size={16} className="text-[#DC2626]" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#DC2626]">{l.needsBillTitle}</p>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">{l.needsBillSub}</p>
          </div>
        </div>
        {requestedBillEditableItems.length > 0 && (
          <div className="mt-3 space-y-3 border-t border-red-100 pt-3">
            {requestedBillEditableGroups.map((group, index) => (
              <div key={group.roundId} className="space-y-2 rounded-2xl border border-red-100 bg-white/45 p-2">
                <p className="px-1 text-[11px] font-black uppercase tracking-wide text-red-500">
                  {l.roundLabel(index + 1)}
                </p>
                {group.items.map(item => (
                  <OrderItemQtyRow key={item.id || `${group.roundId}-${item.menu_item_id}`} item={item} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  return null
}

// ── BottomTableChips ───────────────────────────────────────────────────────────
function BottomTableChips({ currentTableId, onNewOrder }) {
  const { state } = useApp()
  const navigate  = useNavigate()

  const chips = useMemo(() => {
    const byTable = {}
    state.orders.forEach(o => {
      if (o.payment_status === 'paid') return
      if (!byTable[o.table_id]) {
        byTable[o.table_id] = {
          table_id:   o.table_id,
          table_name: o.table_name,
          itemCount:  o.items?.length ?? 0,
          status:     o.status,
        }
      } else {
        byTable[o.table_id].itemCount += o.items?.length ?? 0
        // escalate status
        const priority = ['needs_bill', 'preparing', 'sent_to_kitchen', 'delivered']
        const cur = priority.indexOf(byTable[o.table_id].status)
        const nxt = priority.indexOf(o.status)
        if (nxt !== -1 && (cur === -1 || nxt < cur)) byTable[o.table_id].status = o.status
      }
    })
    return Object.values(byTable)
  }, [state.orders])

  if (chips.length === 0) return null

  const STATUS_LABEL = {
    sent_to_kitchen: { en: 'Sent', uz: 'Yuborildi', ru: 'Отправлен', cls: 'bg-orange-100 text-[#ff5a00]' },
    preparing:       { en: 'Cooking', uz: 'Pishirilmoqda', ru: 'Готовится', cls: 'bg-yellow-100 text-yellow-700' },
    delivered:       { en: 'Served',  uz: 'Yetkazildi', ru: 'Подано', cls: 'bg-green-100 text-green-700' },
    needs_bill:      { en: 'Bill',    uz: 'Hisob', ru: 'Счёт',      cls: 'bg-red-100 text-red-600' },
  }
  const lang = state.lang

  return (
    <div className="flex-shrink-0 bg-white border-t border-[#E5E7EB] px-3 py-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <div className="flex items-center gap-2 min-w-max">
        {chips.map((chip, idx) => {
          const isActive = chip.table_id === currentTableId
          const sl = STATUS_LABEL[chip.status]
          return (
            <button
              key={chip.table_id}
              onClick={() => navigate(`/waiter/order/${chip.table_id}`)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all flex-shrink-0 ${
                isActive
                  ? 'bg-[#fff1e8] border-[#ff5a00]/40 text-[#ff5a00]'
                  : 'bg-gray-50 border-[#E5E7EB] text-[#6B7280] hover:border-orange-200 hover:bg-orange-50/30'
              }`}
            >
              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[10px] flex-shrink-0 ${
                isActive ? 'bg-[#ff5a00] text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                T{idx + 1}
              </span>
              <span className="max-w-[72px] truncate font-bold">{chip.table_name}</span>
              <span className="text-[#9CA3AF] font-medium">{chip.itemCount}</span>
              {sl && (
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold flex-shrink-0 ${sl.cls}`}>
                  {sl[lang] || sl.en}
                </span>
              )}
            </button>
          )
        })}

        {/* New Order button */}
        <button
          onClick={onNewOrder}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-[#ff5a00]/40 text-[#ff5a00] text-[11px] font-bold hover:bg-orange-50 transition-colors flex-shrink-0"
        >
          <Plus size={12} />
          {lang === 'uz' ? 'Yangi buyurtma' : lang === 'ru' ? 'Новый заказ' : 'New Order'}
        </button>
      </div>
    </div>
  )
}

// ── Product section (used inside "All" grouped view) ──────────────────────────
function ProductSection({ cat, items, cartQtyMap, lang, onAdd, onIncrement, onDecrement, onOpenDetail, eagerCount = 0 }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <h2 className="font-black text-[18px] text-[#1F2937]">{getCategoryName(cat, lang)}</h2>
        <span className="bg-[#F3F4F6] text-[#6B7280] text-[12px] font-bold px-2.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <div className="grid grid-cols-2 min-[700px]:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
        {items.map((item, index) => (
          <ProductCard
            key={item.id}
            item={item}
            qty={cartQtyMap[item.id] || 0}
            lang={lang}
            eager={index < eagerCount}
            density="compact"
            onAdd={onAdd}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WaiterOrder() {
  const { tableId }         = useParams()
  const navigate            = useNavigate()
  const [searchParams]      = useSearchParams()
  const { state, dispatch } = useApp()
  const { loaded, loadError } = useAppDataStatus()
  const { profile, signOut } = useAuth()
  const lang                = state.lang
  const role                = (profile?.role || state.user?.role || '').toLowerCase()
  const shouldShowSidebar   = role !== 'waiter'
  const [search,        setSearch]       = useState('')
  const [activeCategory,setCategory]     = useState('all')
  const [cartOpen,      setCartOpen]     = useState(false)
  const [sidebarOpen,   setSidebarOpen]  = useState(false)
  const [isSendingOrder,setSendingOrder] = useState(false)
  const isTakeAwayFlow = !tableId
  const [orderType,     setOrderType]    = useState(isTakeAwayFlow ? 'take_away' : 'dine_in')
  const [priceMode,     setPriceMode]    = useState(DEFAULT_PRICE_MODE)
  const [pendingPriceMode, setPendingPriceMode] = useState(null)
  const [detailItem,    setDetailItem]   = useState(null)
  const productScrollRef = useRef(null)
  const savedMenuScrollRef = useRef(0)
  const shouldOpenOrderPanel = searchParams.get('panel') === 'order'
  const isManageOrderPanel = shouldOpenOrderPanel
  const routeOrderType = isTakeAwayFlow
    ? normalizeOrderType(searchParams.get('orderType') || searchParams.get('type') || 'take_away')
    : 'dine_in'

  const table = isTakeAwayFlow ? null : state.tables.find(t => t.id === tableId)
  const orderTitle = isTakeAwayFlow
    ? orderTypeLabel(orderType, lang)
    : table?.name || table?.label || `${t(lang, 'table')} ${table?.number || tableId}`
  const orderContextLabel = isTakeAwayFlow
    ? (lang === 'uz' ? 'Buyurtma turi' : lang === 'ru' ? 'Тип заказа' : 'Order type')
    : t(lang, 'table')

  // Merge all active orders for this table
  const activeOrder = useMemo(() => {
    if (isTakeAwayFlow) return null
    const orders = state.orders.filter(o => o.table_id === tableId && o.payment_status !== 'paid')
    if (orders.length === 0) return null
    const merged = { ...orders[0] }
    merged.items = orders.flatMap(o => (o.items || []).map(item => ({
      ...item,
      order_id: item.order_id || o.id,
      _orderId: o.id,
      order_number: item.order_number || o.order_number,
      table_name: item.table_name || o.table_name,
      waiter_name: item.waiter_name || o.waiter_name,
      created_at: item.created_at || o.created_at,
    })))
    const priority = ['needs_bill', 'preparing', 'sent_to_kitchen', 'delivered']
    for (const p of priority) {
      if (orders.some(o => o.status === p)) { merged.status = p; break }
    }
    return merged
  }, [state.orders, tableId, isTakeAwayFlow])

  useEffect(() => {
    if (isSendingOrder || pendingPriceMode) return
    setPriceMode(normalizePriceMode(activeOrder?.price_mode || DEFAULT_PRICE_MODE))
  }, [activeOrder?.id, activeOrder?.price_mode, isSendingOrder, pendingPriceMode])

  useEffect(() => {
    if (!shouldOpenOrderPanel || detailItem) return
    setCartOpen(true)
  }, [shouldOpenOrderPanel, detailItem, activeOrder?.id])

  // Cart lookups
  const cartQtyMap = useMemo(() => {
    const map = {}
    state.cart.forEach(i => { map[i.menu_item_id] = i.quantity })
    return map
  }, [state.cart])

  const cartNotesMap = useMemo(() => {
    const map = {}
    state.cart.forEach(i => { if (i.notes) map[i.menu_item_id] = i.notes })
    return map
  }, [state.cart])

  const cartCount = state.cart.reduce((s, i) => s + i.quantity, 0)
  const isManageOrderOnly = isManageOrderPanel && cartCount === 0
  const configuredServiceRatePct = normalizeServiceRatePct(state.settings?.serviceRate)
  const cartSummary = useMemo(() => {
    const serviceRatePct = isOffPremiseOrderType(orderType) ? 0 : configuredServiceRatePct
    return getOrderPaymentSummary({ order_type: orderType, service_rate_pct: serviceRatePct }, state.cart, configuredServiceRatePct)
  }, [configuredServiceRatePct, orderType, state.cart])

  // Categories
  const sortedCategories = useMemo(() =>
    [...state.categories]
      .filter(isCustomerMenuCategory)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories]
  )

  const visibleCategoryIds = useMemo(
    () => new Set(sortedCategories.map(category => category.id)),
    [sortedCategories]
  )

  const categoryItemCounts = useMemo(() => {
    const counts = { all: 0 }
    state.menuItems.forEach(item => {
      if (!isCustomerMenuItem(item)) return
      if (item.category_id && !visibleCategoryIds.has(item.category_id)) return
      counts.all = (counts.all || 0) + 1
      counts[item.category_id] = (counts[item.category_id] || 0) + 1
    })
    return counts
  }, [state.menuItems, visibleCategoryIds])

  const allCategoryCards = useMemo(() => [
    { id: 'all' },
    ...sortedCategories,
  ], [sortedCategories])

  // Filtered items
  const q = search.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    return state.menuItems
      .filter(item => {
        if (!isCustomerMenuItem(item)) return false
        if (item.category_id && !visibleCategoryIds.has(item.category_id)) return false
        const matchSearch = !q || [item.name_uz, item.name_ru, item.name_en].some(n => n?.toLowerCase().includes(q))
        return matchSearch
      })
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
  }, [state.menuItems, visibleCategoryIds, q])

  const pricedFilteredItems = useMemo(
    () => filteredItems.map(item => getMenuItemForPriceMode(item, priceMode)),
    [filteredItems, priceMode]
  )

  // Grouped sections when "All" is selected without a search query
  const sections = useMemo(() => {
    return sortedCategories
      .map(cat => ({ cat, items: pricedFilteredItems.filter(i => i.category_id === cat.id) }))
      .filter(s => s.items.length > 0)
  }, [sortedCategories, pricedFilteredItems])

  // Category lookup map (for product detail page)
  const categoryMap = useMemo(() => {
    const map = {}
    state.categories.forEach(c => { map[c.id] = c })
    return map
  }, [state.categories])

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(item => { map[item.id] = item })
    return map
  }, [state.menuItems])

  // ── Cart handlers ──────────────────────────────────────────────────────────

  function handleAdd(item) {
    if (isSendingOrder) return
    dispatch({ type: 'ADD_TO_CART', payload: makeCartPayload(item) })
  }

  function handleIncrement(item) {
    if (isSendingOrder) return
    dispatch({ type: 'ADD_TO_CART', payload: makeCartPayload(item) })
  }

  function handleDecrement(item) {
    if (isSendingOrder) return
    const qty = (cartQtyMap[item.id] || 0) - 1
    if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: item.id })
    else dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.id, qty } })
  }

  // ── Modal handlers ─────────────────────────────────────────────────────────

  function openDetail(item) {
    if (isSendingOrder) return
    savedMenuScrollRef.current = productScrollRef.current?.scrollTop ?? 0
    setDetailItem(item)
  }

  function handleProductDetailAdd(item, qty, notes) {
    if (isSendingOrder) return
    const alreadyInCart = (cartQtyMap[item.id] || 0) > 0
    if (!alreadyInCart) {
      dispatch({ type: 'ADD_TO_CART', payload: makeCartPayload(item) })
    }
    dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.id, qty } })
    dispatch({ type: 'UPDATE_CART_NOTES', payload: { menu_item_id: item.id, notes: notes || '' } })
    setDetailItem(null)
  }

  function makeCartPayload(item) {
    const pricedItem = getMenuItemForPriceMode(item, priceMode)
    return {
      menu_item_id: pricedItem.id,
      name: getItemName(pricedItem, lang),
      price: pricedItem.unit_price,
      base_price: pricedItem.base_price,
      unit_price: pricedItem.unit_price,
      price_mode: pricedItem.price_mode,
    }
  }

  function requestPriceModeChange(nextMode) {
    const normalized = normalizePriceMode(nextMode)
    if (normalized === priceMode || isSendingOrder) return
    const hasPricedItems = cartCount > 0 || ((activeOrder?.items || []).length > 0 && activeOrder?.payment_status !== 'paid')
    if (hasPricedItems) {
      setPendingPriceMode(normalized)
      return
    }
    setPriceMode(normalized)
  }

  function confirmPriceModeChange() {
    if (!pendingPriceMode) return
    const nextMode = pendingPriceMode
    setPriceMode(nextMode)
    dispatch({ type: 'UPDATE_CART_PRICE_MODE', payload: { priceMode: nextMode } })
    if (activeOrder?.id || tableId) {
      dispatch({ type: 'UPDATE_ORDER_PRICE_MODE', payload: { tableId, priceMode: nextMode } })
    }
    setPendingPriceMode(null)
  }

  function handleSignOut() {
    dispatch({ type: 'LOGOUT' })
    signOut?.()
  }

  React.useEffect(() => {
    if (!detailItem && savedMenuScrollRef.current > 0) {
      requestAnimationFrame(() => {
        if (productScrollRef.current) {
          productScrollRef.current.scrollTop = savedMenuScrollRef.current
        }
      })
    }
  }, [detailItem])

  React.useEffect(() => {
    dispatch({ type: 'SET_TABLE', payload: isTakeAwayFlow ? null : tableId })
    if (isTakeAwayFlow) setOrderType(routeOrderType)
    return () => dispatch({ type: 'CLEAR_CART' })
    // dispatch is intentionally omitted because AppContext recreates dbDispatch after state updates.
    // Including it here would clear the cart after every add/increment render.
  }, [isTakeAwayFlow, tableId, routeOrderType])

  if (!loaded || loadError) {
    return (
      <div className="flex overflow-hidden bg-[#FAF7F0]" style={{ height: '100dvh' }}>
        {shouldShowSidebar && (
          <div className="hidden lg:block flex-shrink-0 h-full">
            <UnifiedSidebar />
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {!loaded ? (
            <OperationalLoading
              title={lang === 'uz' ? 'Buyurtma ekrani yuklanmoqda' : lang === 'ru' ? 'Загрузка экрана заказа' : 'Loading order screen'}
              description={lang === 'uz' ? 'Stollar, menyu va buyurtmalar olinmoqda.' : lang === 'ru' ? 'Получаем столы, меню и заказы.' : 'Fetching tables, menu, and orders.'}
            />
          ) : (
            <OperationalError
              title={lang === 'uz' ? 'Buyurtmani yuklab bo‘lmadi' : lang === 'ru' ? 'Не удалось загрузить заказ' : 'Could not load order'}
              description={loadError}
              actionLabel={lang === 'uz' ? 'Qayta yuklash' : lang === 'ru' ? 'Перезагрузить' : 'Reload'}
              onAction={() => window.location.reload()}
            />
          )}
        </div>
      </div>
    )
  }

  if (!isTakeAwayFlow && !table) {
    return (
      <div className="min-h-screen bg-[#FAF7F0] flex items-center justify-center">
        <div className="text-center">
          <UtensilsCrossed size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="mb-4 text-sm text-gray-400">{t(lang, 'tableNotFound')}</p>
          <button onClick={() => navigate('/waiter/tables')} className="text-[#ff5a00] font-semibold hover:underline text-sm">
            {t(lang, 'back')}
          </button>
        </div>
      </div>
    )
  }

  // ── Shared card props ─────────────────────────────────────────────────────
  const cardProps = {
    cartQtyMap, lang,
    onAdd:        handleAdd,
    onIncrement:  handleIncrement,
    onDecrement:  handleDecrement,
    onOpenDetail: openDetail,
  }

  return (
    <div className="flex overflow-hidden bg-[#FAF7F0]" style={{ height: '100dvh' }}>

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      {shouldShowSidebar && !detailItem && (
      <div className="hidden lg:block flex-shrink-0 h-full">
        <UnifiedSidebar />
      </div>
      )}

      {/* ── Mobile sidebar overlay ───────────────────────────────────────── */}
      {shouldShowSidebar && !detailItem && sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full">
            <UnifiedSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Center column ───────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {detailItem ? (
          <ProductDetailPage
            item={detailItem}
            category={categoryMap[detailItem.category_id]}
            currentQty={cartQtyMap[detailItem.id] || 0}
            currentNotes={cartNotesMap[detailItem.id] || ''}
            lang={lang}
            onBack={() => setDetailItem(null)}
            onCancel={() => setDetailItem(null)}
            onAddToCart={handleProductDetailAdd}
          />
        ) : (
          <>

        {/* Public-menu style search */}
        <div className="flex-shrink-0 px-4 pt-4 pb-0">
          <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className={`lg:hidden p-2 -ml-1 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0 ${shouldShowSidebar ? '' : 'hidden'}`}
          >
            <MenuIcon size={20} className="text-[#6B7280]" />
          </button>

          {/* Back to Tables */}
          <button
            onClick={() => { if (!isSendingOrder) navigate('/waiter/tables') }}
            disabled={isSendingOrder}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-[#E5E7EB] text-[#6B7280] hover:text-[#ff5a00] hover:border-orange-300 hover:bg-orange-50 transition-colors flex-shrink-0"
            title={lang === 'uz' ? 'Stollar' : lang === 'ru' ? 'Столы' : 'Tables'}
          >
            <ArrowLeft size={17} />
          </button>

          <div className="min-w-[92px] max-w-[180px] flex-shrink-0 sm:max-w-[240px]">
            <p className="truncate text-[10px] font-black uppercase tracking-wide text-[#9CA3AF]">{orderContextLabel}</p>
            <h1 className="truncate text-sm font-black leading-tight text-[#1F2937] sm:text-base">{orderTitle}</h1>
          </div>

          <div className="flex flex-shrink-0 rounded-xl bg-[#F3F4F6] p-1">
            {['regular', 'tourist'].map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => requestPriceModeChange(mode)}
                disabled={isSendingOrder}
                className={`h-8 rounded-lg px-3 text-[12px] font-black transition-all disabled:cursor-wait disabled:opacity-60 ${
                  priceMode === mode
                    ? 'bg-white text-[#ff5a00] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#1F2937]'
                }`}
              >
                {getPriceModeLabel(mode, lang)}
              </button>
            ))}
          </div>

          <AnimatedSearch
            value={search}
            onChange={setSearch}
            placeholder={lang === 'uz' ? 'Menyu qidirish...' : lang === 'ru' ? 'Поиск по меню...' : 'Search menu...'}
            searchLabel={lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search'}
            clearLabel={lang === 'uz' ? 'Qidiruvni tozalash' : lang === 'ru' ? 'Очистить поиск' : 'Clear search'}
            closeLabel={lang === 'uz' ? 'Qidiruvni yopish' : lang === 'ru' ? 'Закрыть поиск' : 'Close search'}
          />

          <button
            onClick={() => setCartOpen(true)}
            className={`relative ml-auto flex-shrink-0 rounded-xl border font-black transition-all active:scale-[0.98] ${
              cartCount > 0
                ? 'bg-[#ff5a00] border-[#ff5a00] text-white shadow-md shadow-orange-100 hover:bg-[#e64d00]'
                : 'bg-white border-[#E5E7EB] text-[#6B7280] hover:border-orange-200 hover:bg-orange-50'
            }`}
            title={cartCount > 0
              ? `${cartCount} ${lang === 'uz' ? 'ta' : lang === 'ru' ? 'поз.' : 'items'} · ${formatCurrency(cartSummary.total)}`
              : lang === 'uz' ? "Savat bo'sh" : lang === 'ru' ? 'Корзина пуста' : 'Cart is empty'}
          >
            <span className="flex h-10 items-center gap-2 px-3 sm:px-4">
              <ShoppingCart size={17} />
              <span className="hidden sm:inline whitespace-nowrap text-[13px]">
                {cartCount > 0
                  ? `${cartCount} ${lang === 'uz' ? 'ta' : lang === 'ru' ? 'поз.' : 'items'} · ${formatCurrency(cartSummary.total)}`
                  : lang === 'uz' ? "Savat bo'sh" : lang === 'ru' ? 'Корзина пуста' : 'Cart is empty'}
              </span>
            </span>
            {cartCount > 0 && (
              <span className="sm:hidden absolute -top-1.5 -right-1.5 bg-[#1F2937] text-white text-[9px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {cartCount}
              </span>
            )}
          </button>
          {!shouldShowSidebar && (
            <div className="flex items-center gap-1.5">
              {['uz', 'ru', 'en'].map(l => (
                <button
                  key={l}
                  onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-colors ${
                    lang === l ? 'bg-[#ff5a00] text-white' : 'bg-gray-100 text-[#6B7280] hover:bg-gray-200'
                  }`}
                >
                  {l}
                </button>
              ))}
              <button
                onClick={handleSignOut}
                className="p-2 rounded-xl text-[#6B7280] hover:text-red-500 hover:bg-red-50 transition-colors"
                title={lang === 'uz' ? 'Chiqish' : lang === 'ru' ? 'Выйти' : 'Logout'}
              >
                <LogOut size={16} />
              </button>
            </div>
          )}

            </div>
          </div>
        </div>

        {/* Product area */}
        <div ref={productScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-0">
          <MenuCategoryScroller
            categories={allCategoryCards}
            activeCategoryId={activeCategory}
            onCategoryClick={setCategory}
            onActiveCategoryChange={setCategory}
            lang={lang}
            itemCounts={categoryItemCounts}
            sectionPrefix="waiter-menu-category"
            scrollContainerRef={productScrollRef}
            className="pt-4 mb-4"
            collapsedClassName="-mx-4 px-4"
          />
          {pricedFilteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#9CA3AF]">
              <Search size={36} className="mb-3 opacity-20" />
              <p className="text-sm font-semibold">
                {lang === 'uz' ? 'Mahsulot topilmadi' : lang === 'ru' ? 'Ничего не найдено' : 'No items found'}
              </p>
              {search && (
                <button onClick={() => setSearch('')} className="mt-2 text-xs text-[#ff5a00] hover:underline">
                  {lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить' : 'Clear search'}
                </button>
              )}
            </div>
          ) : sections ? (
            // Grouped by category when "All" selected, no search
            <div className="space-y-8">
              {sections.map(({ cat, items }) => (
                <div
                  key={cat.id}
                  id={menuCategorySectionId('waiter-menu-category', cat.id)}
                  className="scroll-mt-20"
                >
                  <ProductSection
                    cat={cat}
                    items={items}
                    eagerCount={sections[0]?.cat.id === cat.id ? 6 : 0}
                    {...cardProps}
                  />
                </div>
              ))}
            </div>
          ) : (
            // Flat grid for specific category or search results
            <div className="grid grid-cols-2 min-[700px]:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
              {pricedFilteredItems.map((item, index) => (
                <ProductCard
                  key={item.id}
                  item={item}
                  qty={cartQtyMap[item.id] || 0}
                  lang={lang}
                  eager={index < 8}
                  density="compact"
                  onAdd={handleAdd}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onOpenDetail={openDetail}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom table chips */}
        {!isTakeAwayFlow && (
          <BottomTableChips
            currentTableId={tableId}
            onNewOrder={() => { if (!isSendingOrder) navigate('/waiter/tables') }}
          />
        )}
          </>
        )}
      </div>

      {/* ── Cart drawer ─────────────────────────────────────────────────── */}
      {!detailItem && cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => { if (!isSendingOrder) setCartOpen(false) }} />
          <div className="relative flex h-full w-full max-w-full flex-col overflow-hidden bg-white shadow-[-12px_0_32px_rgba(15,23,42,0.16)] sm:max-w-[420px] lg:max-w-[460px]">
            {isManageOrderOnly && (
              <button
                type="button"
                onClick={() => { if (!isSendingOrder) setCartOpen(false) }}
                disabled={isSendingOrder}
                className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/90 text-[#9CA3AF] shadow-sm ring-1 ring-gray-100 transition-colors hover:bg-gray-100 hover:text-[#6B7280] disabled:cursor-wait disabled:opacity-50"
                title={lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close'}
              >
                <X size={16} />
              </button>
            )}
            <div className={`${isManageOrderOnly ? 'flex-1 pt-14' : 'max-h-[48dvh] flex-shrink-0'} overflow-y-auto overscroll-contain`}>
              <OrderActionPanel
                order={activeOrder}
                tableId={tableId}
                lang={lang}
                dispatch={dispatch}
                cartCount={cartCount}
                menuItemMap={menuItemMap}
                restaurantName={state.settings?.restaurantName}
                viewerRole={role}
              />
            </div>
            {!isManageOrderOnly && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <CartPanel
                tableName={orderTitle}
                orderType={orderType}
                onOrderTypeChange={setOrderType}
                priceMode={priceMode}
                allowOrderTypeChange
                isSending={isSendingOrder}
                onSendingChange={setSendingOrder}
                onClose={() => { if (!isSendingOrder) setCartOpen(false) }}
              />
            </div>
            )}
          </div>
        </div>
      )}

      {pendingPriceMode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-[380px] rounded-2xl border border-orange-100 bg-white p-5 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-wide text-[#ff5a00]">
              {lang === 'uz' ? 'Menyu turini o‘zgartirish' : lang === 'ru' ? 'Изменить тип меню' : 'Change menu type'}
            </p>
            <h2 className="mt-2 text-xl font-black text-[#1F2937]">
              {getPriceModeLabel(priceMode, lang)} → {getPriceModeLabel(pendingPriceMode, lang)}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#6B7280]">
              {lang === 'uz'
                ? 'Savatdagi va shu stolning to‘lanmagan mahsulotlari yangi narx bo‘yicha qayta hisoblanadi.'
                : lang === 'ru'
                  ? 'Позиции в корзине и неоплаченные позиции этого стола будут пересчитаны по новому типу меню.'
                  : 'Cart items and unpaid items on this table will be recalculated with the new menu type.'}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPendingPriceMode(null)}
                className="h-11 flex-1 rounded-xl border border-[#E5E7EB] bg-white text-sm font-black text-[#6B7280] hover:bg-gray-50"
              >
                {lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={confirmPriceModeChange}
                className="h-11 flex-1 rounded-xl bg-[#ff5a00] text-sm font-black text-white hover:bg-[#e64d00]"
              >
                {lang === 'uz' ? 'Qayta hisoblash' : lang === 'ru' ? 'Пересчитать' : 'Recalculate'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
