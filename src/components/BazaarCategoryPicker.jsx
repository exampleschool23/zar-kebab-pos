import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search, Tag } from 'lucide-react'
import { BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH, bazaarCategoriesFor, bazaarCategoryLabel, customBazaarCategoryKey } from '../lib/bazaar'

function pickerLabels(lang) {
  if (lang === 'uz') return {
    search: 'Kategoriya qidirish yoki yangisini yozish', select: 'Kategoriyani tanlang', empty: 'Kategoriya topilmadi', categories: 'kategoriya', add: 'Kategoriya qo‘shish', custom: 'Qo‘shilgan',
  }
  if (lang === 'ru') return {
    search: 'Найдите категорию или введите новую', select: 'Выберите категорию', empty: 'Категории не найдены', categories: 'категорий', add: 'Добавить категорию', custom: 'Добавлена',
  }
  return {
    search: 'Search or type a new category', select: 'Select a category', empty: 'No categories found', categories: 'categories', add: 'Add category', custom: 'Added',
  }
}

// Same popover presentation as BazaarIngredientPicker, listing categories with ingredient counts.
export default function BazaarCategoryPicker({
  value = '',
  ingredients = [],
  onChange,
  lang = 'en',
  disabled = false,
  allowCreate = false,
}) {
  const l = pickerLabels(lang)
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const categories = useMemo(() => {
    const counts = new Map()
    for (const ingredient of ingredients) counts.set(ingredient.category, (counts.get(ingredient.category) || 0) + 1)
    return bazaarCategoriesFor([...ingredients, value]).map(category => ({
      key: category.key,
      custom: Boolean(category.custom),
      label: bazaarCategoryLabel(category.key, lang),
      count: counts.get(category.key) || 0,
    }))
  }, [ingredients, lang, value])

  const trimmedSearch = search.replace(/\s+/g, ' ').trim()
  const normalizedSearch = trimmedSearch.toLocaleLowerCase()
  const visible = categories.filter(category => !normalizedSearch || category.label.toLocaleLowerCase().includes(normalizedSearch))
  const canCreate = allowCreate && trimmedSearch !== ''
    && !categories.some(category => category.label.toLocaleLowerCase() === normalizedSearch)

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function selectCategory(key) {
    if (!key) return
    onChange?.(key)
    setOpen(false)
    setSearch('')
  }

  function onSearchKeyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (visible.length === 1 && !canCreate) selectCategory(visible[0].key)
    else if (canCreate) selectCategory(customBazaarCategoryKey(trimmedSearch))
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen(current => !current)}
        className="flex h-11 w-full min-w-0 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-left outline-none transition-all hover:border-orange-300 focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/10 disabled:bg-gray-50"
      >
        <Tag size={15} className="shrink-0 text-[#9CA3AF]" />
        <span className={`min-w-0 flex-1 truncate text-sm font-bold ${value ? 'text-[#1F2937]' : 'text-[#9CA3AF]'}`}>
          {value ? bazaarCategoryLabel(value, lang) : l.select}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-[#6B7280] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[min(360px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl shadow-slate-900/20">
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                autoFocus
                value={search}
                maxLength={BAZAAR_CUSTOM_CATEGORY_MAX_LENGTH}
                onChange={event => setSearch(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={l.search}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-gray-50 pl-9 pr-3 text-sm font-semibold text-[#1F2937] outline-none transition-colors focus:border-[#ff5a00] focus:bg-white focus:ring-2 focus:ring-[#ff5a00]/15"
              />
            </div>
          </div>

          <div role="listbox" aria-label={l.select} className="max-h-[360px] overflow-y-auto p-2">
            <div className="sticky top-0 z-10 mb-1 rounded-xl bg-white/95 px-3 py-2 backdrop-blur">
              <p className="text-[10px] font-bold text-[#C3C8D0]">{visible.length} {l.categories}</p>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => selectCategory(customBazaarCategoryKey(trimmedSearch))}
                className="mb-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-orange-200 bg-orange-50/60 px-3 py-2.5 text-left text-[#ff5a00] hover:bg-orange-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white"><Plus size={16} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-wide">{l.add}</p>
                  <p className="truncate text-sm font-black text-[#1F2937]">{trimmedSearch}</p>
                </div>
              </button>
            )}
            {visible.map(category => {
              const isSelected = category.key === value
              return (
                <button
                  key={category.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectCategory(category.key)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isSelected ? 'bg-orange-50 text-[#ff5a00]' : 'text-[#1F2937] hover:bg-gray-50'}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#ff5a00]"><Tag size={15} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black">{category.label}</p>
                    {category.custom && <p className="text-[11px] font-semibold text-[#9CA3AF]">{l.custom}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black text-[#6B7280]">{category.count}</span>
                  {isSelected && <Check size={15} className="shrink-0" />}
                </button>
              )
            })}
            {visible.length === 0 && !canCreate && <div className="flex min-h-32 items-center justify-center px-4 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
