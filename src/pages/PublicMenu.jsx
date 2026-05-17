import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Search, UtensilsCrossed } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getCategoryName } from '../lib/i18n'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import {
  ProductCard as MenuProductCard,
  ProductDetailPage as MenuProductDetailPage,
} from './WaiterOrder'

async function loadPublicMenuData() {
  const rpcRes = await supabase.rpc('get_public_menu_data')

  if (!rpcRes.error && rpcRes.data) {
    return {
      categories: rpcRes.data.categories || [],
      items: rpcRes.data.items || [],
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

  return {
    categories: catRes.data || [],
    items: itemRes.data || [],
    source: 'direct',
    rpcError: rpcRes.error,
  }
}

export default function PublicMenu() {
  const navigate = useNavigate()
  const { state } = useApp()
  const { session } = useAuth()
  const lang = state.lang || 'ru'

  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detailItem, setDetailItem] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadMenu() {
      setLoading(true)
      setError('')
      try {
        const data = await loadPublicMenuData()
        if (cancelled) return
        console.log('[guest-menu] loaded public menu', {
          source: data.source,
          categories: data.categories.length,
          items: data.items.length,
        })
        if (data.source === 'direct' && data.categories.length === 0 && data.items.length === 0 && data.rpcError) {
          throw new Error('Public menu SQL has not been applied yet. Run supabase/009_guest_public_menu.sql.')
        }
        setCategories(data.categories)
        setItems(data.items)
      } catch (err) {
        if (cancelled) return
        console.error('[guest-menu] failed to load public menu', err)
        setError(
          lang === 'uz'
            ? 'Menyuni yuklab bo‘lmadi.'
            : lang === 'ru'
              ? 'Не удалось загрузить меню.'
              : 'Could not load the menu.'
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadMenu()
    return () => { cancelled = true }
  }, [lang])

  const q = search.trim().toLowerCase()
  const categoryCards = useMemo(() => [{ id: 'all' }, ...categories], [categories])
  const itemCounts = useMemo(() => {
    const counts = { all: items.length }
    items.forEach(item => { counts[item.category_id] = (counts[item.category_id] || 0) + 1 })
    return counts
  }, [items])

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesCategory = activeCategory === 'all' || item.category_id === activeCategory
      const names = [item.name_uz, item.name_ru, item.name_en, item.description_uz, item.description_ru, item.description_en]
      const matchesSearch = !q || names.some(value => value?.toLowerCase().includes(q))
      return matchesCategory && matchesSearch
    })
  }, [items, activeCategory, q])

  const groupedSections = useMemo(() => {
    if (activeCategory !== 'all' || q) return null
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
  }, [activeCategory, q, categories, filteredItems])

  const categoryMap = useMemo(() => {
    const map = {}
    categories.forEach(cat => { map[cat.id] = cat })
    return map
  }, [categories])

  function openDetail(item) {
    setDetailItem(item)
  }

  function closeDetail() {
    setDetailItem(null)
  }

  function handleOrderIntent() {
    navigate('/login')
  }

  if (detailItem) {
    return (
      <div className="h-screen bg-[#FAF6EE]">
        <MenuProductDetailPage
          item={detailItem}
          category={categoryMap[detailItem.category_id]}
          currentQty={0}
          currentNotes=""
          lang={lang}
          onBack={closeDetail}
          onCancel={closeDetail}
          onAddToCart={handleOrderIntent}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF6EE] text-[#1F2937]">
      <header className="sticky top-0 z-20 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#ff5a00] text-white shadow-sm shadow-orange-200">
            <UtensilsCrossed size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black uppercase tracking-tight">Zar Kebab</h1>
            <p className="text-xs font-bold uppercase tracking-wider text-[#ff5a00]">
              {lang === 'uz' ? 'Menyu' : lang === 'ru' ? 'Меню' : 'Menu'}
            </p>
          </div>
          <LanguageSwitcher />
          <button
            onClick={() => navigate(session ? '/' : '/login')}
            className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-[#64748B] hover:bg-[#F8FAFC]"
          >
            <LogIn size={16} />
            {session
              ? (lang === 'uz' ? 'Kabinet' : lang === 'ru' ? 'Кабинет' : 'Workspace')
              : (lang === 'uz' ? 'Kirish' : lang === 'ru' ? 'Войти' : 'Sign in')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-5">
        <div className="mb-5 rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={lang === 'uz' ? 'Menyudan qidirish...' : lang === 'ru' ? 'Поиск по меню...' : 'Search menu...'}
              className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] py-3 pl-11 pr-4 text-sm outline-none transition-all focus:border-[#ff5a00] focus:bg-white focus:ring-2 focus:ring-[#ff5a00]/15"
            />
          </div>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {categoryCards.map(cat => {
              const isAll = cat.id === 'all'
              const active = activeCategory === cat.id
              const title = isAll ? (lang === 'uz' ? 'Barchasi' : lang === 'ru' ? 'Все' : 'All') : getCategoryName(cat, lang)
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-[124px] min-w-[124px] overflow-hidden rounded-[20px] border-2 bg-white text-center transition-all ${
                    active ? 'border-[#ff5a1f] bg-[#fff4ed] shadow-[0_8px_18px_rgba(255,90,31,0.16)]' : 'border-[#E5E7EB] shadow-sm'
                  }`}
                >
                  <div className={`aspect-square w-full overflow-hidden ${active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'}`}>
                    {isAll ? (
                      <div className="flex h-full w-full items-center justify-center">
                        <UtensilsCrossed size={30} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
                      </div>
                    ) : cat.image_url ? (
                      <img src={cat.image_url} alt={title} className="h-full w-full object-cover object-center" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-orange-50">
                        <UtensilsCrossed size={28} className="text-orange-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-h-[58px] px-2.5 py-2.5 flex items-center justify-center">
                    <p className={`line-clamp-2 text-sm font-extrabold leading-tight ${active ? 'text-[#ff4d00]' : 'text-[#1F2937]'}`}>
                      {title}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

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
              {groupedSections.map(section => (
                <section key={section.cat.id}>
                  <div className="mb-3 flex items-center gap-2.5">
                    <h2 className="text-xl font-black uppercase tracking-tight text-[#1F2937]">
                      {getCategoryName(section.cat, lang)}
                    </h2>
                    <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-bold text-[#6B7280]">
                      {section.items.length} {lang === 'uz' ? 'ta' : lang === 'ru' ? 'шт' : 'items'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {section.items.map(item => (
                      <MenuProductCard
                        key={item.id}
                        item={item}
                        qty={0}
                        lang={lang}
                        onAdd={handleOrderIntent}
                        onIncrement={handleOrderIntent}
                        onDecrement={handleOrderIntent}
                        onOpenDetail={openDetail}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {filteredItems.map(item => (
                <MenuProductCard
                  key={item.id}
                  item={item}
                  qty={0}
                  lang={lang}
                  onAdd={handleOrderIntent}
                  onIncrement={handleOrderIntent}
                  onDecrement={handleOrderIntent}
                  onOpenDetail={openDetail}
                />
              ))}
            </div>
          )
        )}
      </main>
    </div>
  )
}
