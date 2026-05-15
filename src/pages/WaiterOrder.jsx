import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Search, ShoppingCart, Plus, Minus, UtensilsCrossed,
  BookOpen, Table2, ChefHat, Receipt, BarChart2, Settings,
  LogOut, Menu as MenuIcon, ChevronLeft,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t, getItemName, getItemDesc, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import CartPanel from '../components/CartPanel'
import StatusBadge from '../components/StatusBadge'

// ── Sidebar nav definition ─────────────────────────────────────────────────────
const SIDEBAR_NAV = [
  { key: 'menu',    icon: BookOpen,  label: 'Menu',    path: null,               roles: ['owner','admin','waiter','kitchen','cashier'] },
  { key: 'tables',  icon: Table2,    label: 'Tables',  path: '/waiter/tables',   roles: ['owner','admin','waiter'] },
  { key: 'kitchen', icon: ChefHat,   label: 'Kitchen', path: '/kitchen',         roles: ['owner','admin','kitchen'] },
  { key: 'cashier', icon: Receipt,   label: 'Cashier', path: '/cashier/tables',  roles: ['owner','admin','cashier'] },
  { key: 'reports', icon: BarChart2, label: 'Reports', path: '/admin/reports',   roles: ['owner','admin'] },
  { key: 'admin',   icon: Settings,  label: 'Admin',   path: '/admin',           roles: ['owner','admin'] },
]

