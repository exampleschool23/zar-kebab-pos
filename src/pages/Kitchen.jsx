import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UtensilsCrossed, Clock, CheckCircle2, AlertCircle, Volume2, ArrowLeft,
  Bell, MoreHorizontal, ChefHat, Loader2,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import UnifiedSidebar from '../components/UnifiedSidebar'

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_BADGE = {
  new:       'bg-[#DBEAFE] text-[#2563EB] border border-[#BFDBFE]',
  preparing: 'bg-[#FFF1E8] text-[#FF5A00] border border-[#FDBA74]',
  ready:     'bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]',
  served:    'bg-gray-100 text-gray-500 border border-gray-200',
}

function statusSort(s) {
  return s === 'new' ? 0 : s === 'preparing' ? 1 : 2
}

function elapsedSince(iso) {
  if (!iso) return null
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1)  return '< 1 min'
  if (diff < 60) return `${diff} min ago`
  return `${Math.floor(diff / 60)}h ${diff % 60}m ago`
}

function statusLabel(status, lang) {
  const map = {
    uz: { new: 'Yangi', preparing: 'Tayyorlanmoqda', ready: 'Tayyor', served: 'Berildi' },
    ru: { new: 'Новый', preparing: 'Готовится',      ready: 'Готово',  served: 'Подано'  },
    en: { new: 'New',   preparing: 'Preparing',       ready: 'Ready',   served: 'Served'  },
  }
  return (map[lang] || map.en)[status] || status
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
// ── Header ─────────────────────────────────────────────────────────────────────
function KitchenHeader({ lang, onLangChange }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'owner'
  const title = lang === 'uz' ? 'Oshxona Displey' : lang === 'ru' ? 'Дисплей кухни' : 'Kitchen Display'

  return (
    <header className="flex-shrink-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="lg:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
        )}
        {/* Mobile logo */}
        <div className="lg:hidden w-8 h-8 bg-[#ff5a00] rounded-xl flex items-center justify-center flex-shrink-0">
          <UtensilsCrossed size={14} className="text-white" />
        </div>
        <div>
          <p className="font-black text-gray-900 text-[15px] leading-tight">Zar Kebab</p>
          <p className="text-[#ff5a00] text-[11px] font-bold leading-none mt-0.5">{title}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Lang switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {['uz', 'ru', 'en'].map(l => (
            <button
              key={l}
              onClick={() => onLangChange(l)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-colors ${
                lang === l ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <button className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 hover:border-[#ff5a00]/40 hover:text-[#ff5a00] text-gray-400 transition-colors">
          <Volume2 size={16} />
        </button>
      </div>
    </header>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner({ color = 'text-white' }) {
  return (
    <svg className={`animate-spin w-4 h-4 ${color}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

// ── Kitchen item row ───────────────────────────────────────────────────────────
function KitchenItem({ item, orderId, menuItem, lang, onMark }) {
  const [busy,    setBusy]    = useState(false)  // button locked while animating
  const [flash,   setFlash]   = useState(false)  // card highlight on status change
  const prevStatus = useRef(item.status)

  // Flash the card whenever status changes (driven by parent state update)
  useEffect(() => {
    if (prevStatus.current !== item.status) {
      prevStatus.current = item.status
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 600)
      return () => clearTimeout(t)
    }
  }, [item.status])

  function handleMark(nextStatus) {
    if (busy) return
    setBusy(true)
    // Use item._orderId (real order) when items are merged across orders
    onMark(orderId, item.menu_item_id, nextStatus, item._orderId || orderId)
    setTimeout(() => setBusy(false), 700)
  }

  const isNew       = item.status === 'new'
  const isPreparing = item.status === 'preparing'
  const isReady     = item.status === 'ready' || item.status === 'served'

  const title = menuItem
    ? (menuItem[`name_${lang}`] || menuItem.name_en || menuItem.name_uz || item.name)
    : item.name

  const desc = menuItem
    ? (menuItem[`description_${lang}`] || menuItem.description_en || menuItem.description_uz || '')
    : ''

  return (
    <div className={`flex gap-3 rounded-2xl border p-3 transition-all duration-300 ${
      flash
        ? isReady
          ? 'bg-[#dcfce7] border-[#86efac] scale-[1.01]'
          : 'bg-[#fff7ed] border-[#fdba74] scale-[1.01]'
        : isReady
          ? 'bg-[#f0fdf4] border-[#bbf7d0]'
          : 'bg-white border-gray-100 shadow-sm'
    }`}>
      {/* Thumbnail */}
      <div className="w-[76px] h-[76px] rounded-xl overflow-hidden flex-shrink-0 bg-orange-50 border border-gray-100">
        {menuItem?.image_url ? (
          <img src={menuItem.image_url} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UtensilsCrossed size={22} className="text-orange-200" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title + qty + badge */}
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <div className="flex items-baseline gap-2 min-w-0 flex-1">
            <p className="font-black text-[14px] text-[#1F2937] leading-snug line-clamp-1">{title}</p>
            <span className="font-black text-[13px] text-[#ff5a00] flex-shrink-0">×{item.quantity}</span>
          </div>
          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-all duration-300 ${STATUS_BADGE[item.status] || STATUS_BADGE.new}`}>
            {statusLabel(item.status, lang)}
          </span>
        </div>

        {desc && (
          <p className="text-[11px] text-[#6B7280] line-clamp-1 leading-snug mb-1.5">{desc}</p>
        )}

        {item.notes && (
          <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
            <AlertCircle size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-semibold leading-snug">{item.notes}</p>
          </div>
        )}

        {/* Action button */}
        {isNew && (
          <button
            onClick={() => handleMark('preparing')}
            disabled={busy}
            className={`w-full py-2 rounded-xl text-[12px] font-black flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] ${
              busy
                ? 'bg-orange-300 text-white cursor-not-allowed'
                : 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-sm shadow-orange-200'
            }`}
          >
            {busy ? <Spinner /> : null}
            {statusLabel('preparing', lang)}
          </button>
        )}

        {isPreparing && (
          <button
            onClick={() => handleMark('ready')}
            disabled={busy}
            className={`w-full py-2 rounded-xl text-[12px] font-black flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.97] ${
              busy
                ? 'bg-green-200 text-green-500 cursor-not-allowed border border-green-200'
                : 'bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] hover:bg-[#16A34A] hover:text-white'
            }`}
          >
            {busy ? <Spinner color="text-green-500" /> : null}
            {statusLabel('ready', lang)}
          </button>
        )}

        {isReady && (
          <div className={`flex items-center gap-1.5 text-[#16A34A] text-[12px] font-black mt-0.5 transition-all duration-300 ${flash ? 'scale-105' : ''}`}>
            <CheckCircle2 size={15} />
            {statusLabel('ready', lang)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Order card ─────────────────────────────────────────────────────────────────
function OrderCard({ order, menuItemMap, lang, onMark }) {
  const [bulkBusy, setBulkBusy] = useState(false)
  const elapsed = elapsedSince(order.created_at)

  const sortedItems = useMemo(
    () => [...order.items].sort((a, b) => statusSort(a.status) - statusSort(b.status)),
    [order.items]
  )

  const newCount       = order.items.filter(i => i.status === 'new').length
  const preparingCount = order.items.filter(i => i.status === 'preparing').length
  const readyCount     = order.items.filter(i => ['ready', 'served'].includes(i.status)).length
  const allReady       = newCount === 0 && preparingCount === 0

  const waiterLabel = lang === 'uz' ? 'Ofitsiant' : lang === 'ru' ? 'Официант' : 'Waiter'

  const markAllLabel = {
    preparing: lang === 'uz' ? 'Hammasini tayyorlanmoqda' : lang === 'ru' ? 'Все готовятся' : 'All Preparing',
    ready:     lang === 'uz' ? 'Hammasi tayyor'           : lang === 'ru' ? 'Все готово'    : 'All Ready',
  }

  function handleBulk(fromStatus, toStatus) {
    if (bulkBusy) return
    setBulkBusy(true)
    order.items
      .filter(i => i.status === fromStatus)
      .forEach(i => onMark(order.id, i.menu_item_id, toStatus, i._orderId || order.id))
    setTimeout(() => setBulkBusy(false), 700)
  }

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden flex flex-col shadow-sm ${
      allReady ? 'border-[#BBF7D0]' : 'border-[#E5E7EB]'
    }`}>
      {/* Card header */}
      <div className={`px-4 py-3 border-b ${
        allReady ? 'bg-[#F0FDF4] border-[#BBF7D0]' : 'bg-gray-50 border-[#F3F4F6]'
      }`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h3 className="font-black text-[#1F2937] text-xl leading-tight">{order.table_name}</h3>
            <p className="text-[11px] text-[#6B7280] font-medium mt-0.5">
              {waiterLabel}: {order.waiter_name}
            </p>
            {elapsed && (
              <div className="flex items-center gap-1 mt-1 text-[#6B7280] text-[10px] font-medium">
                <Clock size={10} />
                {elapsed}
              </div>
            )}
          </div>
          <button className="p-1.5 rounded-xl hover:bg-white text-[#9CA3AF] hover:text-gray-600 transition-colors flex-shrink-0">
            <MoreHorizontal size={16} />
          </button>
        </div>

        {/* Status summary chips */}
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {newCount > 0 && (
            <span className="px-2.5 py-1 bg-[#DBEAFE] text-[#2563EB] border border-[#BFDBFE] text-[10px] font-bold rounded-full">
              {newCount} {statusLabel('new', lang)}
            </span>
          )}
          {preparingCount > 0 && (
            <span className="px-2.5 py-1 bg-[#FFF1E8] text-[#FF5A00] border border-[#FDBA74] text-[10px] font-bold rounded-full">
              {preparingCount} {statusLabel('preparing', lang)}
            </span>
          )}
          {readyCount > 0 && (
            <span className="px-2.5 py-1 bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] text-[10px] font-bold rounded-full">
              {readyCount} {statusLabel('ready', lang)}
            </span>
          )}
        </div>

        {/* Bulk action buttons */}
        <div className="flex gap-2">
          {newCount > 0 && (
            <button
              onClick={() => handleBulk('new', 'preparing')}
              disabled={bulkBusy}
              className={`flex-1 py-1.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] ${
                bulkBusy
                  ? 'bg-orange-200 text-orange-400 cursor-not-allowed'
                  : 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-sm shadow-orange-100'
              }`}
            >
              {bulkBusy
                ? <Loader2 size={12} className="animate-spin" />
                : <ChefHat size={12} />}
              {markAllLabel.preparing}
            </button>
          )}
          {preparingCount > 0 && (
            <button
              onClick={() => handleBulk('preparing', 'ready')}
              disabled={bulkBusy}
              className={`flex-1 py-1.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] ${
                bulkBusy
                  ? 'bg-green-100 text-green-400 cursor-not-allowed'
                  : 'bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] hover:bg-[#16A34A] hover:text-white'
              }`}
            >
              {bulkBusy
                ? <Loader2 size={12} className="animate-spin text-green-400" />
                : <CheckCircle2 size={12} />}
              {markAllLabel.ready}
            </button>
          )}
        </div>
      </div>

      {/* Item rows */}
      <div className="p-3 space-y-2.5 flex-1">
        {sortedItems.map(item => (
          <KitchenItem
            key={`${item._orderId || order.id}-${item.menu_item_id}`}
            item={item}
            orderId={order.id}
            menuItem={menuItemMap[item.menu_item_id]}
            lang={lang}
            onMark={onMark}
          />
        ))}
      </div>
    </div>
  )
}

// ── Bottom status bar ──────────────────────────────────────────────────────────
function BottomBar({ orders, lang }) {
  const oldest = useMemo(() =>
    orders.length
      ? [...orders].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]
      : null,
    [orders]
  )

  const legend = [
    { cls: 'bg-[#DBEAFE] text-[#2563EB] border border-[#BFDBFE]', label: statusLabel('new', lang) },
    { cls: 'bg-[#FFF1E8] text-[#FF5A00] border border-[#FDBA74]', label: statusLabel('preparing', lang) },
    { cls: 'bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]', label: statusLabel('ready', lang) },
  ]

  const oldestAlert = lang === 'uz'
    ? 'Eng eski buyurtma:'
    : lang === 'ru' ? 'Самый старый заказ:' : 'Oldest order:'

  const agoSuffix = lang === 'uz' ? 'oldin' : lang === 'ru' ? 'назад' : ''

  return (
    <div className="flex-shrink-0 bg-white border-t border-[#E5E7EB] px-5 py-2.5 flex items-center justify-between gap-4">
      {oldest ? (
        <div className="flex items-center gap-2 min-w-0">
          <Bell size={14} className="text-[#ff5a00] flex-shrink-0" />
          <p className="text-[12px] text-[#6B7280] font-medium truncate">
            {oldestAlert}&nbsp;
            <span className="text-[#1F2937] font-black">{oldest.table_name}</span>
            &nbsp;&mdash;&nbsp;
            <span className="text-[#ff5a00] font-bold">{elapsedSince(oldest.created_at)}</span>
            {agoSuffix && <span className="text-[#6B7280]">&nbsp;{agoSuffix}</span>}
          </p>
        </div>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {legend.map(l => (
          <span key={l.label} className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${l.cls}`}>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Kitchen() {
  const { state, dispatch } = useApp()
  const lang = state.lang

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(i => { map[i.id] = i })
    return map
  }, [state.menuItems])

  // Group all active orders by table — one card per table
  const activeOrders = useMemo(() => {
    const raw = state.orders
      .filter(o => ['sent_to_kitchen', 'preparing'].includes(o.status))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    // Merge orders with the same table_id into one virtual order
    const grouped = {}
    raw.forEach(order => {
      const key = order.table_id
      if (!grouped[key]) {
        grouped[key] = {
          ...order,
          // Tag each item with its real orderId so UPDATE_ORDER_ITEM_STATUS works
          items: (order.items || []).map(i => ({ ...i, _orderId: order.id })),
        }
      } else {
        // Append items from subsequent orders for the same table
        grouped[key].items = [
          ...grouped[key].items,
          ...(order.items || []).map(i => ({ ...i, _orderId: order.id })),
        ]
        // Keep the earliest created_at for sorting
        if (new Date(order.created_at) < new Date(grouped[key].created_at)) {
          grouped[key].created_at = order.created_at
        }
      }
    })

    return Object.values(grouped)
  }, [state.orders])

  function markItem(_cardOrderId, menuItemId, status, realOrderId) {
    dispatch({ type: 'UPDATE_ORDER_ITEM_STATUS', payload: { orderId: realOrderId, menuItemId, status } })
  }

  return (
    <div className="flex overflow-hidden bg-[#FAF7F0]" style={{ height: '100dvh' }}>

      {/* Sidebar */}
      <div className="hidden lg:block flex-shrink-0 h-full">
        <UnifiedSidebar />
      </div>

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        <KitchenHeader
          lang={lang}
          onLangChange={l => dispatch({ type: 'SET_LANG', payload: l })}
        />

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-5">
          {activeOrders.length === 0 ? (
            <div className="max-w-sm mx-auto mt-20">
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                  <UtensilsCrossed size={30} className="text-orange-300" />
                </div>
                <p className="font-black text-[#1F2937] text-base mb-1">
                  {lang === 'uz' ? "Faol buyurtmalar yo'q" : lang === 'ru' ? 'Нет активных заказов' : 'No active kitchen orders'}
                </p>
                <p className="text-sm text-[#6B7280] leading-snug">
                  {lang === 'uz'
                    ? "Yangi buyurtmalar bu yerda avtomatik paydo bo'ladi"
                    : lang === 'ru' ? 'Новые заказы появятся здесь автоматически'
                    : 'New orders will appear here automatically'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {activeOrders.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  menuItemMap={menuItemMap}
                  lang={lang}
                  onMark={markItem}
                />
              ))}
            </div>
          )}
        </main>

        {/* Bottom bar */}
        <BottomBar orders={activeOrders} lang={lang} />
      </div>
    </div>
  )
}
