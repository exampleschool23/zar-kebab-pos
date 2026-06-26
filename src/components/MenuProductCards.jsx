import React, { useEffect, useState } from 'react'
import { ArrowLeft, Check, Copy, LayoutGrid, Minus, Plus, UtensilsCrossed } from 'lucide-react'
import { getCategoryName, getItemDesc, getItemName, t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import { getMenuPricing } from '../lib/menuPricing'
import { getMenuItemPublicUrl } from '../lib/menuLinks'
import ImageLoadShimmer from './ImageLoadShimmer'

function MenuImageFallback({ iconSize = 32, active = false }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-orange-50">
      <UtensilsCrossed size={iconSize} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
    </div>
  )
}

function SafeMenuImage({ src, alt, className = '', fallbackIconSize = 32, active = false, loading = 'lazy', fetchPriority }) {
  return (
    <ImageLoadShimmer
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      fallback={<MenuImageFallback iconSize={fallbackIconSize} active={active} />}
    />
  )
}

function plainMenuText(text) {
  return String(text || '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\s+/g, ' ').trim()
}

function FadingMenuDescription({ text, className = '' }) {
  const value = plainMenuText(text)
  if (!value) return null

  return (
    <p
      title={value}
      className={`overflow-hidden whitespace-nowrap ${className}`}
      style={{
        WebkitMaskImage: 'linear-gradient(90deg, #000 0%, #000 calc(100% - 34px), transparent 100%)',
        maskImage: 'linear-gradient(90deg, #000 0%, #000 calc(100% - 34px), transparent 100%)',
      }}
    >
      {value}
    </p>
  )
}

function FormattedMenuText({ text, fallback }) {
  const value = String(text || fallback || '')
  return value.split('\n').map((line, lineIndex) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
    return (
      <React.Fragment key={lineIndex}>
        {lineIndex > 0 && <br />}
        {parts.map((part, partIndex) => {
          const boldMatch = part.match(/^\*\*([^*]+)\*\*$/)
          return boldMatch
            ? <strong key={partIndex} className="font-black text-[#1F2937]">{boldMatch[1]}</strong>
            : <React.Fragment key={partIndex}>{part}</React.Fragment>
        })}
      </React.Fragment>
    )
  })
}

async function copyTextToClipboard(text) {
  if (globalThis.navigator?.clipboard?.writeText) {
    try {
      await globalThis.navigator.clipboard.writeText(text)
      return
    } catch {
      // Some embedded browsers expose clipboard APIs but reject writes.
    }
  }
  const textarea = globalThis.document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  globalThis.document.body.appendChild(textarea)
  textarea.select()
  globalThis.document.execCommand('copy')
  globalThis.document.body.removeChild(textarea)
}

