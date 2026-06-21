import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Instagram, Phone, Search, Send, UtensilsCrossed } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getCategoryName } from '../lib/i18n'
import { getBrandLogo } from '../lib/brandLogo'
import { getMenuPricing } from '../lib/menuPricing'
import {
  MENU_CURRENCIES,
  DEFAULT_MENU_CURRENCY,
  formatMenuCurrency,
  getDefaultMenuCurrency,
  loadMenuCurrencyRates,
  normalizeMenuCurrency,
  saveMenuCurrency,
} from '../lib/menuCurrency'
import { isCustomerMenuCategory, isCustomerMenuItem } from '../lib/menuItems'
import { useApp } from '../store/AppContext'
import { findMenuItemByLinkKey, getMenuItemPublicPath } from '../lib/menuLinks'
import { getMenuItemForPriceMode } from '../lib/priceModes'
import LanguageSwitcher from '../components/LanguageSwitcher'
import MenuCategoryScroller, { menuCategorySectionId } from '../components/MenuCategoryScroller'
import {
  ProductCard as MenuProductCard,
  ProductDetailPage as MenuProductDetailPage,
} from '../components/MenuProductCards'

const PUBLIC_CONTACTS = {
  telegram: {
    label: 'Telegram',
    href: 'https://t.me/zarkebab',
  },
  phone: {
    label: '+998 90 509-55-45',
    href: 'tel:+998905095545',
  },
  instagram: {
    label: '@zarkebab',
    href: 'https://www.instagram.com/zarkebab',
  },
}

async function loadPublicMenuData() {
  const rpcRes = await supabase.rpc('get_public_menu_data')

  if (!rpcRes.error && rpcRes.data) {
    const categories = (rpcRes.data.categories || []).filter(isCustomerMenuCategory)
    const categoryIds = new Set(categories.map(category => category.id))
    return {
      categories,
      items: (rpcRes.data.items || []).filter(item => isCustomerMenuItem(item) && (!item.category_id || categoryIds.has(item.category_id))),
      source: 'rpc',
    }
  }

  console.warn('[guest-menu] public menu RPC unavailable, falling back to direct selects', rpcRes.error)
  const [catRes, itemRes] = await Promise.all([
    supabase.from('menu_categories').select('*').order('sort_order'),
    supabase.from('menu_items').select('*').eq('available', true).order('sort_order'),
  ])

  if (catRes.error || itemRes.error) {
    throw catRes.error || itemRes.error
  }

  const categories = (catRes.data || []).filter(isCustomerMenuCategory)
  const categoryIds = new Set(categories.map(category => category.id))
  return {
    categories,
    items: (itemRes.data || []).filter(item => isCustomerMenuItem(item) && (!item.category_id || categoryIds.has(item.category_id))),
    source: 'direct',
    rpcError: rpcRes.error,
  }
}

