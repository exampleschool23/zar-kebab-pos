import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, ShoppingCart, Plus, Minus, UtensilsCrossed } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t, getItemName, getItemDesc, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import CartPanel from '../components/CartPanel'
import StatusBadge from '../components/StatusBadge'

// ── Category pill ──────────────────────────────────────────────────────────────
function CategoryPill({ cat, active, onClick, lang }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap border ${
        active
          ? 'bg-[#ff5a00] text-white border-[#ff5a00] shadow-sm shadow-orange-200'
          : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300 hover:text-[#ff5a00]'
      }`}
    >
      {getCategoryName(cat, lang)}
    </button>
  )
}

// ── Product card ───────────────────────────────────────────────────────────────
// IMAGE HEIGHT: change `h-40` below to adjust image area (h-36 = 144px, h-40 = 160px, h-44 = 176px)
function ProductCard({ item, cartQty, onAdd, onInc, onDec, lang }) {
  const inCart = cartQty > 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow w-full">
      {/* Image — change h-40 to adjust height */}
      <div className="relative w-full h-40 bg-gray-100 flex-shrink-0">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={getItemName(item, lang)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-orange-50 flex items-center justify-center">
            <UtensilsCrossed size={28} className="text-orange-200" />
          </div>
        )}

        {/* Quantity badge — shown when item is already in cart */}
        {inCart && (
          <div className="absolute top-2 right-2 bg-[#ff5a00] text-white text-xs font-black rounded-full w-6 h-6 flex items-center justify-center shadow-md">
            {cartQty}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <h3 className="font-bold text-[13px] text-gray-900 line-clamp-2 leading-snug mb-0.5 flex-1 min-h-[2.5rem]">
          {getItemName(item, lang)}
        </h3>
        {getItemDesc(item, lang) && (
          <p className="text-[11px] text-gray-400 line-clamp-1 mb-2 leading-snug">
            {getItemDesc(item, lang)}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-1">
          <span className="text-[#ff5a00] font-black text-sm">{formatCurrency(item.price)}</span>

          {/* Show qty controls if already in cart, otherwise plain + */}
          {inCart ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDec(item)}
                className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-90 transition-all"
              >
                <Minus size={12} />
              </button>
              <span className="font-black text-sm w-5 text-center text-gray-900">{cartQty}</span>
              <button
                onClick={() => onAdd(item)}
                className="w-7 h-7 rounded-full bg-[#ff5a00] flex items-center justify-center text-white hover:bg-[#cc4800] active:scale-90 transition-all"
              >
                <Plus size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onAdd(item)}
              className="w-8 h-8 bg-[#ff5a00] rounded-full flex items-center justify-center text-white hover:bg-[#cc4800] active:scale-90 transition-all shadow-sm shadow-orange-200"
            >
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function WaiterOrder() {
  const { tableId } = useParams()
  const navigate    = useNavigate()
  const { state, dispatch } = useApp()
  const lang = state.lang

  const [search, setSearch]           = useState('')
  const [activeCategory, setCategory] = useState('all')
  const [cartOpen, setCartOpen]       = useState(false)

  const table    = state.tables.find(t => t.id === tableId)
  const cartQtyMap = useMemo(() => {
    const map = {}
    state.cart.forEach(i => { map[i.menu_item_id] = i.quantity })
    return map
  }, [state.cart])
  const cartCount = state.cart.reduce((s, i) => s + i.quantity, 0)

  // Determine order state label
  const activeOrder = state.orders.find(o => o.table_id === tableId && !['paid','cancelled'].includes(o.status))
  const orderStateLabel = activeOrder
    ? activeOrder.status === 'sent_to_kitchen' || activeOrder.status === 'preparing'
      ? t(lang, 'sentToKitchen') || 'Sent to kitchen'
      : t(lang, 'orderReady') || 'Ready'
    : t(lang, 'draftOrder') || 'Draft order'

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return state.menuItems.filter(item => {
      if (!item.available) return false
      const matchCat    = activeCategory === 'all' || item.category_id === activeCategory
      const matchSearch = !q || [item.name_uz, item.name_ru, item.name_en].some(n => n?.toLowerCase().includes(q))
      return matchCat && matchSearch
    })
  }, [state.menuItems, activeCategory, search])

  function handleAdd(item) {
    dispatch({
      type: 'ADD_TO_CART',
      payload: { menu_item_id: item.id, name: getItemName(item, lang), price: item.price },
    })
  }

  function handleDec(item) {
    const qty = (cartQtyMap[item.id] || 0) - 1
    if (qty <= 0) {
      dispatch({ type: 'REMOVE_FROM_CART', payload: item.id })
    } else {
      dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.id, qty } })
    }
  }

  if (!table) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <UtensilsCrossed size={40} className="mx-auto mb-3 opacity-20" />
          <p className="mb-4 text-sm">Table not found</p>
          <button onClick={() => navigate('/waiter/tables')} className="text-[#ff5a00] font-semibold hover:underline text-sm">
            {t(lang, 'back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-[#faf7f0]" style={{ height: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 px-4 py-0 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between h-14 gap-3">

          {/* Left: back + table info */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate('/waiter/tables')}
              className="p-2 -ml-1 rounded-xl hover:bg-gray-100 flex-shrink-0 transition-colors"
            >
              <ArrowLeft size={19} className="text-gray-500" />
            </button>

            <div className="h-8 w-px bg-gray-100 flex-shrink-0" />

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-gray-900 text-base leading-tight">{table.name}</span>
                <StatusBadge status={table.status} />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-gray-400 font-medium">Zar Kebab</span>
                <span className="text-gray-200">·</span>
                <span className="text-[11px] text-gray-400">{orderStateLabel}</span>
              </div>
            </div>
          </div>

          {/* Right: mobile cart button */}
          <button
            onClick={() => setCartOpen(true)}
            className={`lg:hidden relative flex-shrink-0 flex items-center gap-2 bg-[#ff5a00] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm shadow-orange-200 transition-all ${
              cartCount === 0 ? 'opacity-50' : ''
            }`}
          >
            <ShoppingCart size={16} />
            <span>{t(lang, 'cart')}</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left: menu area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Search */}
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder={t(lang, 'searchMenu') || 'Search menu...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
              />
            </div>
          </div>

          {/* Categories — only this row scrolls horizontally */}
          <div className="flex-shrink-0 px-4 pb-3">
            <div className="overflow-x-auto scrollbar-none">
              <div className="flex gap-2 w-max">
                {state.categories.map(cat => (
                  <CategoryPill
                    key={cat.id}
                    cat={cat}
                    active={activeCategory === cat.id}
                    onClick={() => setCategory(cat.id)}
                    lang={lang}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Product grid — vertical scroll only */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-28 lg:pb-6">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                <Search size={36} className="mb-3 opacity-20" />
                <p className="text-sm font-medium">No items found</p>
                {search && (
                  <button onClick={() => setSearch('')} className="mt-2 text-xs text-[#ff5a00] hover:underline">
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              // GRID: 1 col mobile, 3 cols desktop — never horizontally scrolls
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-full">
                {filtered.map(item => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    cartQty={cartQtyMap[item.id] || 0}
                    onAdd={handleAdd}
                    onDec={handleDec}
                    lang={lang}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: desktop/tablet cart panel */}
        <CartPanel tableName={table.name} open={cartOpen} onClose={() => setCartOpen(false)} />
      </div>

      {/* Floating cart button — mobile only, always visible when cart has items */}
      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-5 right-5 z-40 bg-[#ff5a00] text-white rounded-2xl px-5 py-3.5 flex items-center gap-2.5 shadow-xl shadow-orange-300 active:scale-95 transition-all font-bold"
        >
          <ShoppingCart size={19} />
          <span className="text-sm">{t(lang, 'cart')}</span>
          <span className="bg-white text-[#ff5a00] text-xs font-black rounded-full w-5 h-5 flex items-center justify-center">
            {cartCount}
          </span>
        </button>
      )}
    </div>
  )
}
