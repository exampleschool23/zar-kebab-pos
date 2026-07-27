import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  DndContext, closestCenter, pointerWithin, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable,
  arrayMove, rectSortingStrategy, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t, getItemName, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import { getMenuPricing } from '../lib/menuPricing'
import { generateMenuExternalId } from '../lib/menuExternalId'
import AppShell from '../components/AppShell'
import MenuCategoryScroller, { menuCategorySectionId } from '../components/MenuCategoryScroller'
import { getQuickItemSortOrder, isActiveMenuItem, isCashierQuickItem, isWaiterHiddenMenuItem } from '../lib/menuItems'
import {
  Plus, Edit2, Trash2, X, UtensilsCrossed,
  Search, LayoutGrid, List, Tag, FolderOpen, GripVertical,
  ImagePlus, Loader2, Bold, ArrowLeft, Eye, EyeOff, Lock,
} from 'lucide-react'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useAppDataStatus } from '../store/appHooks'
import MenuMedia from '../components/MenuMedia'
import { supabase } from '../lib/supabase'
import { formatMoneyInput, normalizeMoneyInput, numberFromMoneyInput } from '../lib/moneyInput'
import { canEditMenu as canEditMenuForProfile } from '../lib/permissions'
import { getSaleProfitSummary } from '../lib/profit'
import { getRequiredMenuItemCost, hasRequiredMenuItemCost } from '../lib/menuItemCosts'
import {
  getMenuItemMediaUrls,
  isMenuVideoUrl,
  MENU_IMAGE_ACCEPT,
  MENU_IMAGE_MIME_TYPES,
  MENU_PRODUCT_MEDIA_ACCEPT,
  MENU_VIDEO_MIME_TYPES,
  normalizeMenuMediaUrls,
} from '../lib/menuMedia'
import { trimMenuItemTextFields, trimMenuItemTextValue } from '../lib/menuItemText'
import {
  MENU_SALE_UNIT_KG,
  MENU_SALE_UNIT_PIECE,
  menuPriceUnitSuffix,
  menuSaleUnitLabel,
  normalizeMenuSaleUnit,
} from '../lib/menuSaleUnits'

// ── Shared primitives ─────────────────────────────────────────────────────────

const ADMIN_MENU_SCROLL_KEY = 'zar-admin-menu-scroll-top'
const MENU_IMAGE_TYPES = new Set(MENU_IMAGE_MIME_TYPES)
const MENU_PRODUCT_MEDIA_TYPES = new Set([...MENU_IMAGE_MIME_TYPES, ...MENU_VIDEO_MIME_TYPES])
const MAX_MENU_MEDIA_BYTES = 4 * 1024 * 1024

function saveAdminMenuScrollPosition(scrollTop) {
  if (typeof sessionStorage === 'undefined') return
  const normalized = Math.max(0, Math.round(Number(scrollTop) || 0))
  if (normalized <= 0) {
    clearSavedAdminMenuScrollPosition()
    return
  }
  sessionStorage.setItem(ADMIN_MENU_SCROLL_KEY, String(normalized))
}

function takeSavedAdminMenuScrollPosition() {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(ADMIN_MENU_SCROLL_KEY)
  if (raw == null) return null
  const scrollTop = Number(raw)
  return Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : null
}

function clearSavedAdminMenuScrollPosition() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(ADMIN_MENU_SCROLL_KEY)
}

function validateMenuImage(file, allowVideo = false) {
  const allowedTypes = allowVideo ? MENU_PRODUCT_MEDIA_TYPES : MENU_IMAGE_TYPES
  if (!allowedTypes.has(String(file?.type || '').toLowerCase())) {
    throw new Error(allowVideo
      ? 'Only JPEG, PNG, WebP, GIF, AVIF, MP4, or WebM menu media is allowed'
      : 'Only JPEG, PNG, WebP, GIF, or AVIF images are allowed')
  }
  if (Number(file?.size || 0) > MAX_MENU_MEDIA_BYTES) throw new Error('File must be 4 MB or smaller')
  return file
}

async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || ''
}

async function uploadMenuImageToR2({ file, type, entityId }) {
  const token = await getAuthToken()
  const body = new FormData()
  body.append('file', file)
  body.append('type', type)
  if (entityId) body.append('entityId', entityId)

  const response = await fetch('/api/menu-image/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Could not upload image')
  return data
}

function formatMenuImageUploadError(lang, message) {
  const text = String(message || '')
  return text
}

async function deleteMenuImageFromR2(imageUrl) {
  if (!imageUrl) return
  const token = await getAuthToken()
  await fetch('/api/menu-image/delete', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url: imageUrl }),
  })
}

function SafeMenuImage({ src, alt = '', className = '', fallbackClassName = '', iconSize = 28 }) {
  return (
    <MenuMedia
      src={src}
      alt={alt}
      className={className}
      containerClassName={fallbackClassName || 'h-full w-full'}
      fallback={
        <div className={`bg-orange-50 flex items-center justify-center ${fallbackClassName}`}>
          <UtensilsCrossed size={iconSize} className="text-orange-200" />
        </div>
      }
    />
  )
}

function Modal({ title, onClose, children, closeDisabled = false }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeDisabled ? undefined : onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors disabled:cursor-wait disabled:opacity-50"
          >
            <X size={17} className="text-gray-400" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, placeholder, ...inputProps }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 font-semibold mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        {...inputProps}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
      />
    </div>
  )
}

