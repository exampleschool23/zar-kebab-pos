import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Instagram, Phone, Search, Send, UtensilsCrossed, X } from 'lucide-react'
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

function HeaderSelect({ value, onChange, options, ariaLabel, className = '' }) {
  return (
    <label className={`relative inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-xs font-black text-[#1F2937] shadow-sm transition-colors hover:bg-white ${className}`}>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        aria-label={ariaLabel}
        className="h-full appearance-none rounded-xl bg-transparent py-0 pl-3 pr-7 text-xs font-black uppercase outline-none"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={13} strokeWidth={3} className="pointer-events-none absolute right-2.5 text-[#64748B]" />
    </label>
  )
}

function PublicContactButtons({ className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-1.5 ${className}`}>
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
  )
}

function MenuSectionHeader({ title, tone = 'default' }) {
  const titleClass = tone === 'deal' ? 'text-red-600' : 'text-[#1F2937]'

  return (
    <div className="mb-4 flex items-center gap-4 sm:mb-5 sm:gap-5">
      <div className="h-px min-w-0 flex-1 bg-[#C9C9C9]" />
      <h2 className={`max-w-[70%] flex-shrink-0 text-center text-[24px] font-black leading-none tracking-tight sm:text-[30px] ${titleClass}`}>
        {title}
      </h2>
      <div className="h-px min-w-0 flex-1 bg-[#C9C9C9]" />
    </div>
  )
}

function MobileSearchPage({
  open,
  value,
  onChange,
  onClose,
  items,
  lang,
  onOpenDetail,
  formatPrice,
  linkBasePath,
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  if (!open) return null

  const labels = {
    title: lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search',
    placeholder: lang === 'uz' ? 'Menyudan qidirish...' : lang === 'ru' ? 'Поиск по меню...' : 'Search menu...',
    clear: lang === 'uz' ? 'Tozalash' : lang === 'ru' ? 'Очистить' : 'Clear',
    close: lang === 'uz' ? 'Yopish' : lang === 'ru' ? 'Закрыть' : 'Close',
    emptyTitle: lang === 'uz' ? 'Hech narsa topilmadi' : lang === 'ru' ? 'Ничего не найдено' : 'No results found',
    emptyText: lang === 'uz' ? 'Boshqa nom yoki taomni qidirib ko‘ring.' : lang === 'ru' ? 'Попробуйте другое название или блюдо.' : 'Try another dish name or keyword.',
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-white text-[#1F2937]">
      <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#64748B] transition-colors hover:border-orange-200 hover:text-[#ff5a00]"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg font-black text-[#1F2937]">{labels.title}</h1>
        </div>

        <div className="relative flex h-12 items-center rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/20">
          <Search size={18} className="pointer-events-none absolute left-4 text-[#9CA3AF]" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={labels.placeholder}
            className="h-full w-full bg-transparent pl-12 pr-12 text-base text-[#1F2937] placeholder-[#9CA3AF] outline-none"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label={labels.clear}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-[#9CA3AF] transition-colors hover:bg-white hover:text-[#ff5a00]"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {items.length === 0 ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50">
              <UtensilsCrossed size={28} className="text-orange-300" />
            </div>
            <p className="font-black text-[#1F2937]">{labels.emptyTitle}</p>
            <p className="mt-1 max-w-[260px] text-sm text-[#8A94A6]">{labels.emptyText}</p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-4 pb-6 md:grid-cols-3 xl:grid-cols-4">
            {items.map((item, index) => (
              <MenuProductCard
                key={item.id}
                item={item}
                qty={0}
                lang={lang}
                eager={index < 4}
                onOpenDetail={itemToOpen => {
                  onClose()
                  onOpenDetail(itemToOpen)
                }}
                readOnly
                formatPrice={formatPrice}
                linkBasePath={linkBasePath}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
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
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [headerOffset, setHeaderOffset] = useState(() => globalThis.window?.innerWidth < 640 ? 122 : 73)
  const [premiumLang, setPremiumLang] = useState('en')
  const [menuCurrency, setMenuCurrency] = useState(() => premium ? 'USD' : getDefaultMenuCurrency())
  const [currencyRates, setCurrencyRates] = useState({ UZS: 1 })
  const menuBasePath = premium ? '/premium-menu' : '/menu'
  const lang = premium ? premiumLang : appLang
  const showDetailOverlay = Boolean(detailItem)
  const headerRef = useRef(null)
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
      setError('load_failed')
    } finally {
      if (menuLoadSeqRef.current === seq) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshPublicMenu({ showLoading: true })
  }, [refreshPublicMenu])

  useEffect(() => {
    function updateHeaderOffset() {
      const header = headerRef.current
      const measuredHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 0
      setHeaderOffset(measuredHeight || (window.innerWidth < 640 ? 122 : 73))
    }

    updateHeaderOffset()
    const observer = typeof ResizeObserver !== 'undefined' && headerRef.current
      ? new ResizeObserver(updateHeaderOffset)
      : null
    observer?.observe(headerRef.current)
    const frame = requestAnimationFrame(updateHeaderOffset)
    window.addEventListener('resize', updateHeaderOffset)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', updateHeaderOffset)
    }
  }, [])

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

  const searchQuery = search.trim().toLowerCase()
  const displayItems = useMemo(
    () => premium ? items.map(item => getMenuItemForPriceMode(item, 'tourist')) : items,
    [items, premium]
  )
  const itemCounts = useMemo(() => {
    const counts = { all: displayItems.length }
    displayItems.forEach(item => { counts[item.category_id] = (counts[item.category_id] || 0) + 1 })
    return counts
  }, [displayItems])
  const categoryCards = useMemo(
    () => [{ id: 'all' }, ...categories.filter(category => (itemCounts[category.id] || 0) > 0)],
    [categories, itemCounts]
  )

  const searchResults = useMemo(() => {
    return displayItems.filter(item => {
      const names = [item.name_uz, item.name_ru, item.name_en, item.description_uz, item.description_ru, item.description_en]
      const matchesSearch = !searchQuery || names.some(value => value?.toLowerCase().includes(searchQuery))
      return matchesSearch
    })
  }, [displayItems, searchQuery])

  const groupedSections = useMemo(() => {
    const sections = categories
      .map(cat => ({
        cat,
        items: displayItems.filter(item => item.category_id === cat.id),
      }))
      .filter(section => section.items.length > 0)

    const categoryIds = new Set(categories.map(cat => cat.id))
    const uncategorized = displayItems.filter(item => !categoryIds.has(item.category_id))
    if (uncategorized.length > 0) {
      sections.push({
        cat: { id: 'uncategorized', name_uz: 'Boshqa', name_ru: 'Другое', name_en: 'Other' },
        items: uncategorized,
      })
    }

    return sections
  }, [categories, displayItems])

  const dealItems = useMemo(() =>
    displayItems.filter(item => getMenuPricing(item).discounted),
    [displayItems]
  )
  const priceFormatter = useMemo(
    () => amount => formatMenuCurrency(amount, menuCurrency, currencyRates),
    [menuCurrency, currencyRates]
  )

  const dealsTitle = lang === 'uz' ? 'Chegirmalar' : lang === 'ru' ? 'Акции' : 'Deals'
  const menuTitle = premium
    ? (lang === 'uz' ? 'Premium menyu' : lang === 'ru' ? 'Премиум меню' : 'Premium Menu')
    : (lang === 'uz' ? 'Menyu' : lang === 'ru' ? 'Меню' : 'Menu')
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
    <div className="min-h-screen bg-white text-[#1F2937]" style={{ paddingTop: headerOffset }}>
      <header ref={headerRef} className="fixed left-0 right-0 top-0 z-40 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
        <div className="relative mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-2 px-4 py-2 sm:flex sm:flex-nowrap sm:gap-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:flex-1 sm:gap-3 sm:pr-0 lg:pr-36">
            <div className="flex min-w-0 flex-shrink items-center gap-2 sm:gap-3">
              <img
                src={getBrandLogo(lang)}
                alt="Zar Kebab"
                className="h-10 w-auto max-w-[110px] flex-shrink-0 object-contain sm:h-12 sm:max-w-[150px]"
              />
              <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wider text-[#ff5a00] sm:text-xs">
                ZarKebab
              </p>
            </div>
          </div>
          <div className="col-start-1 row-start-2 flex items-center sm:contents">
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              aria-label={lang === 'uz' ? 'Qidirish' : lang === 'ru' ? 'Поиск' : 'Search'}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#64748B] transition-colors hover:border-orange-200 hover:bg-white hover:text-[#ff5a00] sm:h-10 sm:w-10"
            >
              <Search size={17} />
            </button>
          </div>

          <PublicContactButtons className="col-span-3 col-start-1 row-start-2 justify-self-center sm:absolute sm:left-1/2 sm:top-1/2 sm:w-auto sm:-translate-x-1/2 sm:-translate-y-1/2" />

          <div className="col-start-2 row-start-1 flex flex-shrink-0 items-center gap-1.5">
            <HeaderSelect
              value={menuCurrency}
              onChange={changeMenuCurrency}
              options={MENU_CURRENCIES.map(currency => ({
                value: currency,
                label: currency === 'UZS' ? '🇺🇿 UZS' : currency === 'USD' ? '🇺🇸 USD' : '🇪🇺 EUR',
              }))}
              ariaLabel={lang === 'uz' ? 'Valyuta' : lang === 'ru' ? 'Валюта' : 'Currency'}
            />
          </div>
          {premium ? (
            <LanguageSwitcher value={lang} onChange={setPremiumLang} className="col-start-3 row-start-1" />
          ) : (
            <LanguageSwitcher className="col-start-3 row-start-1" />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] px-4 pb-5 pt-2 sm:px-6">
        <MenuCategoryScroller
          categories={categoryCards}
          activeCategoryId={activeCategory}
          onCategoryClick={setActiveCategory}
          onActiveCategoryChange={setActiveCategory}
          lang={lang}
          itemCounts={itemCounts}
          sectionPrefix="public-menu-category"
          topOffset={headerOffset}
          scrollOffset={64}
          className="mb-6 mt-0 rounded-[24px] border border-[#E5E7EB] bg-white p-3 shadow-sm sm:mb-7 sm:rounded-[28px] sm:p-4"
          collapsedPosition="fixed"
          collapsedSurfaceClass="bg-white/95"
          collapsedClassName="z-50 px-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-[1280px] sm:-translate-x-1/2"
        />

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white shadow-sm">
                <div className="aspect-square animate-pulse bg-orange-50" />
                <div className="space-y-2.5 p-3">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
                  <div className="h-5 w-1/2 animate-pulse rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-100 bg-red-50 p-10 text-center">
            <p className="font-semibold text-red-700">
              {lang === 'uz'
                ? 'Menyuni yuklab bo‘lmadi.'
                : lang === 'ru'
                  ? 'Не удалось загрузить меню.'
                  : 'Could not load the menu.'}
            </p>
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
        ) : displayItems.length === 0 ? (
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
            <div className="space-y-7">
              {dealItems.length > 0 && (
                <section id="public-menu-deals" className="scroll-mt-32">
                  <MenuSectionHeader title={dealsTitle} tone="deal" />
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
                  <MenuSectionHeader title={getCategoryName(section.cat, lang)} />
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
              {displayItems.map((item, index) => (
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
        <div className="fixed inset-0 z-[80] bg-white">
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
            languageControl={premium
              ? <LanguageSwitcher value={lang} onChange={setPremiumLang} />
              : <LanguageSwitcher />}
          />
        </div>
      )}
      <MobileSearchPage
        open={mobileSearchOpen}
        value={search}
        onChange={setSearch}
        onClose={() => setMobileSearchOpen(false)}
        items={searchResults}
        lang={lang}
        onOpenDetail={openDetail}
        formatPrice={priceFormatter}
        linkBasePath={menuBasePath}
      />
    </div>
  )
}
