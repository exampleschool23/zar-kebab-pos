import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, UtensilsCrossed } from 'lucide-react'
import { getCategoryName } from '../lib/i18n'
import ImageLoadShimmer from './ImageLoadShimmer'

export function menuCategorySectionId(prefix, categoryId) {
  return `${prefix}-${String(categoryId).replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

const COLLAPSED_BAR_HEIGHT = 56
const COLLAPSE_SHOW_OFFSET = 61
const COLLAPSE_HIDE_OFFSET = 28

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
      className={`min-w-[82px] w-[82px] flex-shrink-0 overflow-hidden rounded-[18px] border-2 text-center transition-all active:scale-[0.98] sm:min-w-[96px] sm:w-[96px] md:min-w-[108px] md:w-[108px] lg:min-w-[116px] lg:w-[116px] xl:min-w-[124px] xl:w-[124px] xl:rounded-[22px] ${
        active
          ? 'border-[#ff5a1f] bg-[#fff4ed] shadow-[0_8px_18px_rgba(255,90,31,0.16)]'
          : 'border-[#E5E7EB] bg-white shadow-sm hover:border-orange-200 hover:shadow-md'
      }`}
    >
      <div className={`aspect-square w-full overflow-hidden rounded-t-[16px] xl:rounded-t-[20px] ${
        isAll
          ? active ? 'bg-[#fff4ed]' : 'bg-[#F8FAFC]'
          : active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'
      }`}>
        {isAll ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl sm:h-10 sm:w-10 lg:h-11 lg:w-11 xl:h-12 xl:w-12 xl:rounded-2xl ${active ? 'bg-[#ff5a1f]/12 text-[#ff4d00]' : 'bg-white shadow-sm'}`}>
              <LayoutGrid size={20} className={active ? 'text-[#ff4d00]' : 'text-[#ff8a3d]'} />
            </div>
          </div>
        ) : (
          <CategoryImage src={category.image_url} alt={title} active={active} />
        )}
      </div>

      <div className="flex min-h-[42px] items-center justify-center rounded-b-[16px] px-1.5 py-1.5 sm:min-h-[48px] sm:px-2 md:min-h-[52px] lg:min-h-[54px] xl:min-h-[58px] xl:rounded-b-[20px] xl:px-2.5 xl:py-2.5">
        <p className={`line-clamp-2 text-[11px] font-extrabold leading-tight sm:text-[12px] md:text-[13px] xl:text-sm ${active ? 'text-[#ff4d00]' : 'text-[#1F2937]'}`}>
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
      className={`flex h-11 w-auto min-w-[96px] max-w-none flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border px-3 py-1 text-sm font-black transition-all ${
        active
          ? 'border-[#ff5a1f] bg-[#fff4ed] text-[#ff4d00] shadow-sm'
          : 'border-[#E5E7EB] bg-white text-[#1F2937] hover:border-orange-200 hover:bg-orange-50/40'
      }`}
    >
      <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg ${active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'}`}>
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
        <span className={`flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-lg px-1.5 text-[12px] font-black tabular-nums leading-none ${active ? 'bg-white/90 text-[#ff4d00]' : 'bg-[#E8F1FF] text-[#2563EB]'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function isScrollableElement(element) {
  if (!element || element === document.body || element === document.documentElement) return false
  const style = window.getComputedStyle(element)
  return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight
}

function findScrollContainer(element) {
  let current = element?.parentElement
  while (current) {
    if (isScrollableElement(current)) return current
    current = current.parentElement
  }
  return null
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
  collapsedSurfaceClass = 'bg-[#FAF6EE]/95',
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
    return scrollContainerRef?.current || findScrollContainer(sentinelRef.current) || window
  }

  function getScrollElement() {
    return scrollContainerRef?.current || findScrollContainer(sentinelRef.current) || document.documentElement
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
      return true
    }

    const section = document.getElementById(menuCategorySectionId(sectionPrefix, categoryId))
    if (!section) return false

    if (root === window) {
      const target = section.getBoundingClientRect().top + window.scrollY - topOffset - scrollOffset
      window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    } else {
      const rootRect = scroller.getBoundingClientRect()
      const target = section.getBoundingClientRect().top - rootRect.top + scroller.scrollTop - scrollOffset
      scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }
    return true
  }

  function handleClick(category) {
    if (scrollToCategory(category.id)) {
      onCategoryClick?.(category.id)
    }
  }

  useEffect(() => {
    const root = getScrollRoot()
    const scroller = getScrollElement()

    function handleScroll() {
      const sentinel = sentinelRef.current
      if (sentinel) {
        const rect = sentinel.getBoundingClientRect()
        const rootTop = root === window ? topOffset : scroller.getBoundingClientRect().top
        setCollapsed(isCollapsed => (
          isCollapsed
            ? rect.bottom <= rootTop + COLLAPSE_HIDE_OFFSET
            : rect.bottom <= rootTop + COLLAPSE_SHOW_OFFSET
        ))
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
        className={`${collapsedPosition === 'fixed' ? 'fixed left-0 right-0' : 'sticky -mx-1 overflow-hidden'} z-30 border-b border-[#E5E7EB] ${collapsedSurfaceClass} px-1 py-1.5 backdrop-blur transition-all duration-200 ${
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
    </>
  )
}