// ── POS sidebar ───────────────────────────────────────────────────────────────
function POSSidebar({ role, onClose, wide }) {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { dispatch } = useApp()

  const items = SIDEBAR_NAV.filter(n => n.roles.includes(role))

  function handleNav(item) {
    if (item.path) navigate(item.path)
    onClose?.()
  }

  const btnBase = wide
    ? 'flex-row gap-3 px-4 py-2.5 text-left justify-start'
    : 'flex-col py-2.5 gap-0.5 justify-center'

  return (
    <aside
      className={`${wide ? 'w-52' : 'w-[68px]'} h-full bg-white border-r border-gray-100 flex flex-col flex-shrink-0`}
      style={{ boxShadow: wide ? '6px 0 24px rgba(0,0,0,0.13)' : 'none' }}
    >
      {/* Brand */}
      <div className={`py-4 border-b border-gray-100 flex items-center flex-shrink-0 ${wide ? 'px-4 gap-3' : 'flex-col gap-0.5 justify-center'}`}>
        <div className="w-9 h-9 bg-[#ff5a00] rounded-xl flex items-center justify-center flex-shrink-0">
          <UtensilsCrossed size={17} className="text-white" />
        </div>
        {wide
          ? <span className="font-black text-sm text-gray-900 leading-tight">Zar Kebab</span>
          : <span className="text-[8px] font-black text-gray-400 tracking-widest">ZAR</span>
        }
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {items.map(item => {
          const Icon = item.icon
          const active = item.key === 'menu'
          return (
            <button
              key={item.key}
              onClick={() => handleNav(item)}
              title={!wide ? item.label : undefined}
              className={`w-full flex items-center transition-all ${btnBase} ${
                active
                  ? 'text-[#ff5a00] bg-[#fff3ed]'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={wide ? 17 : 22} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
              <span className={`font-semibold leading-none ${wide ? 'text-[13px]' : 'text-[9px]'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-gray-100 py-2 flex-shrink-0">
        <button
          onClick={() => { dispatch({ type: 'LOGOUT' }); signOut?.() }}
          title={!wide ? 'Logout' : undefined}
          className={`w-full flex items-center text-gray-400 hover:text-red-400 hover:bg-red-50 transition-colors ${btnBase}`}
        >
          <LogOut size={wide ? 16 : 20} className="flex-shrink-0" />
          <span className={`font-semibold leading-none ${wide ? 'text-[13px]' : 'text-[9px]'}`}>Logout</span>
        </button>
      </div>
    </aside>
  )
}

// ── Category card ─────────────────────────────────────────────────────────────
function CategoryCard({ cat, active, itemCount, onClick, lang }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 flex flex-col items-center justify-center rounded-2xl border-2 transition-all p-2 gap-1 w-[78px] h-[80px] ${
        active
          ? 'border-[#ff5a00] bg-[#fff3ed] text-[#ff5a00]'
          : 'border-gray-100 bg-white text-gray-500 hover:border-orange-200 hover:bg-orange-50/40'
      }`}
    >
      {cat.image_url ? (
        <img src={cat.image_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${active ? 'bg-[#ff5a00]/15' : 'bg-gray-100'}`}>
          <UtensilsCrossed size={13} className={active ? 'text-[#ff5a00]' : 'text-gray-400'} />
        </div>
      )}
      <span className={`text-[10px] font-bold leading-tight text-center line-clamp-1 w-full px-0.5 ${active ? 'text-[#ff5a00]' : 'text-gray-700'}`}>
        {getCategoryName(cat, lang)}
      </span>
      <span className={`text-[9px] font-medium ${active ? 'text-[#ff5a00]/60' : 'text-gray-400'}`}>
        {itemCount}
      </span>
    </button>
  )
}

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ item, qty, onAdd, onDec, lang }) {
  const inCart = qty > 0
  const addLabel = lang === 'uz' ? "Qo'shish" : lang === 'ru' ? 'Добавить' : 'Add'

  return (
    <div className={`bg-white rounded-2xl border-2 flex flex-col overflow-hidden transition-all ${
      inCart
        ? 'border-[#ff5a00]/30 shadow-lg shadow-orange-100/50'
        : 'border-transparent shadow-sm hover:shadow-md hover:border-gray-100'
    }`}>
      {/* Image area */}
      <div className="relative w-full h-[116px] bg-gray-50 flex-shrink-0">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={getItemName(item, lang)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-orange-50 flex items-center justify-center">
            <UtensilsCrossed size={26} className="text-orange-200" />
          </div>
        )}
        {inCart && (
          <div className="absolute top-2 right-2 bg-[#ff5a00] text-white text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center shadow-md">
            {qty}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1">
        <h3 className="font-bold text-[12px] text-gray-900 line-clamp-2 leading-snug min-h-[2.2rem] flex-1">
          {getItemName(item, lang)}
        </h3>
        {getItemDesc(item, lang) && (
          <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">{getItemDesc(item, lang)}</p>
        )}
        <p className="font-black text-[13px] text-[#ff5a00] mt-1.5 mb-2">{formatCurrency(item.price)}</p>

        {/* Action */}
        {inCart ? (
          <div className="flex items-center justify-between bg-[#ff5a00]/5 rounded-xl px-2 py-1.5 border border-[#ff5a00]/15">
            <button
              onClick={() => onDec(item)}
              className="w-6 h-6 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 active:scale-90 transition-all"
            >
              <Minus size={10} className="text-gray-600" />
            </button>
            <span className="font-black text-[13px] text-[#ff5a00]">{qty}</span>
            <button
              onClick={() => onAdd(item)}
              className="w-6 h-6 rounded-lg bg-[#ff5a00] flex items-center justify-center hover:bg-[#cc4800] active:scale-90 transition-all"
            >
              <Plus size={10} className="text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => onAdd(item)}
            className="w-full py-1.5 rounded-xl bg-gray-900 text-white text-[11px] font-bold hover:bg-[#ff5a00] active:scale-95 transition-all flex items-center justify-center gap-1"
          >
            <Plus size={11} />
            {addLabel}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WaiterOrder() {
  const { tableId }  = useParams()
  const navigate     = useNavigate()
  const { state, dispatch } = useApp()
  const { profile, signOut } = useAuth()
  const lang = state.lang
  const role = profile?.role || state.user?.role || 'waiter'

  const [search,        setSearch]        = useState('')
  const [activeCategory, setCategory]     = useState('all')
  const [cartOpen,      setCartOpen]      = useState(false)
  const [sidebarOpen,   setSidebarOpen]   = useState(false)
  const [orderType,     setOrderType]     = useState('dine_in')

  const table = state.tables.find(t => t.id === tableId)

  const cartQtyMap = useMemo(() => {
    const map = {}
    state.cart.forEach(i => { map[i.menu_item_id] = i.quantity })
    return map
  }, [state.cart])
  const cartCount = state.cart.reduce((s, i) => s + i.quantity, 0)

  const sortedCategories = useMemo(() =>
    [...state.categories].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories]
  )

  const categoryItemCounts = useMemo(() => {
    const counts = {}
    state.menuItems.forEach(i => {
      if (!i.available) return
      counts.all = (counts.all || 0) + 1
      counts[i.category_id] = (counts[i.category_id] || 0) + 1
    })
    return counts
  }, [state.menuItems])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return state.menuItems
      .filter(item => {
        if (!item.available) return false
        const matchCat    = activeCategory === 'all' || item.category_id === activeCategory
        const matchSearch = !q || [item.name_uz, item.name_ru, item.name_en].some(n => n?.toLowerCase().includes(q))
        return matchCat && matchSearch
      })
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
  }, [state.menuItems, activeCategory, search])

  function handleAdd(item) {
    dispatch({ type: 'ADD_TO_CART', payload: { menu_item_id: item.id, name: getItemName(item, lang), price: item.price } })
  }

  function handleDec(item) {
    const qty = (cartQtyMap[item.id] || 0) - 1
    if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: item.id })
    else dispatch({ type: 'UPDATE_CART_QTY', payload: { menu_item_id: item.id, qty } })
  }

  if (!table) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <UtensilsCrossed size={40} className="mx-auto mb-3 opacity-20" />
          <p className="mb-4 text-sm">Table not found</p>
          <button onClick={() => navigate('/waiter/tables')} className="text-[#ff5a00] font-semibold hover:underline text-sm">
            {t(lang, 'back') || 'Back'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full overflow-hidden bg-[#f5f4f0]" style={{ height: '100dvh' }}>

      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <div className="hidden lg:block flex-shrink-0">
        <POSSidebar role={role} />
      </div>

      {/* ── Mobile sidebar overlay ───────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10">
            <POSSidebar role={role} wide onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Top header */}
        <header className="flex items-center gap-3 px-4 h-[60px] bg-white border-b border-gray-100 shadow-sm flex-shrink-0">
          {/* Mobile: hamburger + back */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <MenuIcon size={20} className="text-gray-500" />
          </button>
          <button
            onClick={() => navigate('/waiter/tables')}
            className="lg:hidden p-1.5 rounded-xl hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <ChevronLeft size={19} className="text-gray-500" />
          </button>

          {/* Desktop: table info */}
          <div className="hidden lg:flex flex-col flex-shrink-0 mr-1">
            <span className="font-black text-gray-900 text-sm leading-tight">{table.name}</span>
            <div className="mt-0.5">
              <StatusBadge status={table.status} />
            </div>
          </div>
          <div className="hidden lg:block h-7 w-px bg-gray-100 flex-shrink-0 mr-1" />

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={t(lang, 'searchMenu') || 'Search menu...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] focus:bg-white transition-all"
            />
          </div>

          {/* Mobile: cart icon button */}
          <button
            onClick={() => setCartOpen(true)}
            className="lg:hidden relative flex-shrink-0 bg-[#ff5a00] text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
          >
            <ShoppingCart size={17} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-gray-900 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </header>

        {/* Category row */}
        <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {sortedCategories.map(cat => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                active={activeCategory === cat.id}
                itemCount={categoryItemCounts[cat.id] || 0}
                onClick={() => setCategory(cat.id)}
                lang={lang}
              />
            ))}
          </div>
        </div>

        {/* Product grid */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-6">
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
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 w-full max-w-full">
              {filtered.map(item => (
                <ProductCard
                  key={item.id}
                  item={item}
                  qty={cartQtyMap[item.id] || 0}
                  onAdd={handleAdd}
                  onDec={handleDec}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop cart panel ───────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[360px] flex-shrink-0 bg-white border-l border-gray-100 overflow-hidden"
        style={{ boxShadow: '-4px 0 20px rgba(0,0,0,0.04)' }}>
        <CartPanel
          tableName={table.name}
          tableStatus={table.status}
          orderType={orderType}
          onOrderTypeChange={setOrderType}
        />
      </div>

      {/* ── Mobile cart sheet ────────────────────────────────────────────── */}
      {cartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 flex-shrink-0" />
            <CartPanel
              tableName={table.name}
              tableStatus={table.status}
              orderType={orderType}
              onOrderTypeChange={setOrderType}
              onClose={() => setCartOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
