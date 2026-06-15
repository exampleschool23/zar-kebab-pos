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
import { isCustomerMenuCategory, isCustomerMenuItem } from '../lib/menuItems'
import { formatCurrency } from '../lib/formatCurrency'
import { getCategoryName, getItemDesc, getItemName } from '../lib/i18n'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import { getMenuPricing } from '../lib/menuPricing'
import ImageLoadShimmer from '../components/ImageLoadShimmer'
import {
  getStoredTelegramSession,
  initTelegramWebApp,
  setStoredTelegramSession,
  telegramApi,
} from '../lib/telegramWebApp'

async function loadTelegramMenuData() {
  const rpcRes = await supabase.rpc('get_public_menu_data')
  if (!rpcRes.error && rpcRes.data) {
    const categories = (rpcRes.data.categories || []).filter(isCustomerMenuCategory)
    const categoryIds = new Set(categories.map(category => category.id))
    return {
      categories,
      items: (rpcRes.data.items || []).filter(item => isCustomerMenuItem(item) && (!item.category_id || categoryIds.has(item.category_id))),
    }
  }

  const [catRes, itemRes] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').eq('available', true).order('sort_order'),
  ])
  if (catRes.error || itemRes.error) throw catRes.error || itemRes.error
  const categories = (catRes.data || []).filter(isCustomerMenuCategory)
  const categoryIds = new Set(categories.map(category => category.id))
  return {
    categories,
    items: (itemRes.data || []).filter(item => isCustomerMenuItem(item) && (!item.category_id || categoryIds.has(item.category_id))),
  }
}

const T = {
  uz: {
    menu: 'Menyu',
    orders: 'Buyurtmalar',
    card: 'Karta',
    contact: 'Aloqa',
    add: 'Qo‘shish',
    items: 'mahsulot',
    checkout: 'Rasmiylashtirish',
    searchMenu: 'Menyudan qidirish',
    all: 'Barchasi',
    back: 'Orqaga',
    checkoutTitle: 'To‘lov',
    orderType: 'Buyurtma turi',
    takeaway: 'Olib ketish',
    dineIn: 'Zalda',
    delivery: 'Yetkazish',
    loyaltyCard: 'Sodiqlik kartasi',
    cardPlaceholder: '8 xonali karta',
    cardNumberPlaceholder: '8 xonali karta raqami',
    check: 'Tekshirish',
    checkBalance: 'Balansni tekshirish',
    redeemAmount: 'Ishlatiladigan summa',
    notes: 'Buyurtma uchun izoh',
    total: 'Jami',
    sendingOrder: 'Buyurtma yuborilmoqda...',
    submitOrder: 'Buyurtma berish',
    myOrders: 'Buyurtmalarim',
    loadingOrders: 'Buyurtmalar yuklanmoqda...',
    noOrders: 'Telegram buyurtmalari hali yo‘q.',
    orderSent: 'Buyurtma yuborildi',
    orderSentSub: 'Buyurtmangiz jamoaga ko‘rinadi.',
    trackOrder: 'Buyurtmani kuzatish',
    contactTitle: 'Aloqa',
    restaurant: 'Zar Kebab restorani',
    contactSub: 'Buyurtmani o‘zgartirish uchun Telegram yoki telefon orqali restoranga murojaat qiling.',
    loading: 'Yuklanmoqda...',
    authError: 'Autentifikatsiya uchun sahifani Telegram botdan oching.',
    loadError: 'Telegram mini ilovasini yuklab bo‘lmadi.',
    submitError: 'Buyurtmani yuborib bo‘lmadi.',
    invalidCard: '8 xonali karta raqamini kiriting.',
    availableBalance: amount => `Mavjud balans: ${amount}`,
    cardNotFound: 'Karta topilmadi.',
    liveUpdates: 'Jonli yangilanadi',
  },
  ru: {
    menu: 'Меню',
    orders: 'Заказы',
    card: 'Карта',
    contact: 'Контакты',
    add: 'Добавить',
    items: 'поз.',
    checkout: 'Оформить',
    searchMenu: 'Поиск по меню',
    all: 'Все',
    back: 'Назад',
    checkoutTitle: 'Оформление',
    orderType: 'Тип заказа',
    takeaway: 'Заказ с собой',
    dineIn: 'В зале',
    delivery: 'Доставка',
    loyaltyCard: 'Карта лояльности',
    cardPlaceholder: '8 цифр карты',
    cardNumberPlaceholder: '8-значный номер карты',
    check: 'Проверить',
    checkBalance: 'Проверить баланс',
    redeemAmount: 'Сумма списания',
    notes: 'Комментарий к заказу',
    total: 'Итого',
    sendingOrder: 'Отправляем заказ...',
    submitOrder: 'Отправить заказ',
    myOrders: 'Мои заказы',
    loadingOrders: 'Загружаем заказы...',
    noOrders: 'Заказов из Telegram пока нет.',
    orderSent: 'Заказ отправлен',
    orderSentSub: 'Ваш заказ уже виден команде.',
    trackOrder: 'Отследить заказ',
    contactTitle: 'Контакты',
    restaurant: 'Ресторан Zar Kebab',
    contactSub: 'Чтобы изменить заказ, свяжитесь с рестораном напрямую в Telegram или по телефону.',
    loading: 'Загрузка...',
    authError: 'Откройте эту страницу из Telegram-бота для авторизации.',
    loadError: 'Не удалось загрузить Telegram mini app.',
    submitError: 'Не удалось отправить заказ.',
    invalidCard: 'Введите 8-значный номер карты.',
    availableBalance: amount => `Доступный баланс: ${amount}`,
    cardNotFound: 'Карта не найдена.',
    liveUpdates: 'Обновляется автоматически',
  },
  en: {
    menu: 'Menu',
    orders: 'Orders',
    card: 'Card',
    contact: 'Contact',
    add: 'Add',
    items: 'items',
    checkout: 'Checkout',
    searchMenu: 'Search menu',
    all: 'All',
    back: 'Back',
    checkoutTitle: 'Checkout',
    orderType: 'Order type',
    takeaway: 'Takeaway',
    dineIn: 'Dine in',
    delivery: 'Delivery',
    loyaltyCard: 'Loyalty card',
    cardPlaceholder: '8-digit card',
    cardNumberPlaceholder: '8-digit card number',
    check: 'Check',
    checkBalance: 'Check balance',
    redeemAmount: 'Redeem amount',
    notes: 'Order notes',
    total: 'Total',
    sendingOrder: 'Sending order...',
    submitOrder: 'Submit order',
    myOrders: 'My Orders',
    loadingOrders: 'Loading orders...',
    noOrders: 'No Telegram orders yet.',
    orderSent: 'Order sent',
    orderSentSub: 'Your order is now visible to the team.',
    trackOrder: 'Track order',
    contactTitle: 'Contact',
    restaurant: 'Zar Kebab Restaurant',
    contactSub: 'For changes to an order, please contact the restaurant directly from Telegram or by phone.',
    loading: 'Loading...',
    authError: 'Open this page from the Telegram bot to authenticate.',
    loadError: 'Telegram Mini App failed to load.',
    submitError: 'Could not submit order.',
    invalidCard: 'Enter an 8-digit card number.',
    availableBalance: amount => `Available balance: ${amount}`,
    cardNotFound: 'Card not found.',
    liveUpdates: 'Live updates',
  },
}