export default function PublicMenu({ premium = false }) {
  const { itemId } = useParams()
  const navigate = useNavigate()
  const { state } = useApp()
  const appLang = state.lang || 'ru'

  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailItem, setDetailItem] = useState(null)
  const [missingItemLink, setMissingItemLink] = useState(false)
  const [premiumLang, setPremiumLang] = useState('en')
  const [menuCurrency, setMenuCurrency] = useState(() => premium ? 'USD' : getDefaultMenuCurrency())
  const [currencyRates, setCurrencyRates] = useState({ UZS: 1 })
  const menuBasePath = premium ? '/premium-menu' : '/menu'
  const lang = premium ? premiumLang : appLang
  const showDetailOverlay = Boolean(detailItem)
  const savedScrollRef = useRef(0)
  const menuLoadSeqRef = useRef(0)

  const refreshPublicMenu = useCallback(async ({ showLoading = false } = {}) => {
    const seq = menuLoadSeqRef.current + 1
    menuLoadSeqRef.current = seq
    if (showLoading) setLoading(true)
    setError('')
    try {
      const data = await loadPublicMenuData()
      if (menuLoadSeqRef.current !== seq) return
      if (data.source === 'direct' && data.categories.length === 0 && data.items.length === 0 && data.rpcError) {
        throw new Error('Public menu SQL has not been applied yet. Run supabase/009_guest_public_menu.sql.')
      }
      setCategories(data.categories)
      setItems(data.items)
    } catch (err) {
      if (menuLoadSeqRef.current !== seq) return
      console.error('[guest-menu] failed to load public menu', err)
      setError(
        lang === 'uz'
          ? 'Menyuni yuklab bo‘lmadi.'
          : lang === 'ru'
            ? 'Не удалось загрузить меню.'
            : 'Could not load the menu.'
      )
    } finally {
      if (menuLoadSeqRef.current === seq) setLoading(false)
    }
  }, [lang])

  useEffect(() => {
    refreshPublicMenu({ showLoading: true })
  }, [refreshPublicMenu])

  useEffect(() => {
    function refreshWhenActive() {
      if (document.visibilityState === 'visible') {
        refreshPublicMenu({ showLoading: false })
      }
    }

    document.addEventListener('visibilitychange', refreshWhenActive)
    window.addEventListener('focus', refreshWhenActive)
    window.addEventListener('online', refreshWhenActive)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenActive)
      window.removeEventListener('focus', refreshWhenActive)
      window.removeEventListener('online', refreshWhenActive)
    }
  }, [refreshPublicMenu])

  useEffect(() => {
    if (loading) return
    if (!itemId) {
      setDetailItem(null)
      setMissingItemLink(false)
      return
    }
    const linkedItems = premium ? items.map(item => getMenuItemForPriceMode(item, 'tourist')) : items
    const linkedItem = findMenuItemByLinkKey(linkedItems, itemId)
    setDetailItem(linkedItem)
    setMissingItemLink(!linkedItem)
  }, [itemId, items, loading, premium])

  useEffect(() => {
    if (menuCurrency === DEFAULT_MENU_CURRENCY) return
    let cancelled = false
    loadMenuCurrencyRates()
      .then(rates => {
        if (!cancelled) setCurrencyRates(rates)
      })
    return () => { cancelled = true }
  }, [menuCurrency])

  const q = search.trim().toLowerCase()
  const categoryCards = useMemo(() => [{ id: 'all' }, ...categories], [categories])
  const displayItems = useMemo(
    () => premium ? items.map(item => getMenuItemForPriceMode(item, 'tourist')) : items,
    [items, premium]
  )
  const itemCounts = useMemo(() => {
    const counts = { all: displayItems.length }
    displayItems.forEach(item => { counts[item.category_id] = (counts[item.category_id] || 0) + 1 })
    return counts
  }, [displayItems])

  const filteredItems = useMemo(() => {
    return displayItems.filter(item => {
      const names = [item.name_uz, item.name_ru, item.name_en, item.description_uz, item.description_ru, item.description_en]
      const matchesSearch = !q || names.some(value => value?.toLowerCase().includes(q))
      return matchesSearch
    })
  }, [displayItems, q])

  const groupedSections = useMemo(() => {
    const sections = categories
      .map(cat => ({
        cat,
        items: filteredItems.filter(item => item.category_id === cat.id),
      }))
      .filter(section => section.items.length > 0)

    const categoryIds = new Set(categories.map(cat => cat.id))
    const uncategorized = filteredItems.filter(item => !categoryIds.has(item.category_id))
    if (uncategorized.length > 0) {
      sections.push({
        cat: { id: 'uncategorized', name_uz: 'Boshqa', name_ru: 'Другое', name_en: 'Other' },
        items: uncategorized,
      })
    }

    return sections
  }, [categories, filteredItems])

  const dealItems = useMemo(() =>
    filteredItems.filter(item => getMenuPricing(item).discounted),
    [filteredItems]
  )
  const priceFormatter = useMemo(
    () => amount => formatMenuCurrency(amount, menuCurrency, currencyRates),
    [menuCurrency, currencyRates]
  )

  const dealsTitle = lang === 'uz' ? 'Chegirmalar' : lang === 'ru' ? 'Акции' : 'Deals'
  const menuTitle = premium
    ? (lang === 'uz' ? 'Premium menyu' : lang === 'ru' ? 'Премиум меню' : 'Premium Menu')
    : (lang === 'uz' ? 'Menyu' : lang === 'ru' ? 'Меню' : 'Menu')
  const menuSubtitle = premium ? '' : (lang === 'uz' ? 'Buyurtma berish uchun ofitsiantga murojaat qiling.' : lang === 'ru' ? 'Для заказа обратитесь к официанту.' : 'Please ask your waiter to order.')

  const categoryMap = useMemo(() => {
    const map = {}
    categories.forEach(cat => { map[cat.id] = cat })
    return map
  }, [categories])

  function openDetail(item) {
    savedScrollRef.current = window.scrollY
    setDetailItem(item)
    navigate(getMenuItemPublicPath(item, menuBasePath))
  }

  function closeDetail() {
    const scrollY = savedScrollRef.current
    setDetailItem(null)
    setMissingItemLink(false)
    navigate(menuBasePath)
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, behavior: 'instant' })
    })
  }

  function changeMenuCurrency(currency) {
    const normalized = normalizeMenuCurrency(currency)
    setMenuCurrency(premium ? normalized : saveMenuCurrency(normalized))
  }

  return (
    <div className="min-h-screen bg-[#FAF6EE] pt-[73px] text-[#1F2937]">
      <header className="fixed left-0 right-0 top-0 z-40 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img
              src={getBrandLogo(lang)}
              alt="Zar Kebab"
              className="h-12 w-auto max-w-[150px] object-contain"
            />
            <p className="text-xs font-bold uppercase tracking-wider text-[#ff5a00]">
              {menuTitle}
            </p>
            {menuSubtitle && (
              <p className="hidden text-xs font-semibold text-[#8A94A6] sm:block">
                {menuSubtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="hidden items-center gap-1 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-1 sm:flex">
              {MENU_CURRENCIES.map(currency => (
                <button
                  key={currency}
                  type="button"
                  onClick={() => changeMenuCurrency(currency)}
                  className={`h-7 rounded-lg px-2.5 text-[11px] font-black transition-colors ${
                    menuCurrency === currency
                      ? 'bg-white text-[#ff5a00] shadow-sm'
                      : 'text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  {currency}
                </button>
              ))}
            </div>
            <a
              href={PUBLIC_CONTACTS.telegram.href}
              target="_blank"
              rel="noreferrer"
              aria-label={PUBLIC_CONTACTS.telegram.label}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700 transition-colors hover:bg-sky-100"
            >
              <Send size={16} />
            </a>
            <a
              href={PUBLIC_CONTACTS.phone.href}
              aria-label={PUBLIC_CONTACTS.phone.label}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <Phone size={16} />
            </a>
            <a
              href={PUBLIC_CONTACTS.instagram.href}
              target="_blank"
              rel="noreferrer"
              aria-label={PUBLIC_CONTACTS.instagram.label}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-700 transition-colors hover:bg-rose-100"
            >
              <Instagram size={16} />
            </a>
          </div>
          {premium ? (
            <LanguageSwitcher value={lang} onChange={setPremiumLang} />
          ) : (
            <LanguageSwitcher />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-5">
        <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={lang === 'uz' ? 'Menyudan qidirish...' : lang === 'ru' ? 'Поиск по меню...' : 'Search menu...'}
              className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-[#ff5a00] focus:bg-white focus:ring-2 focus:ring-[#ff5a00]/15"
            />
          </div>
          <div className="flex items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-1 sm:hidden">
            {MENU_CURRENCIES.map(currency => (
              <button
                key={currency}
                type="button"
                onClick={() => changeMenuCurrency(currency)}
                className={`h-9 flex-1 rounded-xl px-2 text-[12px] font-black transition-colors ${
                  menuCurrency === currency
                    ? 'bg-white text-[#ff5a00] shadow-sm'
                    : 'text-[#6B7280]'
                }`}
              >
                {currency}
              </button>
            ))}
          </div>
          </div>
        </div>

        <MenuCategoryScroller
          categories={categoryCards}
          activeCategoryId={activeCategory}
          onCategoryClick={setActiveCategory}
          onActiveCategoryChange={setActiveCategory}
          lang={lang}
          itemCounts={itemCounts}
          sectionPrefix="public-menu-category"
          topOffset={73}
          scrollOffset={116}
          className="mb-5 mt-3 rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm"
          collapsedPosition="fixed"
          collapsedClassName="z-50 px-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-[1180px] sm:-translate-x-1/2"
        />

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="overflow-hidden rounded-[24px] border border-[#E5E7EB] bg-white shadow-sm">
                <div className="aspect-[4/3] animate-pulse bg-orange-50" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
                  <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-100 bg-red-50 p-10 text-center">
            <p className="font-semibold text-red-700">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-black text-red-700 shadow-sm"
            >
              {lang === 'uz' ? 'Qayta urinish' : lang === 'ru' ? 'Попробовать снова' : 'Try again'}
            </button>
          </div>
        ) : missingItemLink ? (
          <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <UtensilsCrossed size={28} className="text-orange-300" />
            </div>
            <p className="font-black text-[#1F2937]">
              {lang === 'uz' ? 'Bu mahsulot topilmadi' : lang === 'ru' ? 'Позиция не найдена' : 'Item not found'}
            </p>
            <p className="mt-1 text-sm text-[#8A94A6]">
              {lang === 'uz' ? 'U o‘chirilgan yoki hozir mavjud emas.' : lang === 'ru' ? 'Возможно, она удалена или сейчас недоступна.' : 'It may have been removed or is not currently available.'}
            </p>
            <button
              onClick={() => navigate(menuBasePath)}
              className="mt-4 rounded-xl bg-[#ff5a00] px-4 py-2 text-sm font-black text-white shadow-sm"
            >
              {lang === 'uz' ? 'Menyuga qaytish' : lang === 'ru' ? 'Вернуться в меню' : 'Back to menu'}
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-[28px] border border-[#E5E7EB] bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <UtensilsCrossed size={28} className="text-orange-300" />
            </div>
            <p className="font-black text-[#1F2937]">
              {lang === 'uz' ? 'Menyu hozircha mavjud emas' : lang === 'ru' ? 'Меню пока недоступно' : 'Menu is not available yet'}
            </p>
            <p className="mt-1 text-sm text-[#8A94A6]">
              {lang === 'uz' ? 'Iltimos, keyinroq qayta urinib ko‘ring.' : lang === 'ru' ? 'Пожалуйста, попробуйте позже.' : 'Please try again later.'}
            </p>
          </div>
        ) : (
          groupedSections ? (
            <div className="space-y-8">
              {dealItems.length > 0 && (
                <section id="public-menu-deals" className="scroll-mt-32">
                  <div className="mb-3 flex items-center gap-2.5">
                    <h2 className="text-xl font-black uppercase tracking-tight text-red-600">
                      {dealsTitle}
                    </h2>
                    <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600">
                      {dealItems.length} {lang === 'uz' ? 'ta' : lang === 'ru' ? 'шт' : 'items'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {dealItems.map((item, index) => (
                      <MenuProductCard
                        key={`deal-${item.id}`}
                        item={item}
                        qty={0}
                        lang={lang}
                        eager={index < 4}
                        onOpenDetail={openDetail}
                        readOnly
                        formatPrice={priceFormatter}
                        linkBasePath={menuBasePath}
                      />
                    ))}
                  </div>
                </section>
              )}
              {groupedSections.map(section => (
                <section
                  key={section.cat.id}
                  id={menuCategorySectionId('public-menu-category', section.cat.id)}
                  className="scroll-mt-32"
                >
                  <div className="mb-3 flex items-center gap-2.5">
                    <h2 className="text-xl font-black uppercase tracking-tight text-[#1F2937]">
                      {getCategoryName(section.cat, lang)}
                    </h2>
                    <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-bold text-[#6B7280]">
                      {section.items.length} {lang === 'uz' ? 'ta' : lang === 'ru' ? 'шт' : 'items'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {section.items.map((item, index) => (
                      <MenuProductCard
                        key={item.id}
                        item={item}
                        qty={0}
                        lang={lang}
                        eager={groupedSections[0]?.cat.id === section.cat.id && index < 6}
                        onOpenDetail={openDetail}
                        readOnly
                        formatPrice={priceFormatter}
                        linkBasePath={menuBasePath}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map((item, index) => (
                <MenuProductCard
                  key={item.id}
                  item={item}
                  qty={0}
                  lang={lang}
                  eager={index < 8}
                  onOpenDetail={openDetail}
                  readOnly
                  formatPrice={priceFormatter}
                  linkBasePath={menuBasePath}
                />
              ))}
            </div>
          )
        )}
      </main>
      {showDetailOverlay && (
        <div className="fixed inset-0 z-[80] bg-[#FAF6EE]">
          <MenuProductDetailPage
            item={detailItem}
            category={categoryMap[detailItem.category_id]}
            currentQty={0}
            currentNotes=""
            lang={lang}
            onBack={closeDetail}
            onCancel={closeDetail}
            onAddToCart={() => {}}
            readOnly
            formatPrice={priceFormatter}
            linkBasePath={menuBasePath}
          />
        </div>
      )}
    </div>
  )
}
