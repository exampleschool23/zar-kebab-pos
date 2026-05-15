import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, ShoppingCart, Plus } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t, getItemName, getItemDesc, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import CartPanel from '../components/CartPanel'
import StatusBadge from '../components/StatusBadge'

function CategoryPill({ cat, active, onClick, lang }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
        active
          ? 'bg-[#ff5a00] text-white shadow-md shadow-orange-200'
          : 'bg-white text-gray-500 border border-gray-200 hover:border-orange-200 hover:text-[#ff5a00]'
      }`}
    >
      {getCategoryName(cat, lang)}
    </button>
  )
}

function ProductCard({ item, onAdd, lang }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow w-full min-w-0 max-w-full flex flex-col">
      {/* Image placeholder */}
      <div className="relative w-full bg-gray-100" style={{ paddingBottom: '60%' }}>
        <div className="absolute inset-0">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={getItemName(item, lang)}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-orange-50 flex items-center justify-center">
              <span className="text-4xl opacity-40">🍖</span>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1">
        <h3 className="font-bold text-sm text-gray-900 line-clamp-2 leading-snug mb-0.5 flex-1">
          {getItemName(item, lang)}
        </h3>
        {getItemDesc(item, lang) && (
          <p className="text-xs text-gray-400 line-clamp-1 mb-2">{getItemDesc(item, lang)}</p>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[#ff5a00] font-black text-sm">{formatCurrency(item.price)}</span>
          <button
            onClick={() => onAdd(item)}
            className="w-8 h-8 bg-[#ff5a00] rounded-full flex items-center justify-center text-white hover:bg-[#cc4800] active:scale-90 transition-all shadow-md shadow-orange-200 flex-shrink-0"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WaiterOrder() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const lang = state.lang
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [cartOpen, setCartOpen] = useState(false)

  const table = state.tables.find(t => t.id === tableId)
  const cartCount = state.cart.reduce((s, i) => s + i.quantity, 0)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return state.menuItems.filter(item => {
      if (!item.available) return false
      const matchCat = activeCategory === 'all' || item.category_id === activeCategory
      const matchSearch = !q || [item.name_uz, item.name_ru, item.name_en]
        .some(n => n?.toLowerCase().includes(q))
      return matchCat && matchSearch
    })
  }, [state.menuItems, activeCategory, search])

  function handleAdd(item) {
    dispatch({
      type: 'ADD_TO_CART',
      payload: {
        menu_item_id: item.id,
        name: getItemName(item, lang),
        price: item.price,
      },
    })
  }

  if (!table) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-4xl mb-2">🪑</p>
          <p className="mb-4">Table not found</p>
          <button
            onClick={() => navigate('/waiter/tables')}
            className="text-[#ff5a00] font-semibold hover:underline"
          >
            {t(lang, 'back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col bg-[#faf7f0]"
      style={{ height: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}
    >
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate('/waiter/tables')}
              className="p-2 rounded-xl hover:bg-gray-100 flex-shrink-0 transition-colors"
            >
              <ArrowLeft size={20} className="text-gray-600" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-gray-900">{table.name}</span>
                <StatusBadge status={table.status} />
              </div>
              <p className="text-xs text-gray-400">Zar Kebab</p>
            </div>
          </div>
          {/* Cart count on mobile header */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {cartCount > 0 && (
              <button
                onClick={() => setCartOpen(true)}
                className="lg:hidden flex items-center gap-1.5 bg-[#ff5a00] text-white px-3 py-1.5 rounded-xl text-sm font-bold shadow-md shadow-orange-200"
              >
                <ShoppingCart size={15} />
                {cartCount}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: search + categories + grid */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Search */}
          <div className="px-4 pt-4 pb-2 flex-shrink-0">
            <div className="relative w-full">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder={t(lang, 'searchMenu')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
              />
            </div>
          </div>

          {/* Category pills — ONLY this row scrolls horizontally */}
          <div className="flex-shrink-0 px-4 pb-3">
            <div className="overflow-x-auto scrollbar-none">
              <div className="flex gap-2 w-max pb-1">
                {state.categories.map(cat => (
                  <CategoryPill
                    key={cat.id}
                    cat={cat}
                    active={activeCategory === cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    lang={lang}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Product grid — vertical scroll only */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pb-24 lg:pb-6">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Search size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">No items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-full">
                {filtered.map(item => (
                  <ProductCard key={item.id} item={item} onAdd={handleAdd} lang={lang} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: desktop cart sidebar */}
        <CartPanel open={cartOpen} onClose={() => setCartOpen(false)} />
      </div>

      {/* Floating cart button (mobile only, shows when cart is empty or no header button visible) */}
      <button
        onClick={() => setCartOpen(true)}
        className={`lg:hidden fixed bottom-5 right-5 bg-[#ff5a00] text-white rounded-2xl px-5 py-3 flex items-center gap-2 shadow-xl shadow-orange-300 active:scale-95 transition-all z-40 font-bold ${
          cartCount === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <ShoppingCart size={20} />
        <span className="text-base font-black">{cartCount}</span>
        <span className="text-sm">{t(lang, 'cart')}</span>
      </button>
    </div>
  )
}