export function CategoryCard({ cat, active, onClick, lang, eager = false }) {
  const isAll = cat.id === 'all'
  const title = isAll
    ? (lang === 'uz' ? 'Barchasi' : lang === 'ru' ? 'Все' : 'All')
    : getCategoryName(cat, lang)

  return (
    <button
      onClick={onClick}
      className={`min-w-[124px] w-[124px] flex-shrink-0 overflow-hidden rounded-[20px] border-2 text-left transition-all active:scale-[0.98] ${
        active
          ? 'border-[#ff5a1f] bg-[#fff4ed] shadow-[0_8px_18px_rgba(255,90,31,0.16)]'
          : 'border-[#E5E7EB] bg-white shadow-sm hover:border-orange-200 hover:shadow-md'
      }`}
    >
      <div className={`aspect-square w-full overflow-hidden ${active ? 'bg-[#FFE8D8]' : 'bg-[#F3F4F6]'}`}>
        {isAll ? (
          <div className="h-full w-full flex items-center justify-center">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${active ? 'bg-[#ff5a1f]/15' : 'bg-white shadow-sm'}`}>
              <LayoutGrid size={24} className={active ? 'text-[#ff4d00]' : 'text-[#ff8a3d]'} />
            </div>
          </div>
        ) : cat.image_url ? (
          <SafeMenuImage
            src={cat.image_url}
            alt={title}
            className="h-full w-full object-cover object-center"
            fallbackIconSize={28}
            active={active}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : undefined}
          />
        ) : (
          <MenuImageFallback iconSize={28} active={active} />
        )}
      </div>

      <div className="min-h-[58px] px-2.5 py-2.5 text-center flex items-center justify-center">
        <p className={`line-clamp-2 text-sm font-extrabold leading-tight ${active ? 'text-[#ff4d00]' : 'text-[#1F2937]'}`}>
          {title}
        </p>
      </div>
    </button>
  )
}

export function ProductCard({ item, qty, onAdd, onIncrement, onDecrement, onOpenDetail, lang, readOnly = false, eager = false, formatPrice = formatCurrency, linkBasePath = '/menu', density = 'comfortable' }) {
  const inCart = !readOnly && qty > 0
  const [copied, setCopied] = useState(false)
  const kcal = kcalLabel(item, lang)
  const grams = gramsLabel(item, lang)
  const millilitres = millilitresLabel(item, lang)
  const pricing = getMenuPricing(item)
  const showCompactPublicCard = readOnly
  const dense = !readOnly && density === 'compact'
  const labels = {
    copy: lang === 'uz' ? 'Havolani nusxalash' : lang === 'ru' ? 'Скопировать ссылку' : 'Copy link',
    copied: lang === 'uz' ? 'Nusxalandi' : lang === 'ru' ? 'Скопировано' : 'Copied',
  }

  async function copyProductLink(event) {
    event.stopPropagation()
    await copyTextToClipboard(getMenuItemPublicUrl(item, globalThis.location?.origin, linkBasePath))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div
      onClick={() => onOpenDetail(item)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpenDetail(item)}
      className={`group flex h-full flex-col overflow-hidden bg-white transition-all cursor-pointer select-none ${
        inCart
          ? 'rounded-[18px] border-2 border-[#ff5a00]/40 shadow-md shadow-orange-100/60'
          : showCompactPublicCard
            ? 'rounded-[18px] border border-[#E6EAF0] shadow-sm hover:-translate-y-0.5 hover:border-[#D8DEE8] hover:shadow-md'
            : 'rounded-[18px] border-2 border-[#E5E7EB] shadow-sm hover:shadow-md hover:border-gray-200'
      }`}
    >
      <div className={`relative w-full flex-shrink-0 overflow-hidden bg-orange-50 ${showCompactPublicCard ? 'aspect-[4/3] rounded-b-[14px]' : dense ? 'aspect-[2/1]' : 'aspect-[4/3]'}`}>
        <SafeMenuImage
          src={item.image_url}
          alt={getItemName(item, lang)}
          className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
          fallbackIconSize={34}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
        />
        {inCart && (
          <div className="absolute top-2 right-2 bg-[#ff5a00] text-white text-[11px] font-black rounded-full w-6 h-6 flex items-center justify-center shadow">
            {qty}
          </div>
        )}
        {readOnly && (
          <button
            type="button"
            onClick={copyProductLink}
            title={copied ? labels.copied : labels.copy}
            aria-label={copied ? labels.copied : labels.copy}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/80 bg-white/95 text-[#5B6472] shadow-sm backdrop-blur transition-colors hover:bg-[#fff4ed] hover:text-[#ff5a00]"
          >
            {copied ? <Check size={16} /> : <Copy size={15} />}
          </button>
        )}
      </div>

      <div className={`${showCompactPublicCard ? 'p-3 pt-2.5' : dense ? 'p-2.5' : 'p-3'} flex flex-col flex-1`}>
        <h3 className={`${showCompactPublicCard ? 'text-[13px] sm:text-[15px]' : dense ? 'text-[14px] mb-0.5 flex-1' : 'text-[15px] mb-1 flex-1'} font-bold text-[#1F2937] line-clamp-2 leading-snug`}>
          {getItemName(item, lang)}
        </h3>
        {showCompactPublicCard && getItemDesc(item, lang) && (
          <FadingMenuDescription text={getItemDesc(item, lang)} className="mt-0.5 min-h-[15px] text-[11px] leading-snug text-[#8A94A6] sm:min-h-[16px] sm:text-[12px]" />
        )}
        {!showCompactPublicCard && getItemDesc(item, lang) && (
          <FadingMenuDescription text={getItemDesc(item, lang)} className={`${dense ? 'text-[11px] mb-1' : 'text-[12px] mb-1.5'} text-[#9CA3AF]`} />
        )}
        <div className={`${showCompactPublicCard ? 'mt-auto mb-0 items-end pt-2' : dense ? 'mt-auto mb-2 items-start pt-1' : 'mt-auto mb-2.5 items-start pt-1'} flex justify-between gap-2`}>
          <div className="min-w-0">
            {pricing.discounted && (
              <p className={`${showCompactPublicCard ? 'text-[13px]' : 'text-[12px]'} font-bold text-[#9CA3AF] line-through`}>{formatPrice(pricing.oldPrice)}</p>
            )}
            <p className={`${pricing.discounted ? 'text-red-600' : 'text-[#ff5a00]'} ${showCompactPublicCard ? 'text-[16px] sm:text-[19px]' : dense ? 'text-[15px]' : 'text-[16px]'} font-black tracking-tight`}>
              {formatPrice(pricing.price)}
            </p>
          </div>
          {!showCompactPublicCard && (grams || millilitres || kcal) && (
            <div className="flex flex-wrap justify-end gap-1">
              {grams && (
                <span className={`rounded-full bg-[#F8FAFC] ${dense ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} font-black text-[#64748B] ring-1 ring-[#E5E7EB]`}>
                  {grams}
                </span>
              )}
              {millilitres && (
                <span className={`rounded-full bg-[#F8FAFC] ${dense ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} font-black text-[#64748B] ring-1 ring-[#E5E7EB]`}>
                  {millilitres}
                </span>
              )}
              {kcal && (
                <span className={`rounded-full bg-[#F8FAFC] ${dense ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'} font-black text-[#64748B] ring-1 ring-[#E5E7EB]`}>
                  {kcal}
                </span>
              )}
            </div>
          )}
        </div>

        {readOnly ? null : inCart ? (
          <div
            onClick={e => e.stopPropagation()}
            className="flex items-center justify-between bg-[#fff1e8] rounded-xl px-2 py-1 border border-[#ff5a00]/20"
          >
            <button
              onClick={e => { e.stopPropagation(); onDecrement(item) }}
              className="w-9 h-9 rounded-xl bg-white border border-[#E5E7EB] flex items-center justify-center hover:bg-red-50 hover:border-red-200 active:scale-90 transition-all shadow-sm"
            >
              <Minus size={14} className="text-[#6B7280]" />
            </button>
            <span className="font-black text-[18px] text-[#ff5a00] min-w-[24px] text-center">{qty}</span>
            <button
              onClick={e => { e.stopPropagation(); onIncrement(item) }}
              className="w-9 h-9 rounded-xl bg-[#ff5a00] flex items-center justify-center hover:bg-[#cc4800] active:scale-90 transition-all shadow-sm"
            >
              <Plus size={14} className="text-white" />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onAdd(item) }}
            className="w-full rounded-xl bg-[#fff1e8] text-[#ff5a00] border border-[#ff5a00]/20 text-[13px] font-bold hover:bg-[#ff5a00] hover:text-white active:scale-95 transition-all flex items-center justify-center gap-1.5"
            style={{ height: dense ? '34px' : '40px' }}
          >
            <Plus size={14} />
            {lang === 'uz' ? "Qo'shish" : lang === 'ru' ? 'Добавить' : 'Add'}
          </button>
        )}
      </div>
    </div>
  )
}

export function ProductDetailPage({ item, category, currentQty, currentNotes, lang, onBack, onCancel, onAddToCart, readOnly = false, formatPrice = formatCurrency, linkBasePath = '/menu' }) {
  const [qty, setQty] = useState(Math.max(1, currentQty))
  const [notes, setNotes] = useState(currentNotes || '')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setQty(Math.max(1, currentQty))
    setNotes(currentNotes || '')
  }, [item?.id, currentQty, currentNotes])

  if (!item) return null

  const name = getItemName(item, lang)
  const desc = getItemDesc(item, lang)
  const total = item.price * qty
  const kcal = kcalLabel(item, lang)
  const grams = gramsLabel(item, lang)
  const millilitres = millilitresLabel(item, lang)
  const pricing = getMenuPricing(item)
  const labels = {
    back: lang === 'uz' ? 'Menyuga qaytish' : lang === 'ru' ? 'Назад в меню' : 'Back to menu',
    description: lang === 'uz' ? 'Tavsif' : lang === 'ru' ? 'Описание' : 'Description',
    noDescription: lang === 'uz' ? 'Tavsif qo‘shilmagan.' : lang === 'ru' ? 'Описание не добавлено.' : 'No description added.',
    quantity: lang === 'uz' ? 'Miqdor' : lang === 'ru' ? 'Количество' : 'Quantity',
    quantitySub: lang === 'uz' ? 'Porsiyalar sonini tanlang' : lang === 'ru' ? 'Выберите количество порций' : 'Choose how many portions',
    notes: lang === 'uz' ? 'Maxsus izohlar' : lang === 'ru' ? 'Особые заметки' : 'Special notes',
    notesSub: lang === 'uz' ? 'Buyurtma uchun ixtiyoriy ko‘rsatma' : lang === 'ru' ? 'Дополнительная инструкция к заказу' : 'Optional order instruction',
    notesPlaceholder: lang === 'uz' ? 'Masalan: piyozsiz, yaxshi pishiring...' : lang === 'ru' ? 'Например: без лука, хорошо прожарить...' : 'For example: no onion, well done...',
    cancel: lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel',
    add: lang === 'uz' ? "Savatga qo'shish" : lang === 'ru' ? 'Добавить в корзину' : 'Add to Cart',
    copy: lang === 'uz' ? 'Havolani nusxalash' : lang === 'ru' ? 'Скопировать ссылку' : 'Copy link',
    copied: lang === 'uz' ? 'Nusxalandi' : lang === 'ru' ? 'Скопировано' : 'Copied',
  }

  async function copyProductLink() {
    await copyTextToClipboard(getMenuItemPublicUrl(item, globalThis.location?.origin, linkBasePath))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className={`flex h-full flex-col ${readOnly ? 'bg-white' : 'bg-[#FAF6EE]'}`}>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#E5E7EB] bg-white px-5 py-3 shadow-sm">
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-2xl border border-[#E5E7EB] bg-white text-[#64748B] flex items-center justify-center hover:bg-[#F8FAFC] hover:text-[#0F3B2E] active:scale-95 transition-all shadow-sm"
          aria-label={labels.back}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black uppercase tracking-tight text-[#111827]">{name}</h1>
          {category && (
            <p className="mt-0.5 text-xs font-black uppercase tracking-wider text-[#FF4D00]">
              {getCategoryName(category, lang)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {readOnly && (
            <button
              type="button"
              onClick={copyProductLink}
              className="mb-1 inline-flex h-9 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[12px] font-black text-[#1F2937] shadow-sm transition-colors hover:border-orange-200 hover:bg-[#fff4ed] hover:text-[#ff5a00]"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span className="hidden sm:inline">{copied ? labels.copied : labels.copy}</span>
            </button>
          )}
          {pricing.discounted && (
            <p className="whitespace-nowrap text-sm font-bold text-[#9CA3AF] line-through tabular-nums">
              {formatPrice(pricing.oldPrice)}
            </p>
          )}
          <p className={`whitespace-nowrap text-xl sm:text-2xl font-black tabular-nums ${pricing.discounted ? 'text-red-600' : 'text-[#FF4D00]'}`}>
            {formatPrice(pricing.price)}
          </p>
          {(grams || millilitres || kcal) && (
            <div className="flex flex-wrap justify-end gap-1">
              {grams && (
                <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                  {grams}
                </span>
              )}
              {millilitres && (
                <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                  {millilitres}
                </span>
              )}
              {kcal && (
                <span className="rounded-full bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                  {kcal}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 ${readOnly ? 'pb-6' : 'pb-28'}`}>
        <div className="mx-auto w-full max-w-[1120px]">
          <section className="grid gap-5 rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm md:grid-cols-[minmax(320px,0.9fr)_minmax(360px,1.1fr)] md:p-5 lg:gap-6">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[22px] bg-orange-50 md:max-h-[360px]">
              <SafeMenuImage
                src={item.image_url}
                alt={name}
                className="h-full w-full object-cover object-center"
                fallbackIconSize={64}
              />
            </div>
            <div className="min-w-0 space-y-5">
              <div>
                {category && (
                  <span className="mb-3 inline-flex rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#FF4D00]">
                    {getCategoryName(category, lang)}
                  </span>
                )}
                <h2 className="text-2xl font-black uppercase tracking-tight text-[#111827] sm:text-3xl">{name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {pricing.discounted && (
                    <p className="text-sm font-bold text-[#9CA3AF] line-through">{formatPrice(pricing.oldPrice)}</p>
                  )}
                  <p className={`${pricing.discounted ? 'text-xl text-red-600' : 'text-lg text-[#FF4D00]'} font-black`}>
                    {formatPrice(pricing.price)}
                  </p>
                  {grams && (
                    <span className="rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#FF4D00] ring-1 ring-[#FFD8BF]">
                      {grams}
                    </span>
                  )}
                  {millilitres && (
                    <span className="rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#FF4D00] ring-1 ring-[#FFD8BF]">
                      {millilitres}
                    </span>
                  )}
                  {kcal && (
                    <span className="rounded-full bg-[#FFF4ED] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#FF4D00] ring-1 ring-[#FFD8BF]">
                      {kcal}
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t border-[#EEF2F6] pt-4">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#8EA0BB]">{labels.description}</p>
                <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#475569]">
                  <FormattedMenuText text={desc} fallback={labels.noDescription} />
                </p>
              </div>

              {!readOnly && (
              <div className="rounded-[22px] border border-[#E5E7EB] bg-[#FBFCFE] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-black text-[#111827]">{labels.quantity}</h3>
                    <p className="mt-1 text-sm text-[#8A94A6]">{labels.quantitySub}</p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-4 rounded-[18px] border border-[#E5E7EB] bg-white p-1.5 sm:w-auto">
                    <button
                      onClick={() => setQty(q => Math.max(1, q - 1))}
                      className="w-12 h-12 rounded-2xl bg-white border border-[#E5E7EB] flex items-center justify-center text-[#64748B] hover:text-[#0F3B2E] active:scale-95 transition-all shadow-sm"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="min-w-[44px] text-center text-2xl font-black leading-none text-[#111827] tabular-nums">{qty}</span>
                    <button
                      onClick={() => setQty(q => q + 1)}
                      className="w-12 h-12 rounded-2xl bg-[#0F3B2E] flex items-center justify-center text-white hover:bg-[#0A2A20] active:scale-95 transition-all shadow-sm"
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                </div>
              </div>
              )}

              {!readOnly && (
              <div className="rounded-[22px] border border-[#E5E7EB] bg-[#FBFCFE] p-4">
                <div className="mb-3">
                  <h3 className="text-base font-black text-[#111827]">{labels.notes}</h3>
                  <p className="mt-1 text-sm text-[#8A94A6]">{labels.notesSub}</p>
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={labels.notesPlaceholder}
                  rows={3}
                  className="w-full resize-none rounded-[18px] border border-[#E5E7EB] bg-white px-4 py-3 text-[14px] leading-6 text-[#1F2937] placeholder-[#9CA3AF] transition-all focus:border-[#ff5a00] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/15"
                />
              </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {!readOnly && (
      <div className="sticky bottom-0 z-20 border-t border-[#E5E7EB] bg-white/95 px-4 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1120px] gap-3">
          <button
            onClick={onCancel}
            className="h-14 flex-1 rounded-2xl border border-[#E5E7EB] bg-white text-sm font-black text-[#64748B] hover:bg-[#F8FAFC] active:scale-[0.99] transition-all"
          >
              {t(lang, 'cancel')}
          </button>
          <button
            onClick={() => onAddToCart(item, qty, notes)}
            className="h-14 flex-[2] rounded-2xl bg-[#0F3B2E] text-sm sm:text-base font-black text-white hover:bg-[#0A2A20] active:scale-[0.99] transition-all shadow-[0_8px_18px_rgba(15,59,46,0.22)]"
          >
            {labels.add} - {formatPrice(total)}
          </button>
        </div>
      </div>
      )}
    </div>
  )
}