function tr(lang) {
  return T[lang] || T.en
}

function SafeImage({ src, alt }) {
  return (
    <ImageLoadShimmer
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-[#F4EFE7]">
          <UtensilsCrossed size={30} className="text-[#D39D70]" />
        </div>
      }
    />
  )
}

function BottomNav({ active, onSelect, cartCount, lang }) {
  const l = tr(lang)
  const items = [
    { id: 'menu', label: l.menu, Icon: MenuIcon },
    { id: 'orders', label: l.orders, Icon: ReceiptText },
    { id: 'loyalty', label: l.card, Icon: BadgePercent },
    { id: 'contact', label: l.contact, Icon: MessageCircle },
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
  const l = tr(lang)
  const name = getItemName(item, lang)
  const grams = gramsLabel(item, lang)
  const millilitres = millilitresLabel(item, lang)
  const kcal = kcalLabel(item, lang)
  const pricing = getMenuPricing(item)
  return (
    <article className="overflow-hidden rounded-[8px] border border-[#E8DED2] bg-white shadow-sm">
      <div className="aspect-[4/3]">
        <SafeImage src={item.image_url} alt={name} />
      </div>
      <div className="flex min-h-[152px] flex-col p-3">
        <h3 className="line-clamp-2 text-[15px] font-black leading-snug text-[#1E2B24]">{name}</h3>
        <p className="mt-1 line-clamp-1 text-[12px] font-semibold text-[#8B9388]">{getItemDesc(item, lang)}</p>
        {(grams || millilitres || kcal) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {grams && (
              <span className="rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {grams}
              </span>
            )}
            {millilitres && (
              <span className="rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {millilitres}
              </span>
            )}
            {kcal && (
              <span className="rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {kcal}
              </span>
            )}
          </div>
        )}
        <div className="mt-auto">
          {pricing.discounted && (
            <p className="text-[12px] font-bold text-[#8B9388] line-through">{formatCurrency(pricing.oldPrice)}</p>
          )}
          <p className={`${pricing.discounted ? 'text-red-600' : 'text-[#FF5A00]'} text-[16px] font-black`}>
            {formatCurrency(pricing.price)}
          </p>
        </div>
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
            {l.add}
          </button>
        )}
      </div>
    </article>
  )
}

