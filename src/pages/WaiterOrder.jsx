import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Search, ShoppingCart, Plus, UtensilsCrossed,
  Menu as MenuIcon, X, CheckCircle2, Clock,
  ChefHat, Receipt, Loader2, ArrowLeft, LogOut,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t, getItemName, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { getOrderPaymentSummary, normalizeServiceRatePct } from '../lib/analytics'
import CartPanel from '../components/CartPanel'
import UnifiedSidebar from '../components/UnifiedSidebar'
import MenuCategoryScroller, { menuCategorySectionId } from '../components/MenuCategoryScroller'
import { ProductCard, ProductDetailPage } from '../components/MenuProductCards'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useAppDataStatus } from '../store/appHooks'

// ── OrderActionPanel ───────────────────────────────────────────────────────────
function OrderActionPanel({ order, tableId, lang, dispatch, cartCount }) {
  const [busy, setBusy] = useState(false)

  if (!order) return null
  if (cartCount > 0) return null

  const items       = order.items || []
  const newCount    = items.filter(i => i.status === 'new').length
  const prepCount   = items.filter(i => i.status === 'preparing').length
  const readyCount  = items.filter(i => i.status === 'ready').length
  const inKitchen   = newCount > 0 || prepCount > 0
  const allReady    = items.length > 0 && !inKitchen
  const isDelivered = !inKitchen && order.status === 'delivered'
  const isNeedsBill = !inKitchen && order.status === 'needs_bill'

  const L = {
    uz: {
      kitchenTitle: 'Oshxonada tayyorlanmoqda',
      kitchenSub: (n, p) => [n > 0 && `${n} yangi`, p > 0 && `${p} tayyorlanmoqda`].filter(Boolean).join(' · '),
      readyTitle: 'Barcha taomlar tayyor!',
      readySub: 'Mijozga yetkazilganini tasdiqlang',
      confirmBtn: 'Yetkazildi ✓',
      deliveredTitle: 'Yetkazildi',
      deliveredSub: 'Hisob so\'rash mumkin',
      billBtn: 'Hisob so\'rash',
      needsBillTitle: 'Hisob so\'raldi',
      needsBillSub: 'Kassir to\'lovni qayta ishlaydi',
    },
    ru: {
      kitchenTitle: 'Готовится на кухне',
      kitchenSub: (n, p) => [n > 0 && `${n} новых`, p > 0 && `${p} готовится`].filter(Boolean).join(' · '),
      readyTitle: 'Все блюда готовы!',
      readySub: 'Подтвердите, что заказ подан гостю',
      confirmBtn: 'Подано ✓',
      deliveredTitle: 'Подано',
      deliveredSub: 'Можно запросить счёт',
      billBtn: 'Запросить счёт',
      needsBillTitle: 'Счёт запрошен',
      needsBillSub: 'Кассир обрабатывает оплату',
    },
    en: {
      kitchenTitle: 'Kitchen is preparing',
      kitchenSub: (n, p) => [n > 0 && `${n} new`, p > 0 && `${p} preparing`].filter(Boolean).join(' · '),
      readyTitle: 'All items ready!',
      readySub: 'Confirm the order has been served to the guest',
      confirmBtn: 'Mark as Served ✓',
      deliveredTitle: 'Order Served',
      deliveredSub: 'You can now request the bill',
      billBtn: 'Request Bill',
      needsBillTitle: 'Bill Requested',
      needsBillSub: 'Cashier is processing payment',
    },
  }
  const l = L[lang] || L.en

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

  if (inKitchen) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-orange-100 bg-[#fff7ed] px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
          <ChefHat size={16} className="text-[#ff5a00]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-[#ff5a00]">{l.kitchenTitle}</p>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">{l.kitchenSub(newCount, prepCount)}</p>
        </div>
        {readyCount > 0 && (
          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full flex-shrink-0">
            {readyCount} {lang === 'uz' ? 'tayyor' : lang === 'ru' ? 'готово' : 'ready'}
          </span>
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
      <div className="mx-4 mb-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
          <Clock size={16} className="text-[#DC2626]" />
        </div>
        <div>
          <p className="text-[13px] font-bold text-[#DC2626]">{l.needsBillTitle}</p>
          <p className="text-[11px] text-[#9CA3AF] mt-0.5">{l.needsBillSub}</p>
        </div>
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
    sent_to_kitchen: { en: 'Kitchen', uz: 'Oshxona', ru: 'Кухня',   cls: 'bg-orange-100 text-[#ff5a00]' },
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
function ProductSection({ cat, items, cartQtyMap, lang, onAdd, onIncrement, onDecrement, onOpenDetail }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <h2 className="font-black text-[18px] text-[#1F2937]">{getCategoryName(cat, lang)}</h2>
        <span className="bg-[#F3F4F6] text-[#6B7280] text-[12px] font-bold px-2.5 py-0.5 rounded-full">
          {items.length}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {items.map(item => (
          <ProductCard
            key={item.id}
            item={item}
            qty={cartQtyMap[item.id] || 0}
            lang={lang}
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
  const [detailItem,    setDetailItem]   = useState(null)
  const productScrollRef = useRef(null)

  const table = isTakeAwayFlow ? null : state.tables.find(t => t.id === tableId)
  const orderTitle = isTakeAwayFlow
    ? (lang === 'uz' ? 'Olib ketish buyurtmasi' : lang === 'ru' ? 'Заказ с собой' : 'Take Away Order')
    : table?.name

  // Merge all active orders for this table
  const activeOrder = useMemo(() => {
    if (isTakeAwayFlow) return null
    const orders = state.orders.filter(o => o.table_id === tableId && o.payment_status !== 'paid')
    if (orders.length === 0) return null
    const merged = { ...orders[0] }
    merged.items = orders.flatMap(o => o.items || [])
    const priority = ['needs_bill', 'preparing', 'sent_to_kitchen', 'delivered']
    for (const p of priority) {
      if (orders.some(o => o.status === p)) { merged.status = p; break }
    }
    return merged
  }, [state.orders, tableId, isTakeAwayFlow])

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
  const configuredServiceRatePct = normalizeServiceRatePct(state.settings?.serviceRate)
  const cartSummary = useMemo(() => {
    const serviceRatePct = orderType === 'take_away' ? 0 : configuredServiceRatePct
    return getOrderPaymentSummary({ order_type: orderType, service_rate_pct: serviceRatePct }, state.cart, configuredServiceRatePct)
  }, [configuredServiceRatePct, orderType, state.cart])

  // Categories
  const sortedCategories = useMemo(() =>
    [...state.categories].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories]
  )

  const categoryItemCounts = useMemo(() => {
    const counts = { all: 0 }
    state.menuItems.forEach(item => {
      if (!item.available) return
      counts.all = (counts.all || 0) + 1
      counts[item.category_id] = (counts[item.category_id] || 0) + 1
    })
    return counts
  }, [state.menuItems])

  const allCategoryCards = useMemo(() => [
    { id: 'all' },
    ...sortedCategories,
  ], [sortedCategories])

  // Filtered items
  const q = search.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    return state.menuItems
      .filter(item => {
        if (!item.available) return false
        const matchSearch = !q || [item.name_uz, item.name_ru, item.name_en].some(n => n?.toLowerCase().includes(q))
        return matchSearch
      })
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
  }, [state.menuItems, q])

  // Grouped sections when "All" is selected without a search query
  const sections = useMemo(() => {
    return sortedCategories
      .map(cat => ({ cat, items: filteredItems.filter(i => i.category_id === cat.id) }))
      .filter(s => s.items.length > 0)
  }, [sortedCategories, filteredItems])

  // Category lookup map (for product detail page)
  const categoryMap = useMemo(() => {
    const map = {}
    state.categories.forEach(c => { map[c.id] = c })
    return map
  }, [state.categories])

  // ── Cart handlers ──────────────────────────────────────────────────────────

  function handleAdd(item) {
    if (isSendingOrder) return
    dispatch({ type: 'ADD_TO_CART', payload: { menu_item_id: item.id, name: getItemName(item, lang), price: item.price } })
  }

  function handleIncrement(item) {
    if (isSendingOrder) return
    dispatch({ type: 'ADD_TO_CART', payload: { menu_item_id: item.id, name: getItemName(item, lang), price: item.price } })
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
    setDetailItem(item)
  }

  function handleProductDetailAdd(item, qty, notes) {
    if (isSendingOrder) return
    const alreadyInCart = (cartQtyMap[item.id] || 0) > 0
    if (!alreadyInCart) {
      dispatch({ type: 'ADD_TO_CART', payload: { menu_item_id: item.id, name: getItemName(item, lang), price: item.price } })
    }
    dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.id, qty } })
    dispatch({ type: 'UPDATE_CART_NOTES', payload: { menu_item_id: item.id, notes: notes || '' } })
    setDetailItem(null)
  }

  function handleSignOut() {
    dispatch({ type: 'LOGOUT' })
    signOut?.()
  }

  React.useEffect(() => {
    dispatch({ type: 'SET_TABLE', payload: isTakeAwayFlow ? null : tableId })
    if (isTakeAwayFlow) setOrderType('take_away')
    return () => dispatch({ type: 'CLEAR_CART' })
    // dispatch is intentionally omitted because AppContext recreates dbDispatch after state updates.
    // Including it here would clear the cart after every add/increment render.
  }, [isTakeAwayFlow, tableId])

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
            <div className="flex items-center gap-3">
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

          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
            <input
              type="text"
              placeholder={lang === 'uz' ? 'Menyu qidirish...' : lang === 'ru' ? 'Поиск по меню...' : 'Search menu...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-[14px] text-[#1F2937] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] focus:bg-white transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]">
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={() => setCartOpen(true)}
            className={`relative flex-shrink-0 rounded-xl border font-black transition-all active:scale-[0.98] ${
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
          {filteredItems.length === 0 ? (
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
                    {...cardProps}
                  />
                </div>
              ))}
            </div>
          ) : (
            // Flat grid for specific category or search results
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredItems.map(item => (
                <ProductCard
                  key={item.id}
                  item={item}
                  qty={cartQtyMap[item.id] || 0}
                  lang={lang}
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
            <div className="flex-shrink-0">
              <OrderActionPanel
                order={activeOrder}
                tableId={tableId}
                lang={lang}
                dispatch={dispatch}
                cartCount={cartCount}
              />
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <CartPanel
                tableName={orderTitle}
                orderType={orderType}
                onOrderTypeChange={setOrderType}
                allowOrderTypeChange={!isTakeAwayFlow}
                isSending={isSendingOrder}
                onSendingChange={setSendingOrder}
                onClose={() => { if (!isSendingOrder) setCartOpen(false) }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
