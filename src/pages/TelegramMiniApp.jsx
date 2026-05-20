import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BadgePercent,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/formatCurrency'
import { getCategoryName, getItemDesc, getItemName } from '../lib/i18n'
import {
  getStoredTelegramSession,
  initTelegramWebApp,
  setStoredTelegramSession,
  telegramApi,
} from '../lib/telegramWebApp'

async function loadTelegramMenuData() {
  const rpcRes = await supabase.rpc('get_public_menu_data')
  if (!rpcRes.error && rpcRes.data) {
    return {
      categories: rpcRes.data.categories || [],
      items: rpcRes.data.items || [],
    }
  }

  const [catRes, itemRes] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').eq('available', true).order('sort_order'),
  ])
  if (catRes.error || itemRes.error) throw catRes.error || itemRes.error
  return {
    categories: catRes.data || [],
    items: itemRes.data || [],
  }
}

function SafeImage({ src, alt }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#F4EFE7]">
        <UtensilsCrossed size={30} className="text-[#D39D70]" />
      </div>
    )
  }
  return <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
}

function BottomNav({ active, onSelect, cartCount }) {
  const items = [
    { id: 'menu', label: 'Menu', Icon: MenuIcon },
    { id: 'orders', label: 'Orders', Icon: ReceiptText },
    { id: 'loyalty', label: 'Card', Icon: BadgePercent },
    { id: 'contact', label: 'Contact', Icon: MessageCircle },
  ]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DED2] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {items.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className={`relative flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-black ${
              active === id ? 'bg-[#163B2D] text-white' : 'text-[#687366]'
            }`}
          >
            <Icon size={20} />
            <span>{label}</span>
            {id === 'menu' && cartCount > 0 && (
              <span className="absolute right-3 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FF5A00] px-1 text-[11px] text-white">
                {cartCount}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  )
}

function ProductCard({ item, lang, quantity, onAdd, onIncrement, onDecrement }) {
  const name = getItemName(item, lang)
  return (
    <article className="overflow-hidden rounded-[8px] border border-[#E8DED2] bg-white shadow-sm">
      <div className="aspect-[4/3]">
        <SafeImage src={item.image_url} alt={name} />
      </div>
      <div className="flex min-h-[152px] flex-col p-3">
        <h3 className="line-clamp-2 text-[15px] font-black leading-snug text-[#1E2B24]">{name}</h3>
        <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[#8B9388]">{getItemDesc(item, lang)}</p>
        <p className="mt-auto text-[16px] font-black text-[#FF5A00]">{formatCurrency(item.price)}</p>
        {quantity > 0 ? (
          <div className="mt-3 flex h-10 items-center justify-between rounded-[8px] border border-[#F7C7A6] bg-[#FFF3EA] p-1">
            <button onClick={() => onDecrement(item)} className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-white text-[#6F766D] shadow-sm">
              <Minus size={16} />
            </button>
            <span className="text-lg font-black text-[#FF5A00]">{quantity}</span>
            <button onClick={() => onIncrement(item)} className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[#FF5A00] text-white">
              <Plus size={16} />
            </button>
          </div>
        ) : (
          <button onClick={() => onAdd(item)} className="mt-3 h-10 rounded-[8px] bg-[#163B2D] text-sm font-black text-white">
            Add
          </button>
        )}
      </div>
    </article>
  )
}

function CartBar({ total, count, onCheckout }) {
  if (count === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-[74px] z-30 px-3">
      <button
        onClick={onCheckout}
        className="mx-auto flex h-14 w-full max-w-md items-center justify-between rounded-[8px] bg-[#FF5A00] px-4 font-black text-white shadow-[0_10px_28px_rgba(255,90,0,0.28)]"
      >
        <span>{count} items</span>
        <span className="flex items-center gap-2">
          Checkout
          <ShoppingBag size={18} />
          {formatCurrency(total)}
        </span>
      </button>
    </div>
  )
}

function MenuView({ categories, items, cart, lang, onAdd, onIncrement, onDecrement, onCheckout }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const cartQty = useMemo(() => {
    const map = {}
    cart.forEach(item => { map[item.menuItemId] = item.quantity })
    return map
  }, [cart])
  const visibleItems = items.filter(item => {
    const categoryOk = activeCategory === 'all' || item.category_id === activeCategory
    const searchOk = !query || [item.name_uz, item.name_ru, item.name_en].some(value => value?.toLowerCase().includes(query))
    return categoryOk && searchOk
  })
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const count = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <>
      <div className="sticky top-0 z-20 border-b border-[#E8DED2] bg-[#FBF6EE]/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <h1 className="text-2xl font-black text-[#163B2D]">Zar Kebab</h1>
          <div className="relative mt-3">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8B9388]" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search menu"
              className="h-11 w-full rounded-[8px] border border-[#E8DED2] bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-[#FF5A00]"
            />
          </div>
          <div className="category-scroll -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {[{ id: 'all', name_en: 'All' }, ...categories].map(category => (
              <button
                key={category.id}
                onClick={() => setActiveCategory(category.id)}
                className={`h-10 shrink-0 rounded-[8px] px-4 text-sm font-black ${
                  activeCategory === category.id ? 'bg-[#163B2D] text-white' : 'border border-[#E8DED2] bg-white text-[#4C5B52]'
                }`}
              >
                {category.id === 'all' ? 'All' : getCategoryName(category, lang)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-md px-4 py-4 pb-40">
        <div className="grid grid-cols-2 gap-3">
          {visibleItems.map(item => (
            <ProductCard
              key={item.id}
              item={item}
              lang={lang}
              quantity={cartQty[item.id] || 0}
              onAdd={onAdd}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
            />
          ))}
        </div>
      </main>
      <CartBar total={total} count={count} onCheckout={onCheckout} />
    </>
  )
}

function CheckoutView({ cart, onBack, onSubmit, submitting, loyalty, onLoyaltyChange, onCheckLoyalty }) {
  const [orderType, setOrderType] = useState('takeaway')
  const [notes, setNotes] = useState('')
  const [redeem, setRedeem] = useState('')
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const redeemAmount = Math.min(Math.max(0, Math.round(Number(redeem) || 0)), loyalty.balance || 0, subtotal)
  const total = Math.max(0, subtotal - redeemAmount)

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-3">
      <button onClick={onBack} className="mb-3 flex h-10 items-center gap-2 rounded-[8px] text-sm font-black text-[#4C5B52]">
        <ChevronLeft size={20} /> Back
      </button>
      <h1 className="text-2xl font-black text-[#163B2D]">Checkout</h1>
      <div className="mt-4 space-y-3">
        {cart.map(item => (
          <div key={item.menuItemId} className="flex items-center justify-between rounded-[8px] border border-[#E8DED2] bg-white p-3">
            <div>
              <p className="font-black text-[#1E2B24]">{item.name}</p>
              <p className="text-sm font-semibold text-[#8B9388]">{item.quantity} x {formatCurrency(item.price)}</p>
            </div>
            <p className="font-black text-[#FF5A00]">{formatCurrency(item.quantity * item.price)}</p>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-[8px] border border-[#E8DED2] bg-white p-3">
        <p className="text-sm font-black text-[#163B2D]">Order type</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            ['takeaway', 'Takeaway'],
            ['dine_in', 'Dine in'],
            ['delivery', 'Delivery'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setOrderType(value)}
              className={`h-10 rounded-[8px] text-sm font-black ${orderType === value ? 'bg-[#163B2D] text-white' : 'bg-[#F5EFE6] text-[#4C5B52]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[8px] border border-[#E8DED2] bg-white p-3">
        <p className="text-sm font-black text-[#163B2D]">Loyalty card</p>
        <div className="mt-2 flex gap-2">
          <input
            value={loyalty.cardNumber}
            onChange={event => onLoyaltyChange(event.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            placeholder="8-digit card"
            className="h-11 min-w-0 flex-1 rounded-[8px] border border-[#E8DED2] px-3 text-sm font-semibold outline-none focus:border-[#FF5A00]"
          />
          <button onClick={onCheckLoyalty} className="h-11 rounded-[8px] bg-[#163B2D] px-4 text-sm font-black text-white">
            Check
          </button>
        </div>
        {loyalty.message && <p className="mt-2 text-sm font-bold text-[#687366]">{loyalty.message}</p>}
        {loyalty.valid && (
          <input
            value={redeem}
            onChange={event => setRedeem(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Redeem amount"
            className="mt-3 h-11 w-full rounded-[8px] border border-[#E8DED2] px-3 text-sm font-semibold outline-none focus:border-[#FF5A00]"
          />
        )}
      </section>

      <textarea
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder="Notes for kitchen"
        rows={3}
        className="mt-4 w-full resize-none rounded-[8px] border border-[#E8DED2] bg-white p-3 text-sm font-semibold outline-none focus:border-[#FF5A00]"
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DED2] bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex items-center justify-between text-sm font-black">
            <span>Total</span>
            <span className="text-xl text-[#FF5A00]">{formatCurrency(total)}</span>
          </div>
          <button
            disabled={submitting}
            onClick={() => onSubmit({ orderType, notes, loyaltyRedeemAmount: redeemAmount })}
            className="h-14 w-full rounded-[8px] bg-[#FF5A00] font-black text-white disabled:opacity-60"
          >
            {submitting ? 'Sending order...' : 'Submit order'}
          </button>
        </div>
      </div>
    </main>
  )
}

function OrdersView({ token }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    telegramApi('/api/telegram/orders', { method: 'GET', token })
      .then(data => { if (!cancelled) setOrders(data.orders || []) })
      .catch(() => { if (!cancelled) setOrders([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [token])

  return (
    <main className="mx-auto max-w-md px-4 py-4 pb-28">
      <h1 className="text-2xl font-black text-[#163B2D]">My Orders</h1>
      <div className="mt-4 space-y-3">
        {loading ? <p className="font-semibold text-[#687366]">Loading orders...</p> : orders.length === 0 ? (
          <p className="rounded-[8px] border border-[#E8DED2] bg-white p-4 font-semibold text-[#687366]">No Telegram orders yet.</p>
        ) : orders.map(order => (
          <div key={order.id} className="rounded-[8px] border border-[#E8DED2] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black text-[#163B2D]">{order.order_number || order.id}</p>
              <span className="rounded-full bg-[#F5EFE6] px-3 py-1 text-xs font-black text-[#687366]">{order.status}</span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#8B9388]">{(order.items || []).length} items · {formatCurrency(order.total || 0)}</p>
          </div>
        ))}
      </div>
    </main>
  )
}

function LoyaltyView({ loyalty, onLoyaltyChange, onCheckLoyalty }) {
  return (
    <main className="mx-auto max-w-md px-4 py-4 pb-28">
      <h1 className="text-2xl font-black text-[#163B2D]">Loyalty Card</h1>
      <section className="mt-4 rounded-[8px] border border-[#E8DED2] bg-white p-4">
        <input
          value={loyalty.cardNumber}
          onChange={event => onLoyaltyChange(event.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          placeholder="8-digit card number"
          className="h-12 w-full rounded-[8px] border border-[#E8DED2] px-3 font-semibold outline-none focus:border-[#FF5A00]"
        />
        <button onClick={onCheckLoyalty} className="mt-3 h-12 w-full rounded-[8px] bg-[#163B2D] font-black text-white">
          Check balance
        </button>
        {loyalty.message && <p className="mt-3 font-bold text-[#687366]">{loyalty.message}</p>}
      </section>
    </main>
  )
}

function ContactView() {
  return (
    <main className="mx-auto max-w-md px-4 py-4 pb-28">
      <h1 className="text-2xl font-black text-[#163B2D]">Contact</h1>
      <section className="mt-4 space-y-3 rounded-[8px] border border-[#E8DED2] bg-white p-4">
        <p className="flex items-center gap-2 font-bold text-[#4C5B52]"><MapPin size={18} /> Zar Kebab Restaurant</p>
        <p className="font-semibold text-[#687366]">For changes to an order, please contact the restaurant directly from Telegram or by phone.</p>
      </section>
    </main>
  )
}

export default function TelegramMiniApp() {
  const [webApp, setWebApp] = useState(null)
  const [token, setToken] = useState(getStoredTelegramSession())
  const [customer, setCustomer] = useState(null)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [cart, setCart] = useState([])
  const [view, setView] = useState('menu')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [successOrder, setSuccessOrder] = useState(null)
  const [loyalty, setLoyalty] = useState({ cardNumber: '', valid: false, balance: 0, message: '' })
  const lang = webApp?.initDataUnsafe?.user?.language_code?.startsWith('uz') ? 'uz' : webApp?.initDataUnsafe?.user?.language_code?.startsWith('en') ? 'en' : 'ru'

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoading(true)
      setError('')
      try {
        const app = await initTelegramWebApp()
        if (!cancelled) setWebApp(app)

        const initData = app?.initData || ''
        if (initData) {
          const auth = await telegramApi('/api/telegram/auth', {
            method: 'POST',
            body: JSON.stringify({ initData }),
          })
          setStoredTelegramSession(auth.sessionToken)
          if (!cancelled) {
            setToken(auth.sessionToken)
            setCustomer(auth.customer)
          }
        } else if (!token) {
          throw new Error('Open this page from the Telegram bot to authenticate.')
        }

        const menu = await loadTelegramMenuData()
        if (!cancelled) {
          setCategories(menu.categories)
          setItems(menu.items)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Telegram Mini App failed to load.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [])

  function addItem(item) {
    const name = getItemName(item, lang)
    setCart(prev => {
      const existing = prev.find(row => row.menuItemId === item.id)
      if (existing) return prev.map(row => row.menuItemId === item.id ? { ...row, quantity: row.quantity + 1 } : row)
      return [...prev, { menuItemId: item.id, name, price: Number(item.price) || 0, quantity: 1, notes: '' }]
    })
  }

  function decrementItem(item) {
    setCart(prev => prev.flatMap(row => {
      if (row.menuItemId !== item.id) return [row]
      return row.quantity <= 1 ? [] : [{ ...row, quantity: row.quantity - 1 }]
    }))
  }

  async function checkLoyalty() {
    if (!/^\d{8}$/.test(loyalty.cardNumber)) {
      setLoyalty(prev => ({ ...prev, valid: false, balance: 0, message: 'Enter an 8-digit card number.' }))
      return
    }
    try {
      const data = await telegramApi(`/api/telegram/loyalty/${loyalty.cardNumber}`, { method: 'GET', token })
      setLoyalty(prev => ({
        ...prev,
        valid: data.valid,
        balance: data.balance || 0,
        message: data.valid ? `Available balance: ${formatCurrency(data.balance || 0)}` : 'Card not found.',
      }))
    } catch (err) {
      setLoyalty(prev => ({ ...prev, valid: false, balance: 0, message: err.message }))
    }
  }

  async function submitOrder({ orderType, notes, loyaltyRedeemAmount }) {
    setSubmitting(true)
    setError('')
    try {
      const data = await telegramApi('/api/telegram/order', {
        method: 'POST',
        token,
        body: JSON.stringify({
          source: 'telegram',
          orderType,
          customerId: customer?.id,
          items: cart,
          notes,
          paymentMethod: 'pay_at_cashier',
          loyaltyCardNumber: loyalty.valid ? loyalty.cardNumber : undefined,
          loyaltyRedeemAmount,
        }),
      })
      setSuccessOrder(data.order)
      setCart([])
      setView('success')
      webApp?.HapticFeedback?.notificationOccurred?.('success')
    } catch (err) {
      setError(err.message || 'Could not submit order.')
      webApp?.HapticFeedback?.notificationOccurred?.('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#FBF6EE] font-black text-[#163B2D]">Loading...</div>
  }

  if (error && !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF6EE] p-4">
        <div className="w-full max-w-sm rounded-[8px] border border-[#E8DED2] bg-white p-5 text-center">
          <AlertCircle className="mx-auto text-[#FF5A00]" size={34} />
          <p className="mt-3 font-black text-[#163B2D]">{error}</p>
        </div>
      </div>
    )
  }

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="min-h-screen bg-[#FBF6EE] text-[#1E2B24]">
      {error && (
        <div className="mx-auto max-w-md px-4 pt-3">
          <div className="rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>
        </div>
      )}

      {view === 'menu' && (
        <MenuView
          categories={categories}
          items={items}
          cart={cart}
          lang={lang}
          onAdd={addItem}
          onIncrement={addItem}
          onDecrement={decrementItem}
          onCheckout={() => setView('checkout')}
        />
      )}
      {view === 'checkout' && (
        <CheckoutView
          cart={cart}
          onBack={() => setView('menu')}
          onSubmit={submitOrder}
          submitting={submitting}
          loyalty={loyalty}
          onLoyaltyChange={cardNumber => setLoyalty({ cardNumber, valid: false, balance: 0, message: '' })}
          onCheckLoyalty={checkLoyalty}
        />
      )}
      {view === 'success' && (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 pb-28 text-center">
          <CheckCircle2 size={58} className="text-[#16A34A]" />
          <h1 className="mt-4 text-2xl font-black text-[#163B2D]">Order sent</h1>
          <p className="mt-2 font-semibold text-[#687366]">Your order is now visible for kitchen and cashier.</p>
          <p className="mt-4 rounded-[8px] bg-white px-4 py-3 font-black text-[#FF5A00]">{successOrder?.order_number || successOrder?.id}</p>
          <button onClick={() => setView('orders')} className="mt-4 h-12 w-full rounded-[8px] bg-[#163B2D] font-black text-white">
            Track order
          </button>
        </main>
      )}
      {view === 'orders' && <OrdersView token={token} />}
      {view === 'loyalty' && (
        <LoyaltyView
          loyalty={loyalty}
          onLoyaltyChange={cardNumber => setLoyalty({ cardNumber, valid: false, balance: 0, message: '' })}
          onCheckLoyalty={checkLoyalty}
        />
      )}
      {view === 'contact' && <ContactView />}

      {view !== 'checkout' && (
        <BottomNav
          active={view === 'success' ? 'orders' : view}
          cartCount={cartCount}
          onSelect={setView}
        />
      )}
      {view === 'orders' && (
        <div className="pointer-events-none fixed right-4 top-4 flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-[#687366] shadow-sm">
          <Clock3 size={14} /> Live updates in panels
        </div>
      )}
    </div>
  )
}