function CartBar({ total, count, onCheckout, lang }) {
  const l = tr(lang)
  if (count === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-[74px] z-30 px-3">
      <button
        onClick={onCheckout}
        className="mx-auto flex h-14 w-full max-w-md items-center justify-between rounded-[8px] bg-[#FF5A00] px-4 font-black text-white shadow-[0_10px_28px_rgba(255,90,0,0.28)]"
      >
        <span>{count} {l.items}</span>
        <span className="flex items-center gap-2">
          {l.checkout}
          <ShoppingBag size={18} />
          {formatCurrency(total)}
        </span>
      </button>
    </div>
  )
}

function MenuView({ categories, items, cart, lang, onAdd, onIncrement, onDecrement, onCheckout }) {
  const l = tr(lang)
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
              placeholder={l.searchMenu}
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
                {category.id === 'all' ? l.all : getCategoryName(category, lang)}
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
      <CartBar total={total} count={count} onCheckout={onCheckout} lang={lang} />
    </>
  )
}

function CheckoutView({ cart, onBack, onSubmit, submitting, loyalty, onLoyaltyChange, onCheckLoyalty, lang }) {
  const l = tr(lang)
  const [orderType, setOrderType] = useState('takeaway')
  const [notes, setNotes] = useState('')
  const [redeem, setRedeem] = useState('')
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const redeemAmount = Math.min(Math.max(0, Math.round(Number(redeem) || 0)), loyalty.balance || 0, subtotal)
  const total = Math.max(0, subtotal - redeemAmount)

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-3">
      <button onClick={onBack} className="mb-3 flex h-10 items-center gap-2 rounded-[8px] text-sm font-black text-[#4C5B52]">
        <ChevronLeft size={20} /> {l.back}
      </button>
      <h1 className="text-2xl font-black text-[#163B2D]">{l.checkoutTitle}</h1>
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
        <p className="text-sm font-black text-[#163B2D]">{l.orderType}</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            ['takeaway', l.takeaway],
            ['dine_in', l.dineIn],
            ['delivery', l.delivery],
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
        <p className="text-sm font-black text-[#163B2D]">{l.loyaltyCard}</p>
        <div className="mt-2 flex gap-2">
          <input
            value={loyalty.cardNumber}
            onChange={event => onLoyaltyChange(event.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            placeholder={l.cardPlaceholder}
            className="h-11 min-w-0 flex-1 rounded-[8px] border border-[#E8DED2] px-3 text-sm font-semibold outline-none focus:border-[#FF5A00]"
          />
          <button onClick={onCheckLoyalty} className="h-11 rounded-[8px] bg-[#163B2D] px-4 text-sm font-black text-white">
            {l.check}
          </button>
        </div>
        {loyalty.message && <p className="mt-2 text-sm font-bold text-[#687366]">{loyalty.message}</p>}
        {loyalty.valid && (
          <input
            value={redeem}
            onChange={event => setRedeem(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder={l.redeemAmount}
            className="mt-3 h-11 w-full rounded-[8px] border border-[#E8DED2] px-3 text-sm font-semibold outline-none focus:border-[#FF5A00]"
          />
        )}
      </section>

      <textarea
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder={l.notes}
        rows={3}
        className="mt-4 w-full resize-none rounded-[8px] border border-[#E8DED2] bg-white p-3 text-sm font-semibold outline-none focus:border-[#FF5A00]"
      />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DED2] bg-white px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <div className="mx-auto max-w-md">
          <div className="mb-3 flex items-center justify-between text-sm font-black">
            <span>{l.total}</span>
            <span className="text-xl text-[#FF5A00]">{formatCurrency(total)}</span>
          </div>
          <button
            disabled={submitting}
            onClick={() => onSubmit({ orderType, notes, loyaltyRedeemAmount: redeemAmount })}
            className="h-14 w-full rounded-[8px] bg-[#FF5A00] font-black text-white disabled:opacity-60"
          >
            {submitting ? l.sendingOrder : l.submitOrder}
          </button>
        </div>
      </div>
    </main>
  )
}

function OrdersView({ token, lang }) {
  const l = tr(lang)
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
      <h1 className="text-2xl font-black text-[#163B2D]">{l.myOrders}</h1>
      <div className="mt-4 space-y-3">
        {loading ? <p className="font-semibold text-[#687366]">{l.loadingOrders}</p> : orders.length === 0 ? (
          <p className="rounded-[8px] border border-[#E8DED2] bg-white p-4 font-semibold text-[#687366]">{l.noOrders}</p>
        ) : orders.map(order => (
          <div key={order.id} className="rounded-[8px] border border-[#E8DED2] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black text-[#163B2D]">{order.order_number || order.id}</p>
              <span className="rounded-full bg-[#F5EFE6] px-3 py-1 text-xs font-black text-[#687366]">{order.status}</span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#8B9388]">{(order.items || []).length} {l.items} · {formatCurrency(order.total || 0)}</p>
          </div>
        ))}
      </div>
    </main>
  )
}

function LoyaltyView({ loyalty, onLoyaltyChange, onCheckLoyalty, lang }) {
  const l = tr(lang)
  return (
    <main className="mx-auto max-w-md px-4 py-4 pb-28">
      <h1 className="text-2xl font-black text-[#163B2D]">{l.loyaltyCard}</h1>
      <section className="mt-4 rounded-[8px] border border-[#E8DED2] bg-white p-4">
        <input
          value={loyalty.cardNumber}
          onChange={event => onLoyaltyChange(event.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          placeholder={l.cardNumberPlaceholder}
          className="h-12 w-full rounded-[8px] border border-[#E8DED2] px-3 font-semibold outline-none focus:border-[#FF5A00]"
        />
        <button onClick={onCheckLoyalty} className="mt-3 h-12 w-full rounded-[8px] bg-[#163B2D] font-black text-white">
          {l.checkBalance}
        </button>
        {loyalty.message && <p className="mt-3 font-bold text-[#687366]">{loyalty.message}</p>}
      </section>
    </main>
  )
}

function ContactView({ lang }) {
  const l = tr(lang)
  return (
    <main className="mx-auto max-w-md px-4 py-4 pb-28">
      <h1 className="text-2xl font-black text-[#163B2D]">{l.contactTitle}</h1>
      <section className="mt-4 space-y-3 rounded-[8px] border border-[#E8DED2] bg-white p-4">
        <p className="flex items-center gap-2 font-bold text-[#4C5B52]"><MapPin size={18} /> {l.restaurant}</p>
        <p className="font-semibold text-[#687366]">{l.contactSub}</p>
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
  const l = tr(lang)

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
          throw new Error(l.authError)
        }

        const menu = await loadTelegramMenuData()
        if (!cancelled) {
          setCategories(menu.categories)
          setItems(menu.items)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || l.loadError)
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
      setLoyalty(prev => ({ ...prev, valid: false, balance: 0, message: l.invalidCard }))
      return
    }
    try {
      const data = await telegramApi(`/api/telegram/loyalty/${loyalty.cardNumber}`, { method: 'GET', token })
      setLoyalty(prev => ({
        ...prev,
        valid: data.valid,
        balance: data.balance || 0,
        message: data.valid ? l.availableBalance(formatCurrency(data.balance || 0)) : l.cardNotFound,
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
      setError(err.message || l.submitError)
      webApp?.HapticFeedback?.notificationOccurred?.('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#FBF6EE] font-black text-[#163B2D]">{l.loading}</div>
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
          lang={lang}
          onLoyaltyChange={cardNumber => setLoyalty({ cardNumber, valid: false, balance: 0, message: '' })}
          onCheckLoyalty={checkLoyalty}
        />
      )}
      {view === 'success' && (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 pb-28 text-center">
          <CheckCircle2 size={58} className="text-[#16A34A]" />
          <h1 className="mt-4 text-2xl font-black text-[#163B2D]">{l.orderSent}</h1>
          <p className="mt-2 font-semibold text-[#687366]">{l.orderSentSub}</p>
          <p className="mt-4 rounded-[8px] bg-white px-4 py-3 font-black text-[#FF5A00]">{successOrder?.order_number || successOrder?.id}</p>
          <button onClick={() => setView('orders')} className="mt-4 h-12 w-full rounded-[8px] bg-[#163B2D] font-black text-white">
            {l.trackOrder}
          </button>
        </main>
      )}
      {view === 'orders' && <OrdersView token={token} lang={lang} />}
      {view === 'loyalty' && (
        <LoyaltyView
          loyalty={loyalty}
          lang={lang}
          onLoyaltyChange={cardNumber => setLoyalty({ cardNumber, valid: false, balance: 0, message: '' })}
          onCheckLoyalty={checkLoyalty}
        />
      )}
      {view === 'contact' && <ContactView lang={lang} />}

      {view !== 'checkout' && (
        <BottomNav
          active={view === 'success' ? 'orders' : view}
          cartCount={cartCount}
          lang={lang}
          onSelect={setView}
        />
      )}
      {view === 'orders' && (
        <div className="pointer-events-none fixed right-4 top-4 flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-black text-[#687366] shadow-sm">
          <Clock3 size={14} /> {l.liveUpdates}
        </div>
      )}
    </div>
  )
}
