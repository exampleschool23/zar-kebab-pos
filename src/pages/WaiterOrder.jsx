import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, ShoppingCart, Plus } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t, getItemName, getItemDesc, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import CartPanel from '../components/CartPanel'
import LanguageSwitcher from '../components/LanguageSwitcher'

function StatusBadge({ status, lang }) {
  const map = {
    available:  'bg-green-100 text-green-700',
    occupied:   'bg-orange-100 text-orange-700',
    needs_bill: 'bg-red-100 text-red-700',
  }
  const labelKey = status === 'needs_bill' ? 'needsBill' : status
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {t(lang, labelKey)}
    </span>
  )
}

function CategoryCard({ cat, active, onClick, lang }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-20 flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all ${
        active
          ? 'border-brand bg-orange-50'
          : 'border-gray-100 bg-white hover:border-orange-200'
      }`}
    >
      {cat.image_url ? (
        <img
          src={cat.image_url}
          alt={getCategoryName(cat, lang)}
          className="w-10 h-10 rounded-xl object-cover"
        />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-xl">🍽️</div>
      )}
      <span className={`text-[10px] font-bold text-center leading-tight line-clamp-2 ${active ? 'text-brand' : 'text-gray-500'}`}>
        {getCategoryName(cat, lang)}
      </span>
    </button>
  )
}

function ProductCard({ item, onAdd, lang }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow w-full min-w-0 max-w-full">
      <div className="relative w-full" style={{ paddingBottom: '66%' }}>
        <div className="absolute inset-0">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={getItemName(item, lang)}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-orange-50 flex items-center justify-center text-5xl">🍖</div>
          )}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-bold text-sm text-gray-900 line-clamp-2 leading-snug mb-0.5">
          {getItemName(item, lang)}
        </h3>
        {getItemDesc(item, lang) && (
          <p className="text-xs text-gray-400 line-clamp-1 mb-2">{getItemDesc(item, lang)}</p>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-brand font-black text-sm">{formatCurrency(item.price)}</span>
          <button
            onClick={() => onAdd(item)}
            className="w-8 h-8 bg-brand rounded-full flex items-center justify-center text-white hover:bg-brand-dark active:scale-90 transition-all shadow-md shadow-orange-200 flex-shrink-0"
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
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-4xl mb-2">🪑</p>
          <p>Table not found</p>
          <button onClick={() => navigate('/waiter/tables')} className="mt-4 text-brand font-semibold">
            {t(lang, 'back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col bg-orange-50"
      style={{ height: '100dvh', width: '100%', maxWidth: '100vw', overflowX: 'hidden' }}
    >
      {/* ── Header ── */}
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
                <StatusBadge status={table.status} lang={lang} />
              </div>
              <p className="text-xs text-gray-400">Zar Kebab</p>
            </div>
          </div>
          <div className="flex-shrink-0">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* ── Body: menu + cart sidebar ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: search + categories + grid ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

          {/* Search */}
          <div className="px-3 pt-3 pb-2 flex-shrink-0">
            <div className="relative w-full" style={{ boxSizing: 'border-box' }}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder={t(lang, 'searchMenu')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
                className="pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="flex-shrink-0 px-3 pb-2">
            <div className="category-scroll">
              <div className="flex gap-2 w-max pb-1">
                {state.categories.map(cat => (
                  <CategoryCard
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

          {/* Product grid — only this scrolls vertically */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-28 lg:pb-4">
            <div
              className="grid gap-3 w-full max-w-full"
              style={{ gridTemplateColumns: 'repeat(1, minmax(0, 1fr))' }}
            >
              {/* Tailwind responsive override via a style tag equivalent: use responsive classes */}
              {filtered.length === 0 ? (
                <div className="col-span-full text-center py-16 text-gray-400">
                  <p className="text-4xl mb-2">🔍</p>
                  <p className="text-sm">No items found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-full">
                  {filtered.map(item => (
                    <ProductCard key={item.id} item={item} onAdd={handleAdd} lang={lang} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: desktop cart sidebar ── */}
        <CartPanel open={cartOpen} onClose={() => setCartOpen(false)} />
      </div>

      {/* ── Floating cart button (mobile/tablet only) ── */}
      <button
        onClick={() => setCartOpen(true)}
        className={`lg:hidden fixed bottom-5 right-5 bg-brand text-white rounded-2xl px-5 py-3 flex items-center gap-2 shadow-xl shadow-orange-300 active:scale-95 transition-all z-40 font-bold ${
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
