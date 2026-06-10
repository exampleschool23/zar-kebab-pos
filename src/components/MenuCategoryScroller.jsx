import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, UtensilsCrossed } from 'lucide-react'
import { getCategoryName } from '../lib/i18n'
import ImageLoadShimmer from './ImageLoadShimmer'

export function menuCategorySectionId(prefix, categoryId) {
  return `${prefix}-${String(categoryId).replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

const COLLAPSED_BAR_HEIGHT = 72
const FIXED_COLLAPSED_GAP = 12

function CategoryImage({ src, alt, active }) {
  return (
    <ImageLoadShimmer
      src={src}
      alt={alt}
      className="h-full w-full object-cover object-center"
      fallback={
        <div className="flex h-full w-full items-center justify-center bg-orange-50">
          <UtensilsCrossed size={28} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
        </div>
      }
    />
  )
}

function LargeCategoryCard({ category, active, title, onClick }) {
  const isAll = category.id === 'all'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-[124px] w-[124px] flex-shrink-0 overflow-hidden rounded-[20px] border-2 text-center transition-all active:scale-[0.98] ${
        active
          ? 'border-[#ff5a1f] bg-[#fff4ed] shadow-[0_8px_18px_rgba(255,90,31,0.16)]'
          : 'border-[#E5E7EB] bg-white shadow-sm hover:border-orange-200 hover:shadow-md'
      }`}
    >
      <div className={`aspect-square w-full overflow-hidden ${active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'}`}>
        {isAll ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${active ? 'bg-[#ff5a1f]/15' : 'bg-white shadow-sm'}`}>
              <LayoutGrid size={24} className={active ? 'text-[#ff4d00]' : 'text-[#ff8a3d]'} />
            </div>
          </div>
        ) : (
          <CategoryImage src={category.image_url} alt={title} active={active} />
        )}
      </div>

      <div className="flex min-h-[58px] items-center justify-center px-2.5 py-2.5">
        <p className={`line-clamp-2 text-sm font-extrabold leading-tight ${active ? 'text-[#ff4d00]' : 'text-[#1F2937]'}`}>
          {title}
        </p>
      </div>
    </button>
  )
}

function CategoryChip({ category, active, title, count, onClick }) {
  const isAll = category.id === 'all'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-14 w-auto min-w-[104px] max-w-none flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border px-3 py-2 text-sm font-black transition-all ${
        active
          ? 'border-[#ff5a1f] bg-[#fff4ed] text-[#ff4d00] shadow-sm'
          : 'border-[#E5E7EB] bg-white text-[#1F2937] hover:border-orange-200 hover:bg-orange-50/40'
      }`}
    >
      <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl ${active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'}`}>
        {isAll ? (
          <LayoutGrid size={15} className={active ? 'text-[#ff4d00]' : 'text-[#ff8a3d]'} />
        ) : category.image_url ? (
          <CategoryImage src={category.image_url} alt={title} active={active} />
        ) : (
          <UtensilsCrossed size={15} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
        )}
      </span>
      <span className="max-w-none flex-shrink-0 whitespace-nowrap text-[12px] leading-tight">{title}</span>
      {Number.isFinite(count) && (
        <span className={`flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-lg px-2 text-sm font-black tabular-nums leading-none ${active ? 'bg-white/90 text-[#ff4d00]' : 'bg-[#E8F1FF] text-[#2563EB]'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

export default function MenuCategoryScroller({
  categories,
  activeCategoryId,
  onCategoryClick,
  onActiveCategoryChange,
  lang,
  itemCounts = {},
  sectionPrefix,
  scrollContainerRef,
  topOffset = 0,
  className = '',
  collapsedClassName = '',
  collapsedPosition = 'sticky',
  scrollOffset = 84,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const sentinelRef = useRef(null)
  const activeRef = useRef(activeCategoryId)

  useEffect(() => {
    activeRef.current = activeCategoryId
  }, [activeCategoryId])

  const cards = useMemo(() => categories || [], [categories])

  function titleFor(category) {
    if (category.id === 'all') {
      return lang === 'uz' ? 'Barchasi' : lang === 'ru' ? 'Все' : 'All'
    }
    return category.label || getCategoryName(category, lang)
  }

  function getScrollRoot() {
    return scrollContainerRef?.current || window
  }

  function getScrollElement() {
    return scrollContainerRef?.current || document.documentElement
  }

  function scrollToCategory(categoryId) {
    const root = getScrollRoot()
    const scroller = getScrollElement()
    if (categoryId === 'all') {
      if (root === window) {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        scroller.scrollTo({ top: 0, behavior: 'smooth' })
      }
      return
    }

    const section = document.getElementById(menuCategorySectionId(sectionPrefix, categoryId))
    if (!section) return

    if (root === window) {
      const target = section.getBoundingClientRect().top + window.scrollY - topOffset - scrollOffset
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    } else {
      const rootRect = scroller.getBoundingClientRect()
      const target = section.getBoundingClientRect().top - rootRect.top + scroller.scrollTop - scrollOffset
      scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }
  }

  function handleClick(category) {
    onCategoryClick?.(category.id)
    scrollToCategory(category.id)
  }

  useEffect(() => {
    const root = getScrollRoot()
    const scroller = getScrollElement()

    function handleScroll() {
      const sentinel = sentinelRef.current
      if (sentinel) {
        const rect = sentinel.getBoundingClientRect()
        const rootTop = root === window ? topOffset : scroller.getBoundingClientRect().top
        setCollapsed(rect.bottom <= rootTop + 61)
      }

      if (!onActiveCategoryChange || !sectionPrefix) return
      const threshold = (root === window ? topOffset : scroller.getBoundingClientRect().top) + scrollOffset + 8
      let nextActive = 'all'

      for (const category of cards) {
        if (category.id === 'all') continue
        const section = document.getElementById(menuCategorySectionId(sectionPrefix, category.id))
        if (!section) continue
        if (section.getBoundingClientRect().top <= threshold) {
          nextActive = category.id
        }
      }

      if (nextActive !== activeRef.current) {
        activeRef.current = nextActive
        onActiveCategoryChange(nextActive)
      }
    }

    handleScroll()
    root.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      root.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [cards, onActiveCategoryChange, scrollContainerRef, scrollOffset, sectionPrefix, topOffset])

  return (
    <>
      <div ref={sentinelRef} className={className}>
        <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {cards.map(category => {
            const title = titleFor(category)
            return (
              <LargeCategoryCard
                key={category.id}
                category={category}
                title={title}
                active={activeCategoryId === category.id}
                onClick={() => handleClick(category)}
              />
            )
          })}
        </div>
      </div>

      <div
        className={`${collapsedPosition === 'fixed' ? 'fixed left-0 right-0' : 'sticky -mx-1 overflow-hidden'} z-30 border-b border-[#E5E7EB] bg-[#FAF6EE]/95 px-1 py-2 backdrop-blur transition-all duration-200 ${
          collapsed ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
        } ${collapsedClassName}`}
        style={{
          top: topOffset,
          maxHeight: collapsedPosition === 'fixed' || collapsed ? COLLAPSED_BAR_HEIGHT : 0,
        }}
      >
        <div className="flex gap-2 overflow-x-auto overflow-y-hidden px-1" style={{ scrollbarWidth: 'none' }}>
          {cards.map(category => {
            const title = titleFor(category)
            return (
              <CategoryChip
                key={category.id}
                category={category}
                title={title}
                count={itemCounts[category.id]}
                active={activeCategoryId === category.id}
                onClick={() => handleClick(category)}
              />
            )
          })}
        </div>
      </div>

      {collapsedPosition === 'fixed' && (
        <div
          aria-hidden="true"
          className="transition-[height] duration-200"
          style={{ height: collapsed ? COLLAPSED_BAR_HEIGHT + FIXED_COLLAPSED_GAP : 0 }}
        />
      )}
    </>
  )
}
