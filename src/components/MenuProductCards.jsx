import React, { useEffect, useState } from 'react'
import { ArrowLeft, LayoutGrid, Minus, Plus, UtensilsCrossed } from 'lucide-react'
import { getCategoryName, getItemDesc, getItemName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'

function MenuImageFallback({ iconSize = 32, active = false }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-orange-50">
      <UtensilsCrossed size={iconSize} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
    </div>
  )
}

function SafeMenuImage({ src, alt, className = '', fallbackIconSize = 32, active = false }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <MenuImageFallback iconSize={fallbackIconSize} active={active} />
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function CategoryCard({ cat, active, onClick, lang }) {
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

export function ProductCard({ item, qty, onAdd, onIncrement, onDecrement, onOpenDetail, lang, readOnly = false }) {
  const inCart = !readOnly && qty > 0
  const kcal = kcalLabel(item, lang)
  const grams = gramsLabel(item, lang)
  const millilitres = millilitresLabel(item, lang)

  return (
    <div
      onClick={() => onOpenDetail(item)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onOpenDetail(item)}
      className={`bg-white rounded-[18px] border-2 flex flex-col overflow-hidden transition-all cursor-pointer select-none ${
        inCart
          ? 'border-[#ff5a00]/40 shadow-md shadow-orange-100/60'
          : 'border-[#E5E7EB] shadow-sm hover:shadow-md hover:border-gray-200'
      }`}
    >
      <div className="relative aspect-[4/3] w-full flex-shrink-0 overflow-hidden bg-orange-50">
        <SafeMenuImage
          src={item.image_url}
          alt={getItemName(item, lang)}
          className="h-full w-full object-cover object-center"
          fallbackIconSize={34}
        />
        {inCart && (
          <div className="absolute top-2 right-2 bg-[#ff5a00] text-white text-[11px] font-black rounded-full w-6 h-6 flex items-center justify-center shadow">
            {qty}
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <h3 className="font-bold text-[15px] text-[#1F2937] line-clamp-2 leading-snug mb-1 flex-1">
          {getItemName(item, lang)}
        </h3>
        {getItemDesc(item, lang) && (
          <p className="text-[12px] text-[#9CA3AF] line-clamp-1 mb-1.5">{getItemDesc(item, lang)}</p>
        )}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="font-black text-[16px] text-[#ff5a00]">{formatCurrency(item.price)}</p>
          {(grams || millilitres || kcal) && (
            <div className="flex flex-wrap justify-end gap-1">
              {grams && (
                <span className="rounded-full bg-[#F8FAFC] px-2 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                  {grams}
                </span>
              )}
              {millilitres && (
                <span className="rounded-full bg-[#F8FAFC] px-2 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                  {millilitres}
                </span>
              )}
              {kcal && (
                <span className="rounded-full bg-[#F8FAFC] px-2 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
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
            style={{ height: '40px' }}
          >
            <Plus size={14} />
            {lang === 'uz' ? "Qo'shish" : lang === 'ru' ? 'Добавить' : 'Add'}
          </button>
        )}
      </div>
    </div>
  )
}

export function ProductDetailPage({ item, category, currentQty, currentNotes, lang, onBack, onCancel, onAddToCart, readOnly = false }) {
  const [qty, setQty] = useState(Math.max(1, currentQty))
  const [notes, setNotes] = useState(currentNotes || '')

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
  const labels = {
    back: lang === 'uz' ? 'Menyuga qaytish' : lang === 'ru' ? 'Назад в меню' : 'Back to menu',
    description: lang === 'uz' ? 'Tavsif' : lang === 'ru' ? 'Описание' : 'Description',
    noDescription: lang === 'uz' ? 'Tavsif qo‘shilmagan.' : lang === 'ru' ? 'Описание не добавлено.' : 'No description added.',
    quantity: lang === 'uz' ? 'Miqdor' : lang === 'ru' ? 'Количество' : 'Quantity',
    quantitySub: lang === 'uz' ? 'Porsiyalar sonini tanlang' : lang === 'ru' ? 'Выберите количество порций' : 'Choose how many portions',
    notes: lang === 'uz' ? 'Maxsus izohlar' : lang === 'ru' ? 'Особые заметки' : 'Special notes',
    notesSub: lang === 'uz' ? 'Oshxona uchun ixtiyoriy ko‘rsatma' : lang === 'ru' ? 'Дополнительная инструкция для кухни' : 'Optional kitchen instruction',
    cancel: lang === 'uz' ? 'Bekor qilish' : lang === 'ru' ? 'Отмена' : 'Cancel',
    add: lang === 'uz' ? "Savatga qo'shish" : lang === 'ru' ? 'Добавить в корзину' : 'Add to Cart',
  }

  return (
    <div className="flex h-full flex-col bg-[#FAF6EE]">
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
          <p className="whitespace-nowrap text-xl sm:text-2xl font-black text-[#FF4D00] tabular-nums">
            {formatCurrency(item.price)}
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
                  <p className="text-lg font-black text-[#FF4D00]">{formatCurrency(item.price)}</p>
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
                <p className="text-[14px] leading-6 text-[#475569]">
                  {desc || labels.noDescription}
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
                  placeholder="Например: без лука, хорошо прожарить..."
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
            {labels.cancel}
          </button>
          <button
            onClick={() => onAddToCart(item, qty, notes)}
            className="h-14 flex-[2] rounded-2xl bg-[#0F3B2E] text-sm sm:text-base font-black text-white hover:bg-[#0A2A20] active:scale-[0.99] transition-all shadow-[0_8px_18px_rgba(15,59,46,0.22)]"
          >
            {labels.add} - {formatCurrency(total)}
          </button>
        </div>
      </div>
      )}
    </div>
  )
}