function MoneyField({ label, value, onChange, placeholder, className = '', labelClassName = '', ...inputProps }) {
  const formattedPlaceholder = formatMoneyInput(placeholder) || placeholder
  return (
    <div>
      <label className={labelClassName || 'block text-xs text-gray-500 font-semibold mb-1.5'}>{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={formatMoneyInput(value)}
        onChange={event => onChange({ target: { value: normalizeMoneyInput(event.target.value) } })}
        placeholder={formattedPlaceholder}
        autoComplete="off"
        {...inputProps}
        className={className || 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all'}
      />
    </div>
  )
}

function ProfitMarginPreview({ price, cost, lang, inheritedCost = false }) {
  if (String(price ?? '').trim() === '' || String(cost ?? '').trim() === '') return null
  const summary = getSaleProfitSummary(numberFromMoneyInput(price), numberFromMoneyInput(cost))
  if (!summary) return null

  const labels = lang === 'uz'
    ? { profit: 'Sotuv foydasi', margin: 'Foyda marjasi', inherited: 'Asosiy tannarx' }
    : lang === 'ru'
      ? { profit: 'Прибыль с продажи', margin: 'Маржа', inherited: 'Себестоимость товара' }
      : { profit: 'Profit per sale', margin: 'Profit margin', inherited: 'Parent cost' }
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ'
  const margin = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(summary.marginPct)
  const positive = summary.profit >= 0

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${positive ? 'border-emerald-200 bg-white/80' : 'border-red-200 bg-red-50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[10px] font-black uppercase tracking-wide ${positive ? 'text-emerald-700' : 'text-red-700'}`}>{labels.profit}</span>
        {inheritedCost && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-gray-500">{labels.inherited}</span>}
      </div>
      <div className={`flex items-center gap-2 text-xs font-black tabular-nums ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
        <span>{formatCurrency(summary.profit)}</span>
        <span className={`rounded-full px-2 py-0.5 ${positive ? 'bg-emerald-100' : 'bg-red-100'}`}>{labels.margin}: {margin}%</span>
      </div>
    </div>
  )
}

function PricingFields({ form, setF, lang, compact = false, costRequired = false }) {
  const priceUnit = menuPriceUnitSuffix(form.sale_unit, lang)
  const labels = lang === 'uz'
    ? {
        title: 'Narx va foyda',
        private: 'Ichki ma’lumot',
        current: 'Hozirgi narx',
        old: 'Eski narx',
        cost: 'Haqiqiy tannarx',
        hint: 'Tannarx faqat sof foydani hisoblash uchun ishlatiladi. Menyu, buyurtma va cheklarda ko‘rsatilmaydi.',
        required: 'Yangi mahsulot uchun haqiqiy tannarx majburiy.',
      }
    : lang === 'ru'
      ? {
          title: 'Цена и прибыль',
          private: 'Внутренние данные',
          current: 'Текущая цена',
          old: 'Старая цена',
          cost: 'Реальная себестоимость',
          hint: 'Себестоимость используется только для расчёта чистой прибыли. Она не показывается в меню, заказах и чеках.',
          required: 'Для нового товара реальная себестоимость обязательна.',
        }
      : {
          title: 'Pricing and profit',
          private: 'Internal data',
          current: 'Current price',
          old: 'Old price',
          cost: 'Real cost',
          hint: 'Cost is used only to calculate net profit. It is never shown in menus, orders, or receipts.',
          required: 'Real cost is required for every new product.',
        }
  const missingRequiredCost = costRequired && !hasRequiredMenuItemCost(form.cost_price)

  return (
    <div className={`rounded-2xl border border-emerald-200 bg-emerald-50/50 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
            <Lock size={15} />
          </span>
          <p className="text-sm font-black text-gray-800">{labels.title}</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
          {labels.private}
        </span>
      </div>
      <div className={`grid gap-3 ${compact ? 'sm:grid-cols-1' : 'sm:grid-cols-3'}`}>
        <MoneyField label={`${labels.current} (UZS${priceUnit})`} value={form.price} onChange={setF('price')} placeholder="35000" />
        <MoneyField label={`${labels.old} (UZS)`} value={form.old_price} onChange={setF('old_price')} placeholder="40000" />
        <MoneyField
          label={`${labels.cost} (UZS${priceUnit})${costRequired ? ' *' : ''}`}
          value={form.cost_price}
          onChange={setF('cost_price')}
          placeholder="18000"
          required={costRequired}
          aria-required={costRequired}
          aria-invalid={missingRequiredCost}
          className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold tabular-nums outline-none transition-all ${
            missingRequiredCost
              ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-200'
              : 'border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
          }`}
          labelClassName={`mb-1.5 block text-xs font-bold ${missingRequiredCost ? 'text-red-700' : 'text-emerald-800'}`}
        />
      </div>
      {costRequired && (
        <p className={`mt-2 text-[11px] font-bold ${missingRequiredCost ? 'text-red-600' : 'text-emerald-700'}`}>
          * {labels.required}
        </p>
      )}
      <div className="mt-3">
        <ProfitMarginPreview price={form.price} cost={form.cost_price} lang={lang} />
      </div>
      <p className="mt-3 text-[11px] font-semibold leading-5 text-emerald-800/75">{labels.hint}</p>
    </div>
  )
}

function SaleUnitField({ value, onChange, lang }) {
  const label = lang === 'uz' ? 'Sotish birligi' : lang === 'ru' ? 'Единица продажи' : 'Sold by'
  const hint = normalizeMenuSaleUnit(value) === MENU_SALE_UNIT_KG
    ? (lang === 'uz' ? 'Narx va tannarx 1 kg uchun. Ofitsiant vaznni o‘nlik son bilan kiritadi.' : lang === 'ru' ? 'Цена и себестоимость указаны за 1 кг. Официант вводит вес дробным числом.' : 'Price and real cost are per 1 kg. The waiter enters a decimal weight.')
    : (lang === 'uz' ? 'Miqdor faqat butun dona bilan kiritiladi.' : lang === 'ru' ? 'Количество вводится только целыми штуками.' : 'Quantity is entered in whole items.')

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</span>
      <select
        value={normalizeMenuSaleUnit(value)}
        onChange={onChange}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/20"
      >
        <option value={MENU_SALE_UNIT_PIECE}>{menuSaleUnitLabel(MENU_SALE_UNIT_PIECE, lang)}</option>
        <option value={MENU_SALE_UNIT_KG}>{menuSaleUnitLabel(MENU_SALE_UNIT_KG, lang)}</option>
      </select>
      <span className="mt-1.5 block text-[11px] font-semibold leading-4 text-gray-400">{hint}</span>
    </label>
  )
}

function DescriptionField({ label, value, onChange, onBlur, lang }) {
  const textareaRef = useRef(null)
  const boldLabel = lang === 'uz' ? 'Qalin' : lang === 'ru' ? 'Жирный' : 'Bold'

  function updateValue(nextValue) {
    onChange({ target: { value: nextValue } })
  }

  function applyBold() {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = String(value || '')
    const selected = current.slice(start, end)
    const insert = selected ? `**${selected}**` : '**bold**'
    const nextValue = `${current.slice(0, start)}${insert}${current.slice(end)}`
    updateValue(nextValue)
    window.requestAnimationFrame(() => {
      textarea.focus()
      const cursorStart = selected ? start + insert.length : start + 2
      const cursorEnd = selected ? cursorStart : start + 6
      textarea.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="block text-xs text-gray-500 font-semibold">{label}</label>
        <button
          type="button"
          onClick={applyBold}
          title={boldLabel}
          aria-label={boldLabel}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-[#ff5a00]/40 hover:bg-[#fff4ed] hover:text-[#ff5a00]"
        >
          <Bold size={15} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        rows={4}
        className="min-h-[112px] w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm leading-6 transition-all focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20"
      />
    </div>
  )
}

function ImageUploadField({ label, value, onChange, onUploadComplete, lang, type, entityId, allowVideo = false }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const input = e.target
    setUploading(true)
    setError('')
    try {
      const previousUrl = value
      const data = await uploadMenuImageToR2({ file: validateMenuImage(file, allowVideo), type, entityId })
      onChange({ target: { value: data.url } })
      await onUploadComplete?.({ newUrl: data.url, previousUrl })
    } catch (err) {
      setError(`${t(lang, 'uploadError')}: ${formatMenuImageUploadError(lang, err.message)}`)
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  return (
    <div>
      <label className="block text-xs text-gray-500 font-semibold mb-1.5">{label}</label>
      <div className="flex gap-2 items-start">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 flex items-center gap-1.5 border-2 border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:border-[#ff5a00] hover:text-[#ff5a00] transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {uploading ? t(lang, 'uploading') : t(lang, 'upload')}
        </button>
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder="https://..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
        />
        <input
          ref={fileRef}
          type="file"
          accept={allowVideo ? MENU_PRODUCT_MEDIA_ACCEPT : MENU_IMAGE_ACCEPT}
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {value && (
        <MenuMedia
          src={value}
          alt={t(lang, allowVideo ? 'mediaPreview' : 'imagePreview')}
          controls={allowVideo}
          autoPlay={false}
          className={`mt-2 rounded-xl border border-gray-200 object-cover object-center ${allowVideo ? 'h-24 w-36' : 'h-20 w-20'}`}
        />
      )}
      {allowVideo && <p className="mt-1.5 text-[11px] font-semibold text-gray-400">{t(lang, 'mediaHelp')}</p>}
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}

function MediaGalleryField({ label, values, onChange, onUploadComplete, lang, entityId }) {
  const fileRef = useRef(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const mediaUrls = normalizeMenuMediaUrls(values)

  async function handleFiles(event) {
    const input = event.target
    const files = [...(input.files || [])]
    if (files.length === 0) return

    setUploading(true)
    setError('')
    const nextUrls = [...mediaUrls]
    const failed = []
    for (const file of files) {
      try {
        const data = await uploadMenuImageToR2({
          file: validateMenuImage(file, true),
          type: 'product',
          entityId,
        })
        nextUrls.push(data.url)
        await onUploadComplete?.({ newUrl: data.url, previousUrl: '' })
      } catch (uploadError) {
        failed.push(uploadError.message)
      }
    }
    onChange(normalizeMenuMediaUrls(nextUrls))
    if (failed.length > 0) {
      setError(`${t(lang, 'uploadError')}: ${formatMenuImageUploadError(lang, failed[0])}`)
    }
    setUploading(false)
    input.value = ''
  }

  function addUrl() {
    const value = urlDraft.trim()
    if (!/^https?:\/\//i.test(value)) {
      setError(t(lang, 'invalidMediaUrl'))
      return
    }
    onChange(normalizeMenuMediaUrls([...mediaUrls, value]))
    setUrlDraft('')
    setError('')
  }

  function removeUrl(url) {
    onChange(mediaUrls.filter(value => value !== url))
    setError('')
  }

  function makeCover(url) {
    onChange([url, ...mediaUrls.filter(value => value !== url)])
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-gray-500">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 px-3 text-sm font-semibold text-gray-500 transition-colors hover:border-[#ff5a00] hover:text-[#ff5a00] disabled:opacity-50"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {uploading ? t(lang, 'uploading') : t(lang, 'upload')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={MENU_PRODUCT_MEDIA_ACCEPT}
          multiple
          className="hidden"
          onChange={handleFiles}
        />
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={event => setUrlDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addUrl()
              }
            }}
            placeholder="https://..."
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm transition-all focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20"
          />
          <button
            type="button"
            onClick={addUrl}
            disabled={!urlDraft.trim()}
            className="inline-flex h-11 items-center justify-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-black text-[#ff5a00] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} />
            {t(lang, 'addMediaUrl')}
          </button>
        </div>
      </div>

      {mediaUrls.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {mediaUrls.map((url, index) => (
            <div key={url} className={`overflow-hidden rounded-xl border bg-white ${index === 0 ? 'border-orange-300 ring-2 ring-orange-100' : 'border-gray-200'}`}>
              <div className="relative aspect-square overflow-hidden bg-orange-50">
                <MenuMedia
                  src={url}
                  alt={`${t(lang, 'mediaPreview')} ${index + 1}`}
                  controls={isMenuVideoUrl(url)}
                  autoPlay={false}
                  className="h-full w-full object-cover object-center"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center bg-orange-50">
                      <UtensilsCrossed size={22} className="text-orange-200" />
                    </div>
                  }
                />
                {index === 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-[#ff5a00] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow">
                    {t(lang, 'mediaCover')}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeUrl(url)}
                  title={t(lang, 'deleteMedia')}
                  aria-label={`${t(lang, 'deleteMedia')} ${index + 1}`}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-red-100 bg-white/95 text-red-600 shadow-sm transition-colors hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => makeCover(url)}
                  className="flex h-9 w-full items-center justify-center gap-1 border-t border-gray-100 text-[11px] font-black text-gray-500 hover:bg-orange-50 hover:text-[#ff5a00]"
                >
                  {t(lang, 'makeMediaCover')}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-5 text-center text-xs font-semibold text-gray-400">
          {t(lang, 'mediaEmpty')}
        </div>
      )}
      <p className="mt-1.5 text-[11px] font-semibold text-gray-400">{t(lang, 'mediaHelp')}</p>
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}

function OrangeBtn({ onClick, icon: Icon, children, small }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 bg-[#ff5a00] text-white rounded-xl font-bold hover:bg-[#cc4800] transition-colors shadow-sm shadow-orange-200 whitespace-nowrap ${
        small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
      }`}
    >
      {Icon && <Icon size={small ? 13 : 15} />}
      {children}
    </button>
  )
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function pointerWithinOrClosestCenter(args) {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : closestCenter(args)
}

function DragHandle({ listeners, attributes }) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="flex-shrink-0 p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing touch-none"
      tabIndex={-1}
    >
      <GripVertical size={15} />
    </button>
  )
}

function MenuPrice({ item, size = 'base', align = 'left' }) {
  const pricing = getMenuPricing(item)
  const currentSize = size === 'sm' ? 'text-xs' : size === 'row' ? 'text-sm' : 'text-[16px]'
  const oldSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]'

  return (
    <div className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'} flex-shrink-0 leading-tight`}>
      {pricing.discounted && (
        <span className={`${oldSize} font-bold text-[#9CA3AF] line-through`}>{formatCurrency(pricing.oldPrice)}</span>
      )}
      <span className={`${currentSize} font-black ${pricing.discounted ? 'text-red-600' : 'text-[#ff5a00]'}`}>
        {formatCurrency(pricing.price)}{menuPriceUnitSuffix(item)}
      </span>
    </div>
  )
}

function ExternalIdBadge({ item, compact = false }) {
  const externalId = String(item.external_id || item.externalId || '').trim()
  if (!externalId) return null

  return (
    <span className={`inline-flex w-fit max-w-full items-center rounded-lg bg-[#EEF2FF] font-black text-[#4F46E5] ring-1 ring-[#C7D2FE] ${
      compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
    }`}>
      <span className="mr-1 text-[#818CF8]">ID</span>
      <span className="truncate">{externalId}</span>
    </span>
  )
}

function savingLabel(lang) {
  return lang === 'uz' ? 'Saqlanmoqda' : lang === 'ru' ? 'Сохранение' : 'Saving'
}

function itemVisibilityStatusLabel(lang, visible) {
  if (visible) return lang === 'uz' ? 'Mavjud' : lang === 'ru' ? 'Доступно' : 'Available'
  return lang === 'uz' ? 'Mavjud emas' : lang === 'ru' ? 'Недоступно' : 'Unavailable'
}

function categoryVisibilityStatusLabel(lang, visible) {
  if (visible) return lang === 'uz' ? 'Ommaviy menyuda ko‘rinadi' : lang === 'ru' ? 'Видно в публичном меню' : 'Visible on public menu'
  return hiddenFromPublicMenuLabel(lang)
}

function hiddenFromPublicMenuLabel(lang) {
  return lang === 'uz' ? 'Ommaviy menyuda yashirin' : lang === 'ru' ? 'Скрыто в публичном меню' : 'Hidden from public menu'
}

function hiddenFromWaiterMenuLabel(lang) {
  return lang === 'uz' ? 'Ofitsiant menyusida yashirin' : lang === 'ru' ? 'Скрыто в меню официанта' : 'Hidden from waiter menu'
}

function visibilityActionLabel(lang, visible, kind = 'item') {
  if (kind === 'category') {
    if (visible) return lang === 'uz' ? 'Kategoriyani ommaviy menyudan yashirish' : lang === 'ru' ? 'Скрыть категорию из публичного меню' : 'Hide category from public menu'
    return lang === 'uz' ? 'Kategoriyani ommaviy menyuda ko‘rsatish' : lang === 'ru' ? 'Показать категорию в публичном меню' : 'Show category on public menu'
  }
  if (visible) return lang === 'uz' ? 'Mahsulotni mavjud emas deb belgilash' : lang === 'ru' ? 'Сделать позицию недоступной' : 'Mark item unavailable'
  return lang === 'uz' ? 'Mahsulotni mavjud deb belgilash' : lang === 'ru' ? 'Сделать позицию доступной' : 'Mark item available'
}

function saveFailedLabel(lang) {
  return lang === 'uz'
    ? 'O‘zgarishni saqlab bo‘lmadi. Internet ulanishini tekshiring.'
    : lang === 'ru'
      ? 'Не удалось сохранить изменение. Проверьте подключение.'
      : 'Could not save the change. Check the connection.'
}

function menuScheduleLabels(lang) {
  return {
    section: lang === 'uz' ? 'Vaqt oralig‘i' : lang === 'ru' ? 'Временной интервал' : 'Time interval',
    from: lang === 'uz' ? 'Ko‘rsatish boshlanishi' : lang === 'ru' ? 'Показывать с' : 'Show from',
    until: lang === 'uz' ? 'Ko‘rsatish tugashi' : lang === 'ru' ? 'Показывать до' : 'Show until',
    hint: lang === 'uz'
      ? 'Bo‘sh qoldirilsa doim ko‘rinadi.'
      : lang === 'ru'
        ? 'Оставьте пустым, чтобы показывать всегда.'
        : 'Leave empty to show all day.',
  }
}

function scheduleBadgeLabel(entity) {
  const from = String(entity?.visible_from_time || entity?.visibleFromTime || '').slice(0, 5)
  const until = String(entity?.visible_until_time || entity?.visibleUntilTime || '').slice(0, 5)
  if (from && until) return `${from}-${until}`
  if (from) return `${from}+`
  if (until) return `<${until}`
  return ''
}

function nullableMenuTime(value) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function VisibilityToggleButton({ visible, pending, onClick, lang, kind = 'item', compact = false }) {
  const label = visibilityActionLabel(lang, visible, kind)
  const Icon = visible ? EyeOff : Eye

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={event => event.stopPropagation()}
      disabled={pending}
      title={pending ? savingLabel(lang) : label}
      aria-label={pending ? savingLabel(lang) : label}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border text-xs font-black transition-colors disabled:cursor-wait ${
        visible
          ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      } ${compact ? 'w-9 px-0' : 'px-3'}`}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {!compact && <span className="whitespace-nowrap">{pending ? savingLabel(lang) : label}</span>}
    </button>
  )
}

// ── Sortable grid card ────────────────────────────────────────────────────────

function SortableItemCard({ item, lang, onEdit, onDelete, onToggleVisibility, categories, visibilityPending, isDragging: _isDragging, readOnly = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  const cat = categories.find(c => c.id === item.category_id)
  const scheduleLabel = scheduleBadgeLabel(item)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col overflow-hidden rounded-[18px] border-2 border-[#E5E7EB] bg-white shadow-sm transition-all hover:border-gray-200 hover:shadow-md group"
    >
      {/* Drag handle strip at top of image */}
      <div className="relative">
        <SafeMenuImage
          src={item.image_url}
          alt={getItemName(item, lang)}
          className="aspect-square w-full object-cover object-center"
          fallbackClassName="aspect-square w-full"
        />
        {/* Drag handle overlay */}
        {!readOnly && (
          <button
            {...listeners}
            {...attributes}
            className="absolute top-2 left-2 p-1.5 rounded-xl bg-white/85 backdrop-blur-sm text-gray-400 hover:text-gray-700 hover:bg-white transition-colors cursor-grab active:cursor-grabbing touch-none shadow-sm"
            tabIndex={-1}
          >
            <GripVertical size={15} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col flex-1">
        <p className="font-bold text-[15px] text-[#1F2937] line-clamp-2 leading-snug mb-1">
          {getItemName(item, lang)}
        </p>
        {cat && (
          <p className="text-[11px] text-[#9CA3AF] uppercase tracking-wide font-semibold mb-1">
            {getCategoryName(cat, lang)}
          </p>
        )}
        <div className="mb-2">
          <ExternalIdBadge item={item} />
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <MenuPrice item={item} />
          {gramsLabel(item, lang) && (
            <span className="rounded-full bg-[#F8FAFC] px-2 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
              {gramsLabel(item, lang)}
            </span>
          )}
          {millilitresLabel(item, lang) && (
            <span className="rounded-full bg-[#F8FAFC] px-2 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
              {millilitresLabel(item, lang)}
            </span>
          )}
          {kcalLabel(item, lang) && (
            <span className="rounded-full bg-[#F8FAFC] px-2 py-1 text-[11px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
              {kcalLabel(item, lang)}
            </span>
          )}
          {Number(item.stock_count ?? item.stockCount ?? 0) > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700 ring-1 ring-amber-200">
              {lang === 'uz' ? 'Tokcha' : lang === 'ru' ? 'Полка' : 'Shelf'}: {Number(item.stock_count ?? item.stockCount ?? 0)}
            </span>
          )}
          {item.public_hidden && (
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-black text-blue-700 ring-1 ring-blue-200">
              {hiddenFromPublicMenuLabel(lang)}
            </span>
          )}
          {isWaiterHiddenMenuItem(item) && (
            <span className="rounded-full bg-purple-50 px-2 py-1 text-[11px] font-black text-purple-700 ring-1 ring-purple-200">
              {hiddenFromWaiterMenuLabel(lang)}
            </span>
          )}
          {scheduleLabel && (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-emerald-200">
              {scheduleLabel}
            </span>
          )}
        </div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full w-fit ${
            item.available ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
          }`}>
            {itemVisibilityStatusLabel(lang, item.available)}
          </span>
          {!readOnly && (
            <VisibilityToggleButton
              visible={!!item.available}
              pending={visibilityPending}
              onClick={() => onToggleVisibility(item)}
              lang={lang}
              compact
            />
          )}
        </div>

        {/* Actions */}
        {!readOnly && (
          <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-gray-50">
            <button
              onClick={() => onEdit(item)}
              disabled={visibilityPending}
              className="flex-1 flex h-10 items-center justify-center gap-1 rounded-xl border border-[#ff5a00]/20 bg-[#fff1e8] text-[#ff5a00] hover:bg-[#ff5a00] hover:text-white transition-colors text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Edit2 size={11} />
              {lang === 'uz' ? 'Tahrirl' : lang === 'ru' ? 'Ред.' : 'Edit'}
            </button>
            <button
              onClick={() => onDelete(item.id)}
              disabled={visibilityPending}
              className="h-10 w-10 rounded-xl border border-gray-200 text-gray-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sortable list row ─────────────────────────────────────────────────────────

function SortableItemRow({ item, lang, onEdit, onDelete, onToggleVisibility, categories, visibilityPending, readOnly = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  const cat = categories.find(c => c.id === item.category_id)
  const scheduleLabel = scheduleBadgeLabel(item)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
    >
      {!readOnly && <DragHandle listeners={listeners} attributes={attributes} />}
      <SafeMenuImage
        src={item.image_url}
        alt={getItemName(item, lang)}
        className="h-12 w-12 flex-shrink-0 rounded-xl object-cover object-center"
        fallbackClassName="h-12 w-12 flex-shrink-0 rounded-xl"
        iconSize={18}
      />
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm truncate">{getItemName(item, lang)}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {cat && <p className="text-xs text-gray-400">{getCategoryName(cat, lang)}</p>}
          <ExternalIdBadge item={item} compact />
          {item.public_hidden && (
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-700">
              {hiddenFromPublicMenuLabel(lang)}
            </span>
          )}
          {isWaiterHiddenMenuItem(item) && (
            <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-black text-purple-700">
              {hiddenFromWaiterMenuLabel(lang)}
            </span>
          )}
          {scheduleLabel && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
              {scheduleLabel}
            </span>
          )}
        </div>
      </div>
      <MenuPrice item={item} size="row" align="right" />
      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${
        item.available ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
      }`}>
        {itemVisibilityStatusLabel(lang, item.available)}
      </span>
      {!readOnly && (
        <div className="flex gap-1.5 flex-shrink-0">
          <VisibilityToggleButton
            visible={!!item.available}
            pending={visibilityPending}
            onClick={() => onToggleVisibility(item)}
            lang={lang}
            compact
          />
          <button
            onClick={() => onEdit(item)}
            disabled={visibilityPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-[#ff5a00] hover:bg-orange-50 transition-colors text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Edit2 size={12} />
            {lang === 'uz' ? 'Tahrirlash' : lang === 'ru' ? 'Редакт.' : 'Edit'}
          </button>
          <button
            onClick={() => onDelete(item.id)}
            disabled={visibilityPending}
            className="p-1.5 rounded-xl border border-gray-200 text-gray-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Sortable category row ─────────────────────────────────────────────────────

// The read-only layout removes drag/actions columns instead of leaving empty cells.
const CAT_EDIT_GRID = 'grid grid-cols-[20px_52px_minmax(0,1fr)_200px_90px_160px] items-center gap-4 px-5'
const CAT_READ_ONLY_GRID = 'grid grid-cols-[52px_minmax(260px,1fr)_minmax(220px,280px)_100px] items-center gap-4 px-5'

function SortableCatRow({ cat, lang, itemCount, onEdit, onDelete, onToggleVisibility, visibilityPending, sortIndex, readOnly = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })
  const scheduleLabel = scheduleBadgeLabel(cat)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${readOnly ? CAT_READ_ONLY_GRID : CAT_EDIT_GRID} py-4 hover:bg-gray-50/60 transition-colors border-b border-gray-100 last:border-0`}
    >
      {/* col 1 – drag handle */}
      {!readOnly && <DragHandle listeners={listeners} attributes={attributes} />}

      {/* col 2 – image */}
      {cat.image_url ? (
        <img src={cat.image_url} alt="" className="h-12 w-12 rounded-xl object-cover object-center" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
          <Tag size={18} className="text-orange-300" />
        </div>
      )}

      {/* col 3 – name + count */}
      <div className="min-w-0">
        <p className="font-bold text-gray-900 text-sm truncate">{getCategoryName(cat, lang)}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {lang === 'uz' ? `${itemCount} ta element` :
           lang === 'ru' ? `${itemCount} позиций` :
           `${itemCount} item${itemCount !== 1 ? 's' : ''}`}
        </p>
        {(cat.waiter_hidden || scheduleLabel) && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {cat.waiter_hidden && (
              <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-black text-purple-700">
                {hiddenFromWaiterMenuLabel(lang)}
              </span>
            )}
            {scheduleLabel && (
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                {scheduleLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* col 4 – status */}
      <div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full whitespace-nowrap ${
            cat.hidden ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'
          }`}>
            {categoryVisibilityStatusLabel(lang, !cat.hidden)}
          </span>
          {!readOnly && (
            <VisibilityToggleButton
              visible={!cat.hidden}
              pending={visibilityPending}
              onClick={() => onToggleVisibility(cat)}
              lang={lang}
              kind="category"
              compact
            />
          )}
        </div>
      </div>

      {/* col 5 – sort order (centred) */}
      <div className="flex justify-center">
        <span className="text-sm font-black text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100">
          {sortIndex}
        </span>
      </div>

      {/* edit-only actions */}
      {!readOnly && (
        <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => onEdit(cat)}
              disabled={visibilityPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-[#ff5a00] hover:bg-orange-50 transition-colors text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Edit2 size={12} />
              {lang === 'uz' ? 'Tahrirlash' : lang === 'ru' ? 'Ред.' : 'Edit'}
            </button>
            <button
              onClick={() => onDelete(cat.id)}
              disabled={visibilityPending}
              className="p-1.5 rounded-xl border border-gray-200 text-gray-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
        </div>
      )}
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const blankItem = {
  id: '', category_id: '',
  name_uz: '', name_ru: '', name_en: '',
  description_uz: '', description_ru: '', description_en: '',
  external_id: '', price: '', old_price: '', cost_price: '', variant_costs: {}, sale_unit: MENU_SALE_UNIT_PIECE, grams: '', millilitres: '', kcal: '', stock_count: '', image_url: '', media_urls: [], available: true, sort_order: '',
  option_groups: [],
  option_groups_editor: [],
  show_in_cashier_quick_items: false,
  cashier_only: false,
  public_hidden: false,
  waiter_hidden: false,
  visible_from_time: '',
  visible_until_time: '',
  send_to_kitchen: false,
  quick_item_sort_order: '',
}

const blankCat = {
  id: '',
  name_uz: '',
  name_ru: '',
  name_en: '',
  image_url: '',
  sort_order: '',
  hidden: false,
  waiter_hidden: false,
  visible_from_time: '',
  visible_until_time: '',
}

function parseOptionGroupsValue(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function optionGroupsToEditor(value, variantCosts = {}) {
  const protectedVariantCosts = variantCosts && typeof variantCosts === 'object' && !Array.isArray(variantCosts)
    ? variantCosts
    : {}
  return parseOptionGroupsValue(value).flatMap((group, groupIndex) => {
    const options = Array.isArray(group.options) ? group.options : []
    return options.map((option, optionIndex) => {
      const id = String(option.id || `option-${groupIndex + 1}-${optionIndex + 1}`)
      return {
        id,
        name_uz: option.label_uz || option.label || option.name || '',
        name_ru: option.label_ru || option.label || option.name || '',
        name_en: option.label_en || option.label || option.name || '',
        price: option.price ?? option.variant_price ?? '',
        cost_price: Object.prototype.hasOwnProperty.call(protectedVariantCosts, id) ? protectedVariantCosts[id] : '',
        stock_count: option.stock_count ?? option.stockCount ?? '',
      }
    })
  })
}

function safeOptionId(value, fallback) {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback
}

function editorToOptionGroups(options, basePrice = 0) {
  const parentPrice = Math.max(0, Math.round(numberFromMoneyInput(basePrice)))
  const normalizedOptions = (options || []).map((option, optionIndex) => {
    const nameUz = String(option.name_uz || '').trim()
    const nameRu = String(option.name_ru || '').trim()
    const nameEn = String(option.name_en || '').trim()
    const fallback = nameUz || nameRu || nameEn
    if (!fallback) return null
    const optionPrice = Math.max(0, Math.round(numberFromMoneyInput(option.price)))
    const stockCount = Math.max(0, Math.round(Number(option.stock_count) || 0))
    return {
      id: safeOptionId(option.id, `option_${optionIndex + 1}`),
      label_uz: nameUz || fallback,
      label_ru: nameRu || fallback,
      label_en: nameEn || fallback,
      price: optionPrice,
      price_delta: Math.max(0, optionPrice - parentPrice),
      stock_count: stockCount,
    }
  }).filter(Boolean)

  if (normalizedOptions.length === 0) return []
  return [{
    id: 'variants',
    title_uz: 'Variantlar',
    title_ru: 'Варианты',
    title_en: 'Variants',
    required: true,
    options: normalizedOptions,
  }]
}

function editorToVariantCosts(options) {
  return Object.fromEntries((options || []).flatMap((option, optionIndex) => {
    if (String(option?.cost_price ?? '').trim() === '') return []
    const id = safeOptionId(option?.id, `option_${optionIndex + 1}`)
    const cost = Math.max(0, Math.round(numberFromMoneyInput(option.cost_price)))
    return [[id, cost]]
  }))
}

function OptionGroupsEditor({ value = [], onChange, lang, parentCost = '' }) {
  function updateOption(optionIndex, patch) {
    onChange(value.map((option, index) => index === optionIndex ? { ...option, ...patch } : option))
  }

  function addOption() {
    onChange([
      ...value,
      {
        id: `option-${Date.now()}`,
        name_uz: '',
        name_ru: '',
        name_en: '',
        price: '',
        cost_price: '',
        stock_count: '',
      },
    ])
  }

  function removeOption(index) {
    onChange(value.filter((_, itemIndex) => itemIndex !== index))
  }

  const labels = {
    title: lang === 'uz' ? 'Variantlar' : lang === 'ru' ? 'Варианты' : 'Variants',
    add: lang === 'uz' ? 'Variant qo‘shish' : lang === 'ru' ? 'Добавить вариант' : 'Add variant',
    nameUz: lang === 'uz' ? 'Nomi (UZ)' : lang === 'ru' ? 'Название (UZ)' : 'Name (UZ)',
    nameRu: lang === 'uz' ? 'Nomi (RU)' : lang === 'ru' ? 'Название (RU)' : 'Name (RU)',
    nameEn: lang === 'uz' ? 'Nomi (EN)' : lang === 'ru' ? 'Название (EN)' : 'Name (EN)',
    price: lang === 'uz' ? 'Narx' : lang === 'ru' ? 'Цена' : 'Price',
    cost: lang === 'uz' ? 'Haqiqiy tannarx' : lang === 'ru' ? 'Реальная себестоимость' : 'Real cost',
    stock: lang === 'uz' ? 'Qoldiq' : lang === 'ru' ? 'Остаток' : 'Stock',
    empty: lang === 'uz' ? 'Mahsulotda variantlar bo‘lsa qo‘shing.' : lang === 'ru' ? 'Добавьте варианты, если они есть у товара.' : 'Add variants when this item has choices.',
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="text-xs font-black uppercase tracking-wide text-gray-500">{labels.title}</label>
        <button
          type="button"
          onClick={addOption}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-2.5 text-xs font-black text-[#ff5a00] hover:bg-orange-50"
        >
          <Plus size={13} />
          {labels.add}
        </button>
      </div>

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-xs font-semibold text-gray-400">{labels.empty}</p>
      ) : (
        <div className="space-y-3">
          {value.map((option, optionIndex) => {
            const hasOwnCost = String(option.cost_price ?? '').trim() !== ''
            const effectiveCost = hasOwnCost ? option.cost_price : parentCost
            return (
            <div key={option.id || optionIndex} className="min-w-0 rounded-xl border border-gray-200 bg-white p-3">
              <div className="grid min-w-0 gap-2 md:grid-cols-3">
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-400">{labels.nameUz}</span>
                  <input
                    type="text"
                    value={option.name_uz}
                    onChange={event => updateOption(optionIndex, { name_uz: event.target.value })}
                    placeholder={labels.nameUz}
                    className="min-w-0 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20"
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-400">{labels.nameRu}</span>
                  <input
                    type="text"
                    value={option.name_ru}
                    onChange={event => updateOption(optionIndex, { name_ru: event.target.value })}
                    placeholder={labels.nameRu}
                    className="min-w-0 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20"
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-400">{labels.nameEn}</span>
                  <input
                    type="text"
                    value={option.name_en}
                    onChange={event => updateOption(optionIndex, { name_en: event.target.value })}
                    placeholder={labels.nameEn}
                    className="min-w-0 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20"
                  />
                </label>
              </div>
              <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px]">
                <div className="min-w-0">
                  <MoneyField
                    label={labels.price}
                    value={option.price}
                    onChange={event => updateOption(optionIndex, { price: event.target.value })}
                    placeholder={labels.price}
                    labelClassName="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-400"
                    className="min-w-0 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm tabular-nums focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20"
                  />
                </div>
                <div className="min-w-0">
                  <MoneyField
                    label={labels.cost}
                    value={option.cost_price}
                    onChange={event => updateOption(optionIndex, { cost_price: event.target.value })}
                    placeholder={String(parentCost || '').trim() || labels.cost}
                    labelClassName="mb-1 block text-[10px] font-black uppercase tracking-wide text-emerald-600"
                    className="min-w-0 w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2.5 text-sm font-bold tabular-nums focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
                  />
                </div>
                <label className="min-w-0">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-gray-400">{labels.stock}</span>
                  <input
                    type="number"
                    min="0"
                    value={option.stock_count}
                    onChange={event => updateOption(optionIndex, { stock_count: event.target.value })}
                    placeholder={labels.stock}
                    className="min-w-0 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeOption(optionIndex)}
                  className="flex h-10 w-10 self-end items-center justify-center rounded-xl border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-2">
                <ProfitMarginPreview price={option.price} cost={effectiveCost} lang={lang} inheritedCost={!hasOwnCost} />
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function menuItemToProductForm(i) {
  const mediaUrls = getMenuItemMediaUrls(i)
  const normalizedText = trimMenuItemTextFields(i)
  return {
    ...blankItem,
    ...i,
    ...normalizedText,
    cost_price: i.cost_price ?? i.costPrice ?? '',
    sale_unit: normalizeMenuSaleUnit(i.sale_unit ?? i.saleUnit),
    millilitres: i.millilitres ?? i.milliliters ?? (Number(i.litres ?? i.liters) > 0 ? Math.round(Number(i.litres ?? i.liters) * 1000) : ''),
    stock_count: i.stock_count ?? i.stockCount ?? 0,
    sort_order: i.sort_order ?? 0,
    show_in_cashier_quick_items: isCashierQuickItem(i),
    cashier_only: !!(i.cashier_only || i.cashierOnly),
    public_hidden: !!(i.public_hidden || i.publicHidden || i.hide_from_public || i.hideFromPublic),
    waiter_hidden: isWaiterHiddenMenuItem(i),
    visible_from_time: String(i.visible_from_time || i.visibleFromTime || '').slice(0, 5),
    visible_until_time: String(i.visible_until_time || i.visibleUntilTime || '').slice(0, 5),
    send_to_kitchen: !!(i.send_to_kitchen || i.sendToKitchen),
    quick_item_sort_order: i.quick_item_sort_order ?? i.quickItemSortOrder ?? '',
    variant_costs: i.variant_costs ?? i.variantCosts ?? {},
    image_url: mediaUrls[0] || '',
    media_urls: mediaUrls,
    option_groups_editor: optionGroupsToEditor(
      i.option_groups ?? i.optionGroups,
      i.variant_costs ?? i.variantCosts,
    ),
  }
}

function getItemFormFingerprint(form = {}) {
  const normalizedText = trimMenuItemTextFields(form)
  return JSON.stringify({
    category_id: String(form.category_id || ''),
    name_uz: normalizedText.name_uz || '',
    name_ru: normalizedText.name_ru || '',
    name_en: normalizedText.name_en || '',
    description_uz: normalizedText.description_uz || '',
    description_ru: normalizedText.description_ru || '',
    description_en: normalizedText.description_en || '',
    image_url: String(form.image_url || ''),
    media_urls: normalizeMenuMediaUrls(form.media_urls),
    price: numberFromMoneyInput(form.price),
    old_price: Math.max(0, Math.round(numberFromMoneyInput(form.old_price))),
    cost_price: Math.max(0, Math.round(numberFromMoneyInput(form.cost_price))),
    variant_costs: editorToVariantCosts(form.option_groups_editor),
    sale_unit: normalizeMenuSaleUnit(form.sale_unit),
    grams: Math.max(0, Math.round(Number(form.grams) || 0)),
    millilitres: Math.max(0, Math.round(Number(form.millilitres) || 0)),
    kcal: Math.max(0, Math.round(Number(form.kcal) || 0)),
    stock_count: Math.max(0, Math.round(Number(form.stock_count) || 0)),
    sort_order: Number(form.sort_order) || 0,
    quick_item_sort_order: Number(form.quick_item_sort_order) || 0,
    available: !!form.available,
    show_in_cashier_quick_items: !!form.show_in_cashier_quick_items,
    cashier_only: !!form.cashier_only,
    public_hidden: !!form.public_hidden,
    waiter_hidden: !!form.waiter_hidden,
    visible_from_time: nullableMenuTime(form.visible_from_time),
    visible_until_time: nullableMenuTime(form.visible_until_time),
    send_to_kitchen: !!form.send_to_kitchen,
    option_groups: editorToOptionGroups(form.option_groups_editor, form.price),
  })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminMenu() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const { loaded, loadError } = useAppDataStatus()
  const lang = state.lang
  const canEditMenu = canEditMenuForProfile(profile || { role: state.user?.role })
  const scheduleLabels = menuScheduleLabels(lang)
  const navigate = useNavigate()
  const { productId } = useParams()
  const [searchParams] = useSearchParams()
  const isProductEditorPage = !!productId

  const [tab,        setTab]        = useState('items')
  const [itemModal,  setItemModal]  = useState(null)
  const [catModal,   setCatModal]   = useState(null)
  const [form,       setForm]       = useState(blankItem)
  const [catForm,    setCatForm]    = useState(blankCat)
  const [search,     setSearch]     = useState('')
  const [filterCat,  setFilterCat]  = useState('all')
  const [filterAvail,setFilterAvail]= useState('all')
  const [gridView,   setGridView]   = useState(true)
  const [activeId,   setActiveId]   = useState(null) // drag overlay
  const [savingItemId, setSavingItemId] = useState('')
  const [savingCatId, setSavingCatId] = useState('')
  const [savingItemForm, setSavingItemForm] = useState(false)
  const [savingCatForm, setSavingCatForm] = useState(false)
  const [originalItemFormFingerprint, setOriginalItemFormFingerprint] = useState('')
  const [menuNotice, setMenuNotice] = useState(null)
  const uploadedItemImageUrlsRef = useRef(new Set())
  const uploadedCatImageUrlsRef = useRef(new Set())
  const productEditorInitializedRef = useRef('')
  const shellScrollRef = useRef(null)
  const currentItemFormFingerprint = useMemo(() => getItemFormFingerprint(form), [form])
  const isItemFormDirty = itemModal === 'new'
    || (itemModal === 'edit' && !!originalItemFormFingerprint && currentItemFormFingerprint !== originalItemFormFingerprint)
  const hasValidNewItemCost = itemModal !== 'new' || hasRequiredMenuItemCost(form.cost_price)
  const canSaveItemForm = !savingItemForm
    && canEditMenu
    && !!trimMenuItemTextValue(form.name_uz)
    && !!form.price
    && !!form.category_id
    && hasValidNewItemCost
    && isItemFormDirty

  // Sensors: pointer (mouse/trackpad) + touch
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  // ── Sorted data ────────────────────────────────────────────────────────────
  const sortedCategories = useMemo(() =>
    [...state.categories].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories]
  )
  const realSortedCats = useMemo(() =>
    sortedCategories.filter(c => c.id !== 'all'),
    [sortedCategories]
  )

  const sortedItems = useMemo(() =>
    state.menuItems
      .filter(isActiveMenuItem)
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.menuItems]
  )

  const quickItems = useMemo(() =>
    sortedItems
      .filter(isCashierQuickItem)
      .sort((a, b) => getQuickItemSortOrder(a) - getQuickItemSortOrder(b)),
    [sortedItems]
  )

  const filteredItems = useMemo(() => {
    return sortedItems.filter(item => {
      const matchAvail  = filterAvail === 'all'
        || (filterAvail === 'available' && item.available && !item.cashier_only)
        || (filterAvail === 'hidden' && !item.available)
        || (filterAvail === 'cashier_only' && !!item.cashier_only)
        || (filterAvail === 'public_hidden' && !!item.public_hidden)
        || (filterAvail === 'waiter_hidden' && isWaiterHiddenMenuItem(item))
      const q           = search.trim().toLowerCase()
      const externalId  = String(item.external_id || item.externalId || '').toLowerCase()
      const matchSearch = !q || getItemName(item, lang).toLowerCase().includes(q) || externalId.includes(q)
      return (matchAvail || savingItemId === item.id) && matchSearch
    })
  }, [sortedItems, filterAvail, search, lang, savingItemId])

  const itemCountByCat = useMemo(() => {
    const m = { all: sortedItems.length }
    sortedItems.forEach(i => { m[i.category_id] = (m[i.category_id] || 0) + 1 })
    return m
  }, [sortedItems])

  async function cleanupTrackedUploads(ref, keepUrls = []) {
    const keep = new Set(keepUrls.filter(Boolean))
    const staleUrls = [...ref.current].filter(url => !keep.has(url))
    ref.current.clear()
    await Promise.allSettled(staleUrls.map(url => deleteMenuImageFromR2(url)))
  }

  async function handleTrackedUpload(ref, { newUrl, previousUrl }) {
    if (newUrl) ref.current.add(newUrl)
    if (previousUrl && previousUrl !== newUrl && ref.current.has(previousUrl)) {
      ref.current.delete(previousUrl)
      await deleteMenuImageFromR2(previousUrl).catch(() => {})
    }
  }

  useEffect(() => {
    if (!loaded || !isProductEditorPage) return
    if (productEditorInitializedRef.current === productId) return
    productEditorInitializedRef.current = productId
    uploadedItemImageUrlsRef.current.clear()

    if (!canEditMenu) {
      navigate('/admin/menu', { replace: true })
      return
    }

    if (productId === 'new') {
      const maxOrder = sortedItems.length > 0
        ? Math.max(...sortedItems.map(i => i.sort_order ?? 0)) : 0
      const maxQuickOrder = quickItems.length > 0
        ? Math.max(...quickItems.map(i => getQuickItemSortOrder(i))) : 0
      const quick = searchParams.get('quick') === '1'
      if (quick) {
        const nextForm = {
          ...blankItem,
          id: 'i' + Date.now(),
          external_id: generateMenuExternalId(),
          sort_order: maxOrder + 1,
          show_in_cashier_quick_items: true,
          cashier_only: false,
          public_hidden: false,
          send_to_kitchen: false,
          quick_item_sort_order: maxQuickOrder + 1,
          option_groups_editor: [],
        }
        setForm(nextForm)
        setOriginalItemFormFingerprint(getItemFormFingerprint(nextForm))
      } else {
        const nextForm = {
          ...blankItem,
          id: 'i' + Date.now(),
          external_id: generateMenuExternalId(),
          sort_order: maxOrder + 1,
          show_in_cashier_quick_items: false,
          cashier_only: false,
          public_hidden: false,
          send_to_kitchen: false,
          quick_item_sort_order: '',
          option_groups_editor: [],
        }
        setForm(nextForm)
        setOriginalItemFormFingerprint(getItemFormFingerprint(nextForm))
      }
      setItemModal('new')
      return
    }

    const item = sortedItems.find(row => row.id === productId)
    if (!item) {
      navigate('/admin/menu', { replace: true })
      return
    }
    const nextForm = menuItemToProductForm(item)
    setForm(nextForm)
    setOriginalItemFormFingerprint(getItemFormFingerprint(nextForm))
    setItemModal('edit')
  }, [loaded, isProductEditorPage, productId, quickItems, searchParams, sortedItems, navigate, canEditMenu])

  useEffect(() => {
    if (!loaded || isProductEditorPage) return undefined
    const savedScrollTop = takeSavedAdminMenuScrollPosition()
    if (savedScrollTop == null) return undefined

    let frameId = 0
    let cancelled = false

    function restore(attemptsLeft = 10) {
      if (cancelled) return
      const scroller = shellScrollRef.current
      if (scroller) {
        scroller.scrollTop = savedScrollTop
        if (Math.abs(scroller.scrollTop - savedScrollTop) <= 2 || attemptsLeft <= 0) {
          clearSavedAdminMenuScrollPosition()
          return
        }
      }
      frameId = window.requestAnimationFrame(() => restore(attemptsLeft - 1))
    }

    frameId = window.requestAnimationFrame(() => restore())
    return () => {
      cancelled = true
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [loaded, isProductEditorPage, tab, filteredItems.length])

  // ── Item CRUD ──────────────────────────────────────────────────────────────
  function saveMenuListScrollBeforeProductNavigation() {
    saveAdminMenuScrollPosition(shellScrollRef.current?.scrollTop || 0)
  }

  function openNewItem() {
    if (!canEditMenu) return
    saveMenuListScrollBeforeProductNavigation()
    navigate('/admin/menu/product/new')
  }
  function openNewQuickItem() {
    if (!canEditMenu) return
    saveMenuListScrollBeforeProductNavigation()
    navigate('/admin/menu/product/new?quick=1')
  }
  function openEditItem(i) {
    if (!canEditMenu) return
    saveMenuListScrollBeforeProductNavigation()
    navigate(`/admin/menu/product/${encodeURIComponent(i.id)}`)
  }
  async function closeItemModal() {
    if (savingItemForm) return
    await cleanupTrackedUploads(uploadedItemImageUrlsRef)
    setItemModal(null)
    if (isProductEditorPage) {
      productEditorInitializedRef.current = ''
      navigate('/admin/menu')
    }
  }
  async function saveItem() {
    if (savingItemForm || !canEditMenu || !isItemFormDirty) return
    if (!trimMenuItemTextValue(form.name_uz) || !form.price || !form.category_id) return
    const requiredCost = itemModal === 'new' ? getRequiredMenuItemCost(form.cost_price) : null
    if (itemModal === 'new' && requiredCost === null) {
      setMenuNotice({
        tone: 'error',
        message: lang === 'uz'
          ? 'Yangi mahsulot uchun haqiqiy tannarxni kiriting.'
          : lang === 'ru'
            ? 'Укажите реальную себестоимость нового товара.'
            : 'Enter the real cost for the new product.',
      })
      return
    }
    setSavingItemForm(true)
    setMenuNotice(null)
    try {
      const optionGroups = editorToOptionGroups(form.option_groups_editor, form.price)
      const existingItem = itemModal === 'edit'
        ? state.menuItems.find(item => item.id === form.id)
        : null
      const oldMediaUrls = getMenuItemMediaUrls(existingItem)
      const mediaUrls = normalizeMenuMediaUrls(form.media_urls)
      const { option_groups_editor: _optionGroupsEditor, option_groups: _optionGroups, ...formFields } = form
      const result = await dispatch({
        type: itemModal === 'new' ? 'ADD_MENU_ITEM' : 'UPDATE_MENU_ITEM',
        payload: {
          ...formFields,
          image_url: mediaUrls[0] || '',
          media_urls: mediaUrls,
          option_groups: optionGroups,
          external_id: itemModal === 'new' ? String(form.external_id || generateMenuExternalId()).trim() : state.menuItems.find(item => item.id === form.id)?.external_id,
          price: numberFromMoneyInput(form.price),
          old_price: Math.max(0, Math.round(numberFromMoneyInput(form.old_price))),
          cost_price: itemModal === 'new'
            ? requiredCost
            : Math.max(0, Math.round(numberFromMoneyInput(form.cost_price))),
          variant_costs: editorToVariantCosts(form.option_groups_editor),
          sale_unit: normalizeMenuSaleUnit(form.sale_unit),
          grams: Math.max(0, Math.round(Number(form.grams) || 0)),
          millilitres: Math.max(0, Math.round(Number(form.millilitres) || 0)),
          kcal: Math.max(0, Math.round(Number(form.kcal) || 0)),
          stock_count: Math.max(0, Math.round(Number(form.stock_count) || 0)),
          sort_order: Number(form.sort_order) || 0,
          quick_item_sort_order: Number(form.quick_item_sort_order) || 0,
          show_in_cashier_quick_items: !!form.show_in_cashier_quick_items,
          cashier_only: !!form.cashier_only,
          public_hidden: !!form.public_hidden,
          waiter_hidden: !!form.waiter_hidden,
          visible_from_time: nullableMenuTime(form.visible_from_time),
          visible_until_time: nullableMenuTime(form.visible_until_time),
          send_to_kitchen: !!form.send_to_kitchen,
        },
      })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
        return
      }
      await cleanupTrackedUploads(uploadedItemImageUrlsRef, mediaUrls)
      const keptMediaUrls = new Set(mediaUrls)
      await Promise.allSettled(
        oldMediaUrls
          .filter(url => !keptMediaUrls.has(url))
          .map(url => deleteMenuImageFromR2(url))
      )
      setItemModal(null)
      if (isProductEditorPage) {
        productEditorInitializedRef.current = ''
        navigate('/admin/menu')
      }
    } finally {
      setSavingItemForm(false)
    }
  }
  async function toggleItemVisibility(item) {
    if (!canEditMenu || !item?.id || savingItemId) return
    setSavingItemId(item.id)
    setMenuNotice(null)
    try {
      const result = await dispatch({
        type: 'UPDATE_MENU_ITEM',
        payload: { ...item, available: !item.available },
      })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
      }
    } finally {
      setSavingItemId('')
    }
  }
  async function deleteItem(id) {
    if (!canEditMenu || savingItemId) return
    if (!window.confirm('Delete this item?')) return
    setSavingItemId(id)
    setMenuNotice(null)
    try {
      const result = await dispatch({ type: 'DELETE_MENU_ITEM', payload: id })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
      }
    } finally {
      setSavingItemId('')
    }
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────
  function openNewCat() {
    if (!canEditMenu) return
    uploadedCatImageUrlsRef.current.clear()
    const maxOrder = realSortedCats.length > 0
      ? Math.max(...realSortedCats.map(c => c.sort_order ?? 0)) : 0
    setCatForm({ ...blankCat, id: 'c' + Date.now(), sort_order: maxOrder + 1 })
    setCatModal('new')
  }
  function openEditCat(c) {
    if (!canEditMenu) return
    uploadedCatImageUrlsRef.current.clear()
    setCatForm({
      ...blankCat,
      ...c,
      sort_order: c.sort_order ?? 0,
      hidden: !!c.hidden,
      waiter_hidden: !!(c.waiter_hidden || c.waiterHidden || c.hide_from_waiter || c.hideFromWaiter),
      visible_from_time: String(c.visible_from_time || c.visibleFromTime || '').slice(0, 5),
      visible_until_time: String(c.visible_until_time || c.visibleUntilTime || '').slice(0, 5),
    })
    setCatModal('edit')
  }
  async function closeCatModal() {
    if (savingCatForm) return
    await cleanupTrackedUploads(uploadedCatImageUrlsRef)
    setCatModal(null)
  }
  async function saveCat() {
    if (savingCatForm || !canEditMenu) return
    if (!catForm.name_uz) return
    setSavingCatForm(true)
    setMenuNotice(null)
    try {
      const oldImageUrl = catModal === 'edit'
        ? state.categories.find(category => category.id === catForm.id)?.image_url
        : ''
      const result = await dispatch({
        type: catModal === 'new' ? 'ADD_CATEGORY' : 'UPDATE_CATEGORY',
        payload: {
          ...catForm,
          sort_order: Number(catForm.sort_order) || 0,
          hidden: !!catForm.hidden,
          waiter_hidden: !!catForm.waiter_hidden,
          visible_from_time: nullableMenuTime(catForm.visible_from_time),
          visible_until_time: nullableMenuTime(catForm.visible_until_time),
        },
      })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
        return
      }
      await cleanupTrackedUploads(uploadedCatImageUrlsRef, [catForm.image_url])
      if (oldImageUrl && oldImageUrl !== catForm.image_url) {
        await deleteMenuImageFromR2(oldImageUrl)
      }
      setCatModal(null)
    } finally {
      setSavingCatForm(false)
    }
  }
  async function toggleCategoryVisibility(cat) {
    if (!canEditMenu || !cat?.id || cat.id === 'all' || savingCatId) return
    setSavingCatId(cat.id)
    setMenuNotice(null)
    try {
      const result = await dispatch({
        type: 'UPDATE_CATEGORY',
        payload: { ...cat, hidden: !cat.hidden },
      })
      if (result?.error) {
        setMenuNotice({ tone: 'error', message: result.error.message || saveFailedLabel(lang) })
      }
    } finally {
      setSavingCatId('')
    }
  }
  function deleteCat(id) {
    if (!canEditMenu) return
    if (id === 'all') return
    if (window.confirm('Delete category?')) dispatch({ type: 'DELETE_CATEGORY', payload: id })
  }

  function setF(key)  { return e => setForm(f => ({ ...f, [key]: e.target.value })) }
  function trimF(key) { return () => setForm(f => ({ ...f, [key]: trimMenuItemTextValue(f[key]) })) }
  function setCF(key) { return e => setCatForm(f => ({ ...f, [key]: e.target.value })) }

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function movedSortUpdates(rows, activeIdValue, overIdValue, sortKey = 'sort_order', getOrder = row => row?.[sortKey]) {
    const oldIndex = rows.findIndex(row => row.id === activeIdValue)
    const newIndex = rows.findIndex(row => row.id === overIdValue)
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return []
    const sortSlots = rows.map((row, index) => {
      const value = Number(getOrder(row))
      return Number.isFinite(value) ? value : index + 1
    })
    return arrayMove(rows, oldIndex, newIndex).map((row, index) => ({
      id: row.id,
      [sortKey]: sortSlots[index],
    }))
  }

  function handleItemDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!canEditMenu) return
    if (!over || active.id === over.id) return
    const updates = movedSortUpdates(filteredItems, active.id, over.id)
    if (updates.length === 0) return
    dispatch({ type: 'REORDER_MENU_ITEM', payload: { updates } })
  }

  function handleCatDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!canEditMenu) return
    if (!over || active.id === over.id) return
    const updates = movedSortUpdates(realSortedCats, active.id, over.id)
    if (updates.length === 0) return
    dispatch({ type: 'REORDER_CATEGORY', payload: { updates } })
  }

  function handleQuickItemDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!canEditMenu) return
    if (!over || active.id === over.id) return
    const updates = movedSortUpdates(quickItems, active.id, over.id, 'quick_item_sort_order', getQuickItemSortOrder)
    if (updates.length === 0) return
    dispatch({ type: 'REORDER_QUICK_ITEM', payload: { updates } })
  }

  // Overlay item for drag ghost
  const activeItem = activeId ? filteredItems.find(i => i.id === activeId) : null
  const activeCat  = activeId ? realSortedCats.find(c => c.id === activeId) : null

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!loaded || loadError) {
    return (
      <AppShell title={t(lang, 'menu')} contentRef={shellScrollRef}>
        <div className="min-h-screen bg-[#FAF6EE]">
          {!loaded ? (
            <OperationalLoading
              title={lang === 'uz' ? 'Menyu yuklanmoqda' : lang === 'ru' ? 'Загрузка меню' : 'Loading menu'}
              description={lang === 'uz' ? 'Kategoriyalar va mahsulotlar olinmoqda.' : lang === 'ru' ? 'Получаем категории и позиции.' : 'Fetching categories and items.'}
            />
          ) : (
            <OperationalError
              title={lang === 'uz' ? 'Menyuni yuklab bo‘lmadi' : lang === 'ru' ? 'Не удалось загрузить меню' : 'Could not load menu'}
              description={loadError}
              actionLabel={lang === 'uz' ? 'Qayta yuklash' : lang === 'ru' ? 'Перезагрузить' : 'Reload'}
              onAction={() => window.location.reload()}
            />
          )}
        </div>
      </AppShell>
    )
  }

  if (isProductEditorPage) {
    const editorTitle = itemModal === 'new' ? t(lang, 'addItem') : t(lang, 'editItem')
    return (
      <AppShell title={editorTitle}>
        <div className="min-h-screen bg-[#FAF6EE]">
          <div className="border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
            <div className="mx-auto flex w-full max-w-[1180px] items-center gap-3">
              <button
                type="button"
                onClick={closeItemModal}
                disabled={savingItemForm}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:cursor-wait disabled:opacity-50"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-black text-gray-900">{editorTitle}</h1>
                <p className="mt-0.5 text-sm text-gray-400">
                  {lang === 'uz' ? 'Mahsulot, variant narxlari va qoldiqlarini boshqaring' :
                   lang === 'ru' ? 'Управляйте товаром, ценами вариантов и остатками' :
                   'Manage product details, variant prices, and stock counts'}
                </p>
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[1180px] px-4 py-5">
            {menuNotice && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {menuNotice.message}
              </div>
            )}
            {!itemModal ? (
              <OperationalLoading
                title={lang === 'uz' ? 'Mahsulot ochilmoqda' : lang === 'ru' ? 'Открываем товар' : 'Opening product'}
                description={lang === 'uz' ? 'Ma’lumotlar tayyorlanmoqda.' : lang === 'ru' ? 'Подготавливаем данные.' : 'Preparing the editor.'}
              />
            ) : (
              <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <section className="min-w-0 space-y-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-gray-500 font-semibold mb-1.5">{t(lang, 'category')}</label>
                      <select
                        value={form.category_id}
                        onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
                      >
                        <option value="">— {t(lang, 'category')} —</option>
                        {realSortedCats.map(c => (
                          <option key={c.id} value={c.id}>{getCategoryName(c, lang)}</option>
                        ))}
                      </select>
                    </div>
                    <Field
                      label={lang === 'uz' ? 'Tokchadagi soni' : lang === 'ru' ? 'Количество на полке' : 'Shelf count'}
                      type="number"
                      value={form.stock_count}
                      onChange={setF('stock_count')}
                      placeholder="24"
                    />
                  </div>

                  <PricingFields form={form} setF={setF} lang={lang} costRequired={itemModal === 'new'} />

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t(lang, 'nameUz')} value={form.name_uz} onChange={setF('name_uz')} onBlur={trimF('name_uz')} />
                    <Field label={t(lang, 'nameRu')} value={form.name_ru} onChange={setF('name_ru')} onBlur={trimF('name_ru')} />
                    <Field label={t(lang, 'nameEn')} value={form.name_en} onChange={setF('name_en')} onBlur={trimF('name_en')} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <DescriptionField label={t(lang, 'descUz')} value={form.description_uz} onChange={setF('description_uz')} onBlur={trimF('description_uz')} lang={lang} />
                    <DescriptionField label={t(lang, 'descRu')} value={form.description_ru} onChange={setF('description_ru')} onBlur={trimF('description_ru')} lang={lang} />
                    <DescriptionField label={t(lang, 'descEn')} value={form.description_en} onChange={setF('description_en')} onBlur={trimF('description_en')} lang={lang} />
                  </div>

                  <OptionGroupsEditor
                    value={form.option_groups_editor}
                    onChange={optionGroups => setForm(current => ({ ...current, option_groups_editor: optionGroups }))}
                    lang={lang}
                    parentCost={form.cost_price}
                  />
                </section>

                <aside className="min-w-0 space-y-4">
                  <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2.5">
                      <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-[#818CF8]">
                        {lang === 'uz' ? 'Tashqi ID' : lang === 'ru' ? 'Внешний ID' : 'External ID'}
                      </p>
                      <p className="font-black text-[#4F46E5]">{form.external_id || '—'}</p>
                    </div>
                    <MediaGalleryField
                      label={t(lang, 'mediaUrl')}
                      values={form.media_urls}
                      onChange={mediaUrls => setForm(current => ({
                        ...current,
                        image_url: mediaUrls[0] || '',
                        media_urls: mediaUrls,
                      }))}
                      onUploadComplete={upload => handleTrackedUpload(uploadedItemImageUrlsRef, upload)}
                      lang={lang}
                      entityId={form.id}
                    />
                    <SaleUnitField value={form.sale_unit} onChange={setF('sale_unit')} lang={lang} />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t(lang, 'sortOrder')} type="number" value={form.sort_order} onChange={setF('sort_order')} placeholder="1" />
                      <Field label={`${t(lang, 'gramsLabel')} (${t(lang, 'grams')})`} type="number" value={form.grams} onChange={setF('grams')} placeholder="250" />
                      <Field label={`${t(lang, 'millilitresLabel')} (${t(lang, 'millilitres')})`} type="number" value={form.millilitres} onChange={setF('millilitres')} placeholder="500" />
                      <Field label={`${t(lang, 'kcalLabel')} (${t(lang, 'kcal')})`} type="number" value={form.kcal} onChange={setF('kcal')} placeholder="420" />
                      <Field
                        label={lang === 'uz' ? 'Tezkor tartib' : lang === 'ru' ? 'Порядок быстрого' : 'Quick order'}
                        type="number"
                        value={form.quick_item_sort_order}
                        onChange={setF('quick_item_sort_order')}
                        placeholder="1"
                      />
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-gray-500">{scheduleLabels.section}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={scheduleLabels.from} type="time" value={form.visible_from_time || ''} onChange={setF('visible_from_time')} />
                        <Field label={scheduleLabels.until} type="time" value={form.visible_until_time || ''} onChange={setF('visible_until_time')} />
                      </div>
                      <p className="mt-2 text-[11px] font-semibold text-gray-400">{scheduleLabels.hint}</p>
                    </div>
                    <label className="flex items-center gap-2 pt-1 text-sm font-medium text-gray-700">
                      <input type="checkbox" checked={form.available} onChange={e => setForm(f => ({ ...f, available: e.target.checked }))} disabled={savingItemForm} className="h-4 w-4 accent-[#ff5a00] disabled:cursor-wait" />
                      {t(lang, 'available_item')}
                    </label>
                    <label className="flex items-center gap-2 pt-1 text-sm font-medium text-gray-700">
                      <input type="checkbox" checked={!!form.show_in_cashier_quick_items} onChange={e => setForm(f => ({ ...f, show_in_cashier_quick_items: e.target.checked }))} disabled={savingItemForm} className="h-4 w-4 accent-[#ff5a00] disabled:cursor-wait" />
                      {lang === 'uz' ? 'Kassir tezkor mahsulotlarida ko‘rsatish' : lang === 'ru' ? 'Показывать в быстрых товарах кассира' : 'Show in cashier quick items'}
                    </label>
                    <label className="flex items-center gap-2 pt-1 text-sm font-medium text-gray-700">
                      <input type="checkbox" checked={!!form.public_hidden} onChange={e => setForm(f => ({ ...f, public_hidden: e.target.checked }))} disabled={savingItemForm} className="h-4 w-4 accent-[#ff5a00] disabled:cursor-wait" />
                      {lang === 'uz' ? 'Ommaviy menyudan yashirish' : lang === 'ru' ? 'Скрыть из публичного меню' : 'Hide from public menu'}
                    </label>
                    <label className="flex items-center gap-2 pt-1 text-sm font-medium text-gray-700">
                      <input type="checkbox" checked={!!form.waiter_hidden} onChange={e => setForm(f => ({ ...f, waiter_hidden: e.target.checked }))} disabled={savingItemForm} className="h-4 w-4 accent-[#ff5a00] disabled:cursor-wait" />
                      {lang === 'uz' ? 'Ofitsiant menyusidan yashirish' : lang === 'ru' ? 'Скрыть из меню официанта' : 'Hide from waiter menu'}
                    </label>
                    <label className="flex items-center gap-2 pt-1 text-sm font-medium text-gray-700">
                      <input type="checkbox" checked={!!form.cashier_only} onChange={e => setForm(f => ({ ...f, cashier_only: e.target.checked }))} disabled={savingItemForm} className="h-4 w-4 accent-[#ff5a00] disabled:cursor-wait" />
                      {lang === 'uz' ? 'Faqat kassirda ko‘rsatish' : lang === 'ru' ? 'Только для кассира' : 'Cashier only'}
                    </label>
                  </section>
                  <div className="sticky bottom-4 flex gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg">
                    <button onClick={closeItemModal} disabled={savingItemForm} className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:cursor-wait disabled:opacity-50">
                      {t(lang, 'cancel')}
                    </button>
                    <button onClick={saveItem} disabled={!canSaveItemForm} className="flex-1 inline-flex items-center justify-center gap-2 bg-[#ff5a00] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none">
                      {savingItemForm && <Loader2 size={15} className="animate-spin" />}
                      {savingItemForm ? savingLabel(lang) : t(lang, 'save')}
                    </button>
                  </div>
                </aside>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={t(lang, 'menu')} contentRef={shellScrollRef}>
      <div className="min-h-screen bg-[#FAF6EE]">

        {/* Page header */}
        <div className="bg-white border-b border-gray-100 px-6 pt-5 pb-0">
          <div className="w-full">
            <h1 className="text-2xl font-black text-gray-900">{t(lang, 'menu')}</h1>
            <p className="text-sm text-gray-400 mt-0.5 mb-4">
              {lang === 'uz' ? 'Menyu elementlari va kategoriyalarini boshqaring' :
               lang === 'ru' ? 'Управляйте позициями меню и категориями' :
               'Manage your menu items and categories'}
            </p>
            <div className="flex gap-0">
              {[
                ['items', t(lang, 'menuItems')],
                ['categories', t(lang, 'categories')],
                ['quick_items', lang === 'uz' ? 'Tezkor mahsulotlar' : lang === 'ru' ? 'Быстрые товары' : 'Quick Items'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-8 py-3 text-sm font-bold transition-all border-b-2 ${
                    tab === key ? 'text-[#ff5a00] border-[#ff5a00]' : 'text-gray-400 border-transparent hover:text-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1180px] px-4 py-5">
          {menuNotice && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {menuNotice.message}
            </div>
          )}

          {/* ══ Menu Items tab ═══════════════════════════════════════════════ */}
          {tab === 'items' && (
            <>
              <div className="mb-5 rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm">
              {/* Toolbar row 1: search + availability + grid toggle + add */}
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="relative flex-1 min-w-[240px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={lang === 'uz' ? 'Menyu elementlarini qidirish...' :
                                 lang === 'ru' ? 'Поиск позиций меню...' : 'Search menu items...'}
                    className="w-full pl-9 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all shadow-sm"
                  />
                </div>
                <select
                  value={filterAvail}
                  onChange={e => setFilterAvail(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] shadow-sm cursor-pointer"
                >
                  <option value="all">
                    {lang === 'uz' ? 'Mavjudlik' : lang === 'ru' ? 'Доступность' : 'Availability'}
                  </option>
                  <option value="available">
                    {lang === 'uz' ? 'Mavjud' : lang === 'ru' ? 'Доступно' : 'Available'}
                  </option>
                  <option value="hidden">
                    {lang === 'uz' ? 'Mavjud emas' : lang === 'ru' ? 'Недоступно' : 'Unavailable'}
                  </option>
                  <option value="cashier_only">
                    {lang === 'uz' ? 'Faqat kassirda' : lang === 'ru' ? 'Только у кассира' : 'Only cashier'}
                  </option>
                  <option value="public_hidden">
                    {hiddenFromPublicMenuLabel(lang)}
                  </option>
                  <option value="waiter_hidden">
                    {hiddenFromWaiterMenuLabel(lang)}
                  </option>
                </select>
                <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <button
                    onClick={() => setGridView(true)}
                    className={`p-3 transition-colors ${gridView ? 'bg-[#ff5a00] text-white' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    onClick={() => setGridView(false)}
                    className={`p-3 transition-colors ${!gridView ? 'bg-[#ff5a00] text-white' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <List size={15} />
                  </button>
                </div>
                {canEditMenu && <OrangeBtn onClick={openNewItem} icon={Plus}>{t(lang, 'addItem')}</OrangeBtn>}
              </div>

              {/* Toolbar row 2: category cards */}
              <MenuCategoryScroller
                categories={[
                  { id: 'all', label: lang === 'uz' ? 'Hammasi' : lang === 'ru' ? 'Все' : 'All', image_url: null },
                  ...realSortedCats.map(c => ({ ...c, label: getCategoryName(c, lang) })),
                ]}
                activeCategoryId={filterCat}
                onCategoryClick={setFilterCat}
                onActiveCategoryChange={setFilterCat}
                lang={lang}
                itemCounts={itemCountByCat}
                sectionPrefix="admin-menu-category"
                scrollContainerRef={shellScrollRef}
                topOffset={0}
                className="mb-2"
                collapsedPosition="fixed"
                collapsedSurfaceClass="bg-white/95"
                collapsedClassName="px-4 shadow-sm"
              />
              </div>

              {/* Hint */}
              {canEditMenu && filteredItems.length > 1 && (
                <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                  <GripVertical size={12} />
                  {lang === 'uz' ? 'Tartiblash uchun sudrang' : lang === 'ru' ? 'Перетащите для сортировки' : 'Drag to reorder'}
                </p>
              )}

              {filteredItems.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl py-20 text-center shadow-sm">
                  <UtensilsCrossed size={40} className="mx-auto mb-3 text-gray-200" />
                  {search || filterCat !== 'all' || filterAvail !== 'all' ? (
                    // Filters are active — just tell user to adjust them, no Add button
                    <>
                      <p className="text-gray-500 font-semibold mb-1">
                        {lang === 'uz' ? 'Natija topilmadi' : lang === 'ru' ? 'Ничего не найдено' : 'No results found'}
                      </p>
                      <p className="text-sm text-gray-400">
                        {lang === 'uz' ? 'Filtrni tozalang yoki boshqa qidiruv kiriting' : lang === 'ru' ? 'Попробуйте другой фильтр или запрос' : 'Try adjusting your filters or search'}
                      </p>
                    </>
                  ) : (
                    // Truly empty — no items exist yet
                    <>
                      <p className="text-gray-500 font-semibold mb-1">
                        {lang === 'uz' ? 'Menyu elementlari yo\'q' : lang === 'ru' ? 'Нет позиций меню' : 'No menu items yet'}
                      </p>
                      <p className="text-sm text-gray-400 mb-5">
                        {lang === 'uz' ? 'Birinchi elementni qo\'shing' : lang === 'ru' ? 'Добавьте первую позицию' : 'Add your first item'}
                      </p>
                      {canEditMenu && <OrangeBtn onClick={openNewItem} icon={Plus}>{t(lang, 'addItem')}</OrangeBtn>}
                    </>
                  )}
                </div>
              ) : (() => {
                // Category chips scroll to these grouped sections.
                const showGrouped = true

                // Build category sections for grouped view
                const sections = showGrouped
                  ? realSortedCats
                      .map(cat => ({
                        cat,
                        items: filteredItems.filter(i => i.category_id === cat.id),
                      }))
                      .filter(s => s.items.length > 0)
                  : null

                // Uncategorised items (no matching category)
                const uncategorised = showGrouped
                  ? filteredItems.filter(i => !realSortedCats.some(c => c.id === i.category_id))
                  : []

                const DragGhost = () => activeItem ? (
                  <div className="bg-white rounded-2xl border-2 border-[#ff5a00]/40 shadow-2xl opacity-95 w-44 rotate-2">
                    <SafeMenuImage
                      src={activeItem.image_url}
                      className="aspect-square w-full rounded-t-2xl object-cover object-center"
                      fallbackClassName="aspect-square w-full rounded-t-2xl"
                      iconSize={24}
                    />
                    <div className="p-2.5">
                      <p className="font-black text-gray-900 text-[12px] truncate">{getItemName(activeItem, lang)}</p>
                      <MenuPrice item={activeItem} size="sm" />
                      {gramsLabel(activeItem, lang) && (
                        <p className="text-[#64748B] font-black text-[10px]">{gramsLabel(activeItem, lang)}</p>
                      )}
                      {millilitresLabel(activeItem, lang) && (
                        <p className="text-[#64748B] font-black text-[10px]">{millilitresLabel(activeItem, lang)}</p>
                      )}
                      {kcalLabel(activeItem, lang) && (
                        <p className="text-[#64748B] font-black text-[10px]">{kcalLabel(activeItem, lang)}</p>
                      )}
                    </div>
                  </div>
                ) : null

                return (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithinOrClosestCenter}
                    onDragStart={e => setActiveId(e.active.id)}
                    onDragEnd={handleItemDragEnd}
                    onDragCancel={() => setActiveId(null)}
                  >
                    <SortableContext
                      items={filteredItems.map(i => i.id)}
                      strategy={gridView ? rectSortingStrategy : verticalListSortingStrategy}
                    >
                      {showGrouped ? (
                        // ── Grouped by category ──────────────────────────────
                        <div className="space-y-8">
                          {sections.map(({ cat, items: catItems }) => (
                            <div
                              key={cat.id}
                              id={menuCategorySectionId('admin-menu-category', cat.id)}
                              className="scroll-mt-24"
                            >
                              {/* Section header */}
                              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                                {cat.image_url && (
                                  <img src={cat.image_url} alt="" className="h-7 w-7 flex-shrink-0 rounded-lg object-cover object-center" />
                                )}
                                <h3 className="text-xl font-black uppercase tracking-tight text-[#1F2937]">
                                  {getCategoryName(cat, lang)}
                                </h3>
                                <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-bold text-[#6B7280]">
                                  {catItems.length}
                                </span>
                                {cat.hidden && (
                                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700 ring-1 ring-blue-200">
                                    {hiddenFromPublicMenuLabel(lang)}
                                  </span>
                                )}
                                {cat.waiter_hidden && (
                                  <span className="rounded-full bg-purple-50 px-2 py-1 text-[10px] font-black text-purple-700 ring-1 ring-purple-200">
                                    {hiddenFromWaiterMenuLabel(lang)}
                                  </span>
                                )}
                              </div>

                              {gridView ? (
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                                  {catItems.map(item => (
                                    <SortableItemCard
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={deleteItem}
                                      onToggleVisibility={toggleItemVisibility}
                                      visibilityPending={savingItemId === item.id}
                                      categories={realSortedCats}
                                      readOnly={!canEditMenu}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                  {catItems.map(item => (
                                    <SortableItemRow
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={deleteItem}
                                      onToggleVisibility={toggleItemVisibility}
                                      visibilityPending={savingItemId === item.id}
                                      categories={realSortedCats}
                                      readOnly={!canEditMenu}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Uncategorised items (edge case) */}
                          {uncategorised.length > 0 && (
                            <div>
                              <div className="flex items-center gap-3 mb-3">
                                <h3 className="text-xl font-black uppercase tracking-tight text-[#1F2937]">
                                  {lang === 'uz' ? 'Kategoriyasiz' : lang === 'ru' ? 'Без категории' : 'Uncategorised'}
                                </h3>
                                <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-bold text-[#6B7280]">
                                  {uncategorised.length}
                                </span>
                              </div>
                              {gridView ? (
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                                  {uncategorised.map(item => (
                                    <SortableItemCard
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={deleteItem}
                                      onToggleVisibility={toggleItemVisibility}
                                      visibilityPending={savingItemId === item.id}
                                      categories={realSortedCats}
                                      readOnly={!canEditMenu}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                  {uncategorised.map(item => (
                                    <SortableItemRow
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={deleteItem}
                                      onToggleVisibility={toggleItemVisibility}
                                      visibilityPending={savingItemId === item.id}
                                      categories={realSortedCats}
                                      readOnly={!canEditMenu}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        // ── Flat grid (specific category or active filter) ────
                        gridView ? (
                          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                            {filteredItems.map(item => (
                              <SortableItemCard
                                key={item.id}
                                item={item}
                                lang={lang}
                                onEdit={openEditItem}
                                onDelete={deleteItem}
                                onToggleVisibility={toggleItemVisibility}
                                visibilityPending={savingItemId === item.id}
                                categories={realSortedCats}
                                readOnly={!canEditMenu}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                            {filteredItems.map(item => (
                              <SortableItemRow
                                key={item.id}
                                item={item}
                                lang={lang}
                                onEdit={openEditItem}
                                onDelete={deleteItem}
                                onToggleVisibility={toggleItemVisibility}
                                visibilityPending={savingItemId === item.id}
                                categories={realSortedCats}
                                readOnly={!canEditMenu}
                              />
                            ))}
                          </div>
                        )
                      )}
                    </SortableContext>

                    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                      <DragGhost />
                    </DragOverlay>
                  </DndContext>
                )
              })()}

              {filteredItems.length > 0 && (
                <p className="text-xs text-gray-400 text-center mt-4">
                  {lang === 'uz' ? `${filteredItems.length} ta element` :
                   lang === 'ru' ? `Итого: ${filteredItems.length} позиций` :
                   `Total ${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''}`}
                </p>
              )}
            </>
          )}

          {/* ══ Categories tab ═══════════════════════════════════════════════ */}
          {tab === 'categories' && (
            <>
              {canEditMenu && (
                <div className="flex justify-end mb-5">
                  <OrangeBtn onClick={openNewCat} icon={Plus}>{t(lang, 'addCategory')}</OrangeBtn>
                </div>
              )}

              {realSortedCats.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl py-20 text-center shadow-sm">
                  <FolderOpen size={40} className="mx-auto mb-3 text-gray-200" />
                  <p className="text-gray-500 font-semibold mb-1">
                    {lang === 'uz' ? 'Kategoriyalar yo\'q' : lang === 'ru' ? 'Нет категорий' : 'No categories yet'}
                  </p>
                  <p className="text-sm text-gray-400 mb-5">
                    {lang === 'uz' ? 'Birinchi kategoriyani qo\'shing' :
                     lang === 'ru' ? 'Добавьте первую категорию' : 'Add your first category'}
                  </p>
                  {canEditMenu && <OrangeBtn onClick={openNewCat} icon={Plus}>{t(lang, 'addCategory')}</OrangeBtn>}
                </div>
              ) : (
                <>
                  {canEditMenu && <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                    <GripVertical size={12} />
                    {lang === 'uz' ? 'Tartiblash uchun sudrang' : lang === 'ru' ? 'Перетащите для сортировки' : 'Drag to reorder'}
                  </p>}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithinOrClosestCenter}
                    onDragStart={e => setActiveId(e.active.id)}
                    onDragEnd={handleCatDragEnd}
                    onDragCancel={() => setActiveId(null)}
                  >
                    <SortableContext
                      items={realSortedCats.map(c => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                        {/* Header uses the exact same edit/read-only grid as its rows. */}
                        <div className={`${canEditMenu ? CAT_EDIT_GRID : CAT_READ_ONLY_GRID} py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wide`}>
                          {canEditMenu && <span />}
                          <span />
                          <span>{lang === 'uz' ? 'Nomi' : lang === 'ru' ? 'Название' : 'Name'}</span>
                          <span>{lang === 'uz' ? 'Ommaviy menyu' : lang === 'ru' ? 'Публичное меню' : 'Public menu'}</span>
                          <span className="text-center">{lang === 'uz' ? 'Tartib' : lang === 'ru' ? 'Порядок' : 'Sort Order'}</span>
                          {canEditMenu && <span className="text-right">{lang === 'uz' ? 'Amallar' : lang === 'ru' ? 'Действия' : 'Actions'}</span>}
                        </div>

                        {realSortedCats.map((cat, idx) => (
                          <SortableCatRow
                            key={cat.id}
                            cat={cat}
                            lang={lang}
                            itemCount={itemCountByCat[cat.id] || 0}
                            onEdit={openEditCat}
                            onDelete={deleteCat}
                            onToggleVisibility={toggleCategoryVisibility}
                            visibilityPending={savingCatId === cat.id}
                            sortIndex={idx + 1}
                            readOnly={!canEditMenu}
                          />
                        ))}

                        {/* Footer */}
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
                          {lang === 'uz' ? `Jami ${realSortedCats.length} ta kategoriya` :
                           lang === 'ru' ? `Всего категорий: ${realSortedCats.length}` :
                           `Total ${realSortedCats.length} categor${realSortedCats.length !== 1 ? 'ies' : 'y'}`}
                        </div>
                      </div>
                    </SortableContext>

                    {/* Drag overlay ghost */}
                    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                      {activeCat && (
                        <div className="bg-white border-2 border-[#ff5a00]/40 rounded-2xl shadow-2xl flex items-center gap-4 px-5 py-4 opacity-95">
                          {activeCat.image_url ? (
                            <img src={activeCat.image_url} alt="" className="h-12 w-12 flex-shrink-0 rounded-xl object-cover object-center" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                              <Tag size={18} className="text-orange-300" />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{getCategoryName(activeCat, lang)}</p>
                            <p className="text-xs text-gray-400">{itemCountByCat[activeCat.id] || 0} items</p>
                          </div>
                        </div>
                      )}
                    </DragOverlay>
                  </DndContext>
                </>
              )}
            </>
          )}

          {/* ══ Quick Items tab ═════════════════════════════════════════════ */}
          {tab === 'quick_items' && (
            <>
              <div className="mb-5 flex flex-col gap-3 rounded-[28px] border border-[#E5E7EB] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-black text-[#1F2937]">
                    {lang === 'uz' ? 'Kassadagi tezkor mahsulotlar' : lang === 'ru' ? 'Быстрые товары у кассы' : 'Cashier Quick Items'}
                  </h2>
                  <p className="mt-1 text-sm text-gray-400">
                    {lang === 'uz'
                      ? 'Bu mahsulotlar faqat kassir to‘lov ekranida ko‘rinadi.'
                      : lang === 'ru'
                        ? 'Эти товары видны только на экране оплаты кассира.'
                        : 'These items appear only on the cashier payment screen.'}
                  </p>
                </div>
                {canEditMenu && (
                  <OrangeBtn onClick={openNewQuickItem} icon={Plus}>
                    {lang === 'uz' ? 'Tezkor mahsulot qo‘shish' : lang === 'ru' ? 'Добавить быстрый товар' : 'Add Quick Item'}
                  </OrangeBtn>
                )}
              </div>

              {quickItems.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl py-20 text-center shadow-sm">
                  <Tag size={40} className="mx-auto mb-3 text-gray-200" />
                  <p className="text-gray-500 font-semibold mb-1">
                    {lang === 'uz' ? 'Tezkor mahsulotlar yo‘q' : lang === 'ru' ? 'Быстрых товаров пока нет' : 'No quick items yet'}
                  </p>
                  <p className="text-sm text-gray-400 mb-5">
                    {lang === 'uz'
                      ? 'Kassada tez qo‘shiladigan mahsulot yarating.'
                      : lang === 'ru'
                        ? 'Создайте товар, который кассир сможет быстро добавить.'
                        : 'Create items cashiers can add quickly at checkout.'}
                  </p>
                  {canEditMenu && (
                    <OrangeBtn onClick={openNewQuickItem} icon={Plus}>
                      {lang === 'uz' ? 'Tezkor mahsulot qo‘shish' : lang === 'ru' ? 'Добавить быстрый товар' : 'Add Quick Item'}
                    </OrangeBtn>
                  )}
                </div>
              ) : (
                <>
                  {canEditMenu && <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                    <GripVertical size={12} />
                    {lang === 'uz' ? 'Tartiblash uchun sudrang' : lang === 'ru' ? 'Перетащите для сортировки' : 'Drag to reorder'}
                  </p>}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={pointerWithinOrClosestCenter}
                    onDragStart={e => setActiveId(e.active.id)}
                    onDragEnd={handleQuickItemDragEnd}
                    onDragCancel={() => setActiveId(null)}
                  >
                    <SortableContext
                      items={quickItems.map(i => i.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                        {quickItems.map(item => (
                          <SortableItemCard
                            key={item.id}
                            item={item}
                            lang={lang}
                            onEdit={openEditItem}
                            onDelete={deleteItem}
                            onToggleVisibility={toggleItemVisibility}
                            visibilityPending={savingItemId === item.id}
                            categories={realSortedCats}
                            readOnly={!canEditMenu}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                      {activeItem && (
                        <div className="bg-white rounded-2xl border-2 border-[#ff5a00]/40 shadow-2xl opacity-95 w-44 rotate-2">
                          <SafeMenuImage
                            src={activeItem.image_url}
                            className="aspect-square w-full rounded-t-2xl object-cover object-center"
                            fallbackClassName="aspect-square w-full rounded-t-2xl"
                            iconSize={24}
                          />
                          <div className="p-2.5">
                            <p className="font-black text-gray-900 text-[12px] truncate">{getItemName(activeItem, lang)}</p>
                            <MenuPrice item={activeItem} size="sm" />
                          </div>
                        </div>
                      )}
                    </DragOverlay>
                  </DndContext>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Item modal ──────────────────────────────────────────────────────── */}
      {itemModal && (
        <Modal title={itemModal === 'new' ? t(lang, 'addItem') : t(lang, 'editItem')} onClose={closeItemModal} closeDisabled={savingItemForm}>
          <div className="space-y-3">
            {menuNotice && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {menuNotice.message}
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1.5">{t(lang, 'category')}</label>
              <select
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
              >
                <option value="">— {t(lang, 'category')} —</option>
                {realSortedCats.map(c => (
                  <option key={c.id} value={c.id}>{getCategoryName(c, lang)}</option>
                ))}
              </select>
            </div>
            <Field label={t(lang, 'nameUz')} value={form.name_uz} onChange={setF('name_uz')} onBlur={trimF('name_uz')} />
            <Field label={t(lang, 'nameRu')} value={form.name_ru} onChange={setF('name_ru')} onBlur={trimF('name_ru')} />
            <Field label={t(lang, 'nameEn')} value={form.name_en} onChange={setF('name_en')} onBlur={trimF('name_en')} />
            <div className="rounded-xl border border-[#C7D2FE] bg-[#EEF2FF] px-3 py-2.5">
              <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-[#818CF8]">
                {lang === 'uz' ? 'Tashqi ID' : lang === 'ru' ? 'Внешний ID' : 'External ID'}
              </p>
              <p className="font-black text-[#4F46E5]">{form.external_id || '—'}</p>
            </div>
            <DescriptionField label={t(lang, 'descUz')} value={form.description_uz} onChange={setF('description_uz')} onBlur={trimF('description_uz')} lang={lang} />
            <DescriptionField label={t(lang, 'descRu')} value={form.description_ru} onChange={setF('description_ru')} onBlur={trimF('description_ru')} lang={lang} />
            <DescriptionField label={t(lang, 'descEn')} value={form.description_en} onChange={setF('description_en')} onBlur={trimF('description_en')} lang={lang} />
            <OptionGroupsEditor
              value={form.option_groups_editor}
              onChange={optionGroups => setForm(current => ({ ...current, option_groups_editor: optionGroups }))}
              lang={lang}
              parentCost={form.cost_price}
            />
            <PricingFields form={form} setF={setF} lang={lang} compact costRequired={itemModal === 'new'} />
            <SaleUnitField value={form.sale_unit} onChange={setF('sale_unit')} lang={lang} />
            <Field label={`${t(lang, 'gramsLabel')} (${t(lang, 'grams')})`} type="number" value={form.grams} onChange={setF('grams')} placeholder="250" />
            <Field label={`${t(lang, 'millilitresLabel')} (${t(lang, 'millilitres')})`} type="number" value={form.millilitres} onChange={setF('millilitres')} placeholder="500" />
            <Field label={`${t(lang, 'kcalLabel')} (${t(lang, 'kcal')})`} type="number" value={form.kcal} onChange={setF('kcal')} placeholder="420" />
            <Field
              label={lang === 'uz' ? 'Tokchadagi soni' : lang === 'ru' ? 'Количество на полке' : 'Shelf count'}
              type="number"
              value={form.stock_count}
              onChange={setF('stock_count')}
              placeholder="24"
            />
            <MediaGalleryField
              label={t(lang, 'mediaUrl')}
              values={form.media_urls}
              onChange={mediaUrls => setForm(current => ({
                ...current,
                image_url: mediaUrls[0] || '',
                media_urls: mediaUrls,
              }))}
              onUploadComplete={upload => handleTrackedUpload(uploadedItemImageUrlsRef, upload)}
              lang={lang}
              entityId={form.id}
            />
            <Field label={t(lang, 'sortOrder')} type="number" value={form.sort_order} onChange={setF('sort_order')} placeholder="1" />
            <Field
              label={lang === 'uz' ? 'Tezkor mahsulot tartibi' : lang === 'ru' ? 'Порядок быстрого товара' : 'Quick item order'}
              type="number"
              value={form.quick_item_sort_order}
              onChange={setF('quick_item_sort_order')}
              placeholder="1"
            />
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-gray-500">{scheduleLabels.section}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={scheduleLabels.from} type="time" value={form.visible_from_time || ''} onChange={setF('visible_from_time')} />
                <Field label={scheduleLabels.until} type="time" value={form.visible_until_time || ''} onChange={setF('visible_until_time')} />
              </div>
              <p className="mt-2 text-[11px] font-semibold text-gray-400">{scheduleLabels.hint}</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="avail"
                type="checkbox"
                checked={form.available}
                onChange={e => setForm(f => ({ ...f, available: e.target.checked }))}
                disabled={savingItemForm}
                className="accent-[#ff5a00] w-4 h-4 disabled:cursor-wait"
              />
              <label htmlFor="avail" className="text-sm text-gray-700 font-medium">{t(lang, 'available_item')}</label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="cashierQuick"
                type="checkbox"
                checked={!!form.show_in_cashier_quick_items}
                onChange={e => setForm(f => ({ ...f, show_in_cashier_quick_items: e.target.checked }))}
                disabled={savingItemForm}
                className="accent-[#ff5a00] w-4 h-4 disabled:cursor-wait"
              />
              <label htmlFor="cashierQuick" className="text-sm text-gray-700 font-medium">
                {lang === 'uz' ? 'Kassir tezkor mahsulotlarida ko‘rsatish' : lang === 'ru' ? 'Показывать в быстрых товарах кассира' : 'Show in cashier quick items'}
              </label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="publicHidden"
                type="checkbox"
                checked={!!form.public_hidden}
                onChange={e => setForm(f => ({ ...f, public_hidden: e.target.checked }))}
                disabled={savingItemForm}
                className="accent-[#ff5a00] w-4 h-4 disabled:cursor-wait"
              />
              <label htmlFor="publicHidden" className="text-sm text-gray-700 font-medium">
                {lang === 'uz' ? 'Ommaviy menyudan yashirish' : lang === 'ru' ? 'Скрыть из публичного меню' : 'Hide from public menu'}
              </label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="waiterHidden"
                type="checkbox"
                checked={!!form.waiter_hidden}
                onChange={e => setForm(f => ({ ...f, waiter_hidden: e.target.checked }))}
                disabled={savingItemForm}
                className="accent-[#ff5a00] w-4 h-4 disabled:cursor-wait"
              />
              <label htmlFor="waiterHidden" className="text-sm text-gray-700 font-medium">
                {lang === 'uz' ? 'Ofitsiant menyusidan yashirish' : lang === 'ru' ? 'Скрыть из меню официанта' : 'Hide from waiter menu'}
              </label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="cashierOnly"
                type="checkbox"
                checked={!!form.cashier_only}
                onChange={e => setForm(f => ({ ...f, cashier_only: e.target.checked }))}
                disabled={savingItemForm}
                className="accent-[#ff5a00] w-4 h-4 disabled:cursor-wait"
              />
              <label htmlFor="cashierOnly" className="text-sm text-gray-700 font-medium">
                {lang === 'uz' ? 'Faqat kassirda ko‘rsatish' : lang === 'ru' ? 'Только для кассира' : 'Cashier only'}
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={closeItemModal} disabled={savingItemForm} className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:cursor-wait disabled:opacity-50">
                {t(lang, 'cancel')}
              </button>
              <button onClick={saveItem} disabled={!canSaveItemForm} className="flex-1 inline-flex items-center justify-center gap-2 bg-[#ff5a00] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none">
                {savingItemForm && <Loader2 size={15} className="animate-spin" />}
                {savingItemForm ? savingLabel(lang) : t(lang, 'save')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Category modal ──────────────────────────────────────────────────── */}
      {catModal && (
        <Modal
          title={catModal === 'new' ? t(lang, 'addCategory') : (lang === 'uz' ? 'Kategoriyani tahrirlash' : lang === 'ru' ? 'Редактировать категорию' : 'Edit Category')}
          onClose={closeCatModal}
          closeDisabled={savingCatForm}
        >
          <div className="space-y-3">
            {menuNotice && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {menuNotice.message}
              </div>
            )}
            <Field label={t(lang, 'nameUz')} value={catForm.name_uz} onChange={setCF('name_uz')} />
            <Field label={t(lang, 'nameRu')} value={catForm.name_ru} onChange={setCF('name_ru')} />
            <Field label={t(lang, 'nameEn')} value={catForm.name_en} onChange={setCF('name_en')} />
            <ImageUploadField
              label={t(lang, 'imageUrl')}
              value={catForm.image_url}
              onChange={setCF('image_url')}
              onUploadComplete={upload => handleTrackedUpload(uploadedCatImageUrlsRef, upload)}
              lang={lang}
              type="category"
              entityId={catForm.id}
            />
            <Field label={t(lang, 'sortOrder')} type="number" value={catForm.sort_order} onChange={setCF('sort_order')} placeholder="1" />
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-gray-500">{scheduleLabels.section}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={scheduleLabels.from} type="time" value={catForm.visible_from_time || ''} onChange={setCF('visible_from_time')} />
                <Field label={scheduleLabels.until} type="time" value={catForm.visible_until_time || ''} onChange={setCF('visible_until_time')} />
              </div>
              <p className="mt-2 text-[11px] font-semibold text-gray-400">{scheduleLabels.hint}</p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="categoryHidden"
                type="checkbox"
                checked={!!catForm.hidden}
                onChange={e => setCatForm(f => ({ ...f, hidden: e.target.checked }))}
                disabled={savingCatForm}
                className="accent-[#ff5a00] w-4 h-4 disabled:cursor-wait"
              />
              <label htmlFor="categoryHidden" className="text-sm text-gray-700 font-medium">
                {lang === 'uz' ? 'Ommaviy menyudan yashirish' : lang === 'ru' ? 'Скрыть из публичного меню' : 'Hide from public menu'}
              </label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="categoryWaiterHidden"
                type="checkbox"
                checked={!!catForm.waiter_hidden}
                onChange={e => setCatForm(f => ({ ...f, waiter_hidden: e.target.checked }))}
                disabled={savingCatForm}
                className="accent-[#ff5a00] w-4 h-4 disabled:cursor-wait"
              />
              <label htmlFor="categoryWaiterHidden" className="text-sm text-gray-700 font-medium">
                {lang === 'uz' ? 'Ofitsiant menyusidan yashirish' : lang === 'ru' ? 'Скрыть из меню официанта' : 'Hide from waiter menu'}
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={closeCatModal} disabled={savingCatForm} className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors disabled:cursor-wait disabled:opacity-50">
                {t(lang, 'cancel')}
              </button>
              <button onClick={saveCat} disabled={savingCatForm} className="flex-1 inline-flex items-center justify-center gap-2 bg-[#ff5a00] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200 disabled:cursor-wait disabled:bg-gray-300 disabled:shadow-none">
                {savingCatForm && <Loader2 size={15} className="animate-spin" />}
                {savingCatForm ? savingLabel(lang) : t(lang, 'save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  )
}
