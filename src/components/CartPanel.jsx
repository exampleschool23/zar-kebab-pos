import React, { useEffect, useMemo, useState } from 'react'
import { X, ShoppingCart, Minus, Plus, Trash2, UtensilsCrossed, Loader2, CheckCircle2 } from 'lucide-react'
import { useApp } from '../store/AppContext'
import { t, getItemDesc, getItemName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import { getOrderPaymentSummary } from '../lib/analytics'
import { gramsLabel, kcalLabel, millilitresLabel } from '../lib/nutrition'
import { ORDER_TYPE_LABELS, isOffPremiseOrderType, orderTypeLabel } from '../lib/orderTypes'
import { DEFAULT_PRICE_MODE, getPriceModeLabel, normalizePriceMode } from '../lib/priceModes'
import { isWriteTimeoutError } from '../lib/writeTimeout'
import { isMenuItemOrderable } from '../lib/menuItems'
import { getConfiguredServiceRatePct } from '../lib/serviceRates'
import { getManualOrderNotes, getOrderItemOptionLines } from './MenuProductCards'
import {
  changeMenuQuantity,
  formatMenuQuantity,
  isMenuItemSoldByWeight,
  menuQuantityStep,
  normalizeMenuQuantity,
} from '../lib/menuSaleUnits'

const ORDER_TYPES = [
  { key: 'dine_in', ...ORDER_TYPE_LABELS.dine_in },
  { key: 'take_away', ...ORDER_TYPE_LABELS.take_away },
  { key: 'delivery', ...ORDER_TYPE_LABELS.delivery },
]

function submitErrorMessage(lang, error) {
  if (isWriteTimeoutError(error)) {
    if (lang === 'uz') return 'Saqlash juda uzoq davom etdi. Ulanishni tekshirib, qayta urinib ko‘ring.'
    if (lang === 'ru') return 'Сохранение заняло слишком много времени. Проверьте подключение и попробуйте снова.'
    return 'Saving took too long. Check the connection and try again.'
  }

  if (lang === 'uz') return 'Buyurtmani yuborib bo‘lmadi.'
  if (lang === 'ru') return 'Не удалось отправить заказ.'
  return 'Could not submit the order.'
}

// ── Cart item row ──────────────────────────────────────────────────────────────
function getCartItemKey(item) {
  return item?.cart_item_key || item?.cartItemKey || item?.menu_item_id
}

function CartItemRow({ item, lang, dispatch, menuItem }) {
  const desc = menuItem ? getItemDesc(menuItem, lang) : null
  const grams = gramsLabel(menuItem, lang)
  const millilitres = millilitresLabel(menuItem, lang)
  const kcal = kcalLabel(menuItem, lang)
  const cartItemKey = getCartItemKey(item)
  const optionLines = getOrderItemOptionLines(item, menuItem, lang)
  const notesValue = getManualOrderNotes(item, menuItem, lang)
  const displayName = menuItem ? getItemName(menuItem, lang) : item.name
  const quantitySource = { ...menuItem, sale_unit: item.sale_unit || menuItem?.sale_unit }
  const soldByWeight = isMenuItemSoldByWeight(quantitySource)
  const unavailable = !isMenuItemOrderable(menuItem)
  const unavailableLabel = lang === 'uz' ? 'Mavjud emas' : lang === 'ru' ? 'Недоступно' : 'Unavailable'

  function decrement() {
    const qty = changeMenuQuantity(item.quantity, quantitySource, -1)
    if (qty <= 0) dispatch({ type: 'REMOVE_FROM_CART', payload: cartItemKey })
    else dispatch({ type: 'UPDATE_CART_QTY', payload: { cart_item_key: cartItemKey, qty } })
  }

  function increment() {
    dispatch({ type: 'UPDATE_CART_QTY', payload: { cart_item_key: cartItemKey, qty: changeMenuQuantity(item.quantity, quantitySource, 1) } })
  }

  return (
    <div className="flex gap-3 py-4 border-b border-[#F3F4F6] last:border-0">
      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-orange-50 border border-[#F3F4F6]">
        {menuItem?.image_url ? (
          <img src={menuItem.image_url} alt="" className={`h-full w-full object-cover ${unavailable ? 'grayscale opacity-55' : ''}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <UtensilsCrossed size={16} className="text-orange-300" />
          </div>
        )}
      </div>

      {/* Info + controls */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <p className="font-bold text-[14px] text-[#1F2937] leading-snug line-clamp-1 flex-1 min-w-0">
            {displayName}
          </p>
          <button
            onClick={() => dispatch({ type: 'REMOVE_FROM_CART', payload: cartItemKey })}
            className="p-1.5 rounded-xl hover:bg-red-50 text-[#D1D5DB] hover:text-red-400 transition-colors flex-shrink-0"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {unavailable && (
          <p className="mb-1.5 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-gray-600 ring-1 ring-gray-200">
            {unavailableLabel}
          </p>
        )}

        {desc && <p className="text-[12px] text-[#9CA3AF] line-clamp-1 mb-1.5">{desc}</p>}
        {optionLines.map((line, index) => (
          <p key={`${cartItemKey}-option-${index}`} className="mb-0.5 text-[12px] font-black text-[#111827]">
            {line}
          </p>
        ))}
        {(grams || millilitres || kcal) && (
          <div className="mb-2 flex flex-wrap gap-1">
            {grams && (
              <span className="inline-flex rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {grams}
              </span>
            )}
            {millilitres && (
              <span className="inline-flex rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {millilitres}
              </span>
            )}
            {kcal && (
              <span className="inline-flex rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-black text-[#64748B] ring-1 ring-[#E5E7EB]">
                {kcal}
              </span>
            )}
          </div>
        )}

        {/* Qty stepper + price */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2 bg-[#F9FAFB] rounded-xl p-1 border border-[#F3F4F6]">
            <button
              onClick={decrement}
              className="w-9 h-9 rounded-lg bg-white border border-[#E5E7EB] flex items-center justify-center hover:bg-red-50 hover:border-red-200 active:scale-90 transition-all shadow-sm"
            >
              <Minus size={13} className="text-[#6B7280]" />
            </button>
            {soldByWeight ? (
              <label className="flex min-w-[84px] items-center justify-center gap-1">
                <input
                  type="number"
                  min={menuQuantityStep(quantitySource)}
                  step={menuQuantityStep(quantitySource)}
                  value={item.quantity}
                  disabled={unavailable}
                  onChange={event => dispatch({
                    type: 'UPDATE_CART_QTY',
                    payload: { cart_item_key: cartItemKey, qty: normalizeMenuQuantity(event.target.value, quantitySource) },
                  })}
                  className="w-14 bg-transparent text-center text-[17px] font-black leading-none text-[#1F2937] tabular-nums outline-none disabled:cursor-not-allowed disabled:text-[#9CA3AF]"
                  aria-label={lang === 'ru' ? 'Вес (кг)' : lang === 'uz' ? 'Og‘irligi (kg)' : 'Weight (kg)'}
                />
                <span className="text-[11px] font-black text-[#64748B]">kg</span>
              </label>
            ) : (
              <span className="min-w-[22px] text-center text-[17px] font-black leading-none text-[#1F2937]">
                {formatMenuQuantity(item.quantity, quantitySource)}
              </span>
            )}
            <button
              onClick={increment}
              disabled={unavailable}
              className="w-9 h-9 rounded-lg bg-[#ff5a00] flex items-center justify-center hover:bg-[#cc4800] active:scale-90 transition-all shadow-sm disabled:cursor-not-allowed disabled:bg-[#9CA3AF] disabled:shadow-none"
            >
              <Plus size={13} className="text-white" />
            </button>
          </div>
          <span className="font-black text-[15px] text-[#ff5a00]">
            {formatCurrency(item.price * item.quantity)}
          </span>
        </div>

        {/* Order note */}
        <input
          type="text"
          placeholder={t(lang, 'notes') || (lang === 'uz' ? 'Izoh...' : lang === 'ru' ? 'Заметка...' : 'Notes (optional)')}
          value={notesValue}
          onChange={e => dispatch({ type: 'UPDATE_CART_NOTES', payload: { cart_item_key: cartItemKey, notes: e.target.value } })}
          className="mt-2 w-full text-[12px] border border-[#E5E7EB] rounded-xl px-3 py-2 focus:outline-none focus:border-[#ff5a00]/50 focus:ring-1 focus:ring-[#ff5a00]/20 bg-white placeholder-[#9CA3AF] transition-colors"
        />
      </div>
    </div>
  )
}

// ── Cart panel ─────────────────────────────────────────────────────────────────
export default function CartPanel({
  tableName,
  orderType,
  onOrderTypeChange,
  onClose,
  priceMode = DEFAULT_PRICE_MODE,
  allowOrderTypeChange = true,
  showOrderBadges = true,
  isSending = false,
  onSendingChange,
  onSubmitSuccess,
  lang: langProp,
  guestMode = false,
  onGuestFinish,
  reviewWarning = '',
  reviewKey = '',
}) {
  const { state, dispatch, pendingKitchenSubmission } = useApp()
  const lang    = langProp || state.lang
  const cart    = state.cart
  const normalizedPriceMode = normalizePriceMode(priceMode)
  const [message, setMessage] = useState(null)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const hasPendingSubmission = !guestMode && !!pendingKitchenSubmission
  const cartIsLocked = isSending || hasPendingSubmission

  useEffect(() => {
    setReviewConfirmed(false)
  }, [reviewWarning, reviewKey])

  const menuItemMap = useMemo(() => {
    const map = {}
    state.menuItems.forEach(i => { map[i.id] = i })
    return map
  }, [state.menuItems])
  const unavailableCartItems = useMemo(
    () => cart.filter(item => {
      const menuItem = menuItemMap[item.menu_item_id]
      return !isMenuItemOrderable(menuItem)
    }),
    [cart, menuItemMap]
  )
  const hasUnavailableCartItems = unavailableCartItems.length > 0
  const unavailableCartMessage = lang === 'uz'
    ? 'Mavjud bo‘lmagan taomlarni savatdan olib tashlang. Ularni buyurtmaga yuborib bo‘lmaydi.'
    : lang === 'ru'
      ? 'Удалите недоступные блюда из корзины. Их нельзя отправить в заказ.'
      : 'Remove unavailable meals from the cart. They cannot be submitted with the order.'

  const configuredServiceRatePct = getConfiguredServiceRatePct(state.settings, normalizedPriceMode)
  const serviceRatePct = isOffPremiseOrderType(orderType) ? 0 : configuredServiceRatePct
  const payment = getOrderPaymentSummary({ order_type: orderType, service_rate_pct: serviceRatePct }, cart, configuredServiceRatePct)
  const subtotal  = payment.subtotal
  const service   = payment.serviceFee
  const total     = payment.total
  const itemCount = cart.length

  async function handleSend() {
    if ((cart.length === 0 && !hasPendingSubmission) || isSending) return
    if (!hasPendingSubmission && reviewWarning && !reviewConfirmed) return
    if (!hasPendingSubmission && hasUnavailableCartItems) {
      setMessage({ tone: 'error', text: unavailableCartMessage })
      return
    }
    setMessage(null)
    onSendingChange?.(true)
    const submittedAt = pendingKitchenSubmission?._submittedAt || new Date().toISOString()
    const kitchenRoundId = pendingKitchenSubmission?._kitchenRoundId || `round-${submittedAt}-${Math.random().toString(36).slice(2, 8)}`
    const submitAction = pendingKitchenSubmission || {
      type: 'SEND_TO_KITCHEN',
      payload: { orderType, priceMode: normalizedPriceMode },
      _kitchenRoundId: kitchenRoundId,
      _submittedAt: submittedAt,
    }
    try {
      const result = await dispatch(submitAction)
      if (result?.error) {
        setMessage({
          tone: 'error',
          text: submitErrorMessage(lang, result.error),
        })
        return
      }
      const completedAction = result?.action || submitAction
      setMessage({
        tone: 'success',
        text: lang === 'uz'
          ? 'Buyurtma yuborildi.'
          : lang === 'ru'
            ? 'Заказ отправлен.'
            : 'Order submitted.',
      })
      onSubmitSuccess?.({
        orderId: completedAction._orderId,
        kitchenRoundId: completedAction._kitchenRoundId || kitchenRoundId,
        submittedAt: completedAction._submittedAt || submittedAt,
        orderType: completedAction.payload?.orderType || orderType,
      })
      onClose?.()
    } finally {
      onSendingChange?.(false)
    }
  }

  return (
    <div className="flex flex-col h-full w-full">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-[#F3F4F6] flex-shrink-0">
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {onClose && (
              <button
                onClick={onClose}
                disabled={cartIsLocked}
                className="p-1.5 rounded-xl hover:bg-gray-100 disabled:cursor-wait disabled:opacity-50 transition-colors flex-shrink-0"
              >
                <X size={16} className="text-[#9CA3AF]" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-black text-[#1F2937] text-[18px] leading-tight">{tableName}</p>
                {showOrderBadges && (
                  <>
                    {orderType && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8FFF0] text-green-700 border border-green-100 flex-shrink-0">
                        {orderTypeLabel(orderType, lang)}
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#ff5a00] border border-orange-100 flex-shrink-0">
                      {getPriceModeLabel(normalizedPriceMode, lang)}
                    </span>
                  </>
                )}
              </div>
              <p className="text-[12px] text-[#9CA3AF] mt-0.5">
                {itemCount > 0
                  ? `${itemCount} ${lang === 'uz' ? 'ta mahsulot' : lang === 'ru' ? 'позиций' : 'items'}`
                  : lang === 'uz' ? "Buyurtma yo'q" : lang === 'ru' ? 'Нет позиций' : 'No items yet'}
              </p>
            </div>
          </div>
        </div>

        {/* Order type tabs */}
        {allowOrderTypeChange && (
          <div className="flex gap-1 bg-[#F3F4F6] p-1 rounded-xl mt-3">
            {ORDER_TYPES.map(ot => (
              <button
                key={ot.key}
                onClick={() => onOrderTypeChange?.(ot.key)}
                disabled={cartIsLocked}
                className={`flex-1 py-1.5 text-[12px] font-bold rounded-lg transition-all ${
                  orderType === ot.key
                    ? 'bg-white text-[#1F2937] shadow-sm'
                    : 'text-[#9CA3AF] hover:text-[#6B7280]'
                }`}
              >
                {ot[lang] || ot.en}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Cart items ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-1">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 select-none">
            <div className="w-16 h-16 bg-[#F9FAFB] rounded-2xl flex items-center justify-center mb-3">
              <ShoppingCart size={26} strokeWidth={1.5} className="text-[#D1D5DB]" />
            </div>
            <p className="text-sm font-semibold text-[#9CA3AF]">
              {lang === 'uz' ? "Savat bo'sh" : lang === 'ru' ? 'Корзина пуста' : 'Cart is empty'}
            </p>
            <p className="text-[12px] text-[#D1D5DB] mt-1">
              {lang === 'uz' ? "Menyudan taom qo'shing" : lang === 'ru' ? 'Добавьте блюда из меню' : 'Add items from the menu'}
            </p>
          </div>
        ) : (
          cart.map(item => (
            <CartItemRow
              key={getCartItemKey(item)}
              item={item}
              lang={lang}
              dispatch={cartIsLocked ? () => {} : dispatch}
              menuItem={menuItemMap[item.menu_item_id]}
            />
          ))
        )}
      </div>

      {/* ── Summary + Send button ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-[#F3F4F6] px-4 pt-4 pb-5">
        {hasPendingSubmission && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold leading-5 text-amber-900">
            {lang === 'uz'
              ? 'Oldingi yuborish natijasi tasdiqlanmadi. Xuddi shu buyurtmani xavfsiz tekshirish uchun qayta urinib ko‘ring.'
              : lang === 'ru'
                ? 'Результат прошлой отправки не подтверждён. Повторите попытку — будет проверен тот же заказ без дублирования.'
                : 'The previous send was not confirmed. Retry safely to check the same order without duplicating it.'}
          </div>
        )}
        {reviewWarning && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-bold leading-5 text-amber-900">
            <p>{reviewWarning}</p>
            <button
              type="button"
              onClick={() => setReviewConfirmed(true)}
              disabled={reviewConfirmed || cartIsLocked}
              className={`mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg px-3 text-[11px] font-black transition-colors ${
                reviewConfirmed
                  ? 'bg-green-100 text-green-800'
                  : 'bg-amber-900 text-white hover:bg-amber-950'
              }`}
            >
              {reviewConfirmed
                ? (lang === 'uz' ? 'Tekshirildi' : lang === 'ru' ? 'Проверено' : 'Reviewed')
                : (lang === 'uz' ? 'Stol va tanlovni tekshirdim' : lang === 'ru' ? 'Я проверил стол и выбор' : 'I reviewed the table and selection')}
            </button>
          </div>
        )}
        {hasUnavailableCartItems && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
            {unavailableCartMessage}
          </div>
        )}
        {message && (
          <div className={`mb-3 rounded-xl px-3 py-2 text-[12px] font-bold ${
            message.tone === 'error'
              ? 'bg-red-50 text-red-700 border border-red-100'
              : 'bg-green-50 text-green-700 border border-green-100'
          }`}>
            {message.text}
          </div>
        )}

        {cart.length > 0 && (
          <div className="space-y-2 mb-4">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#9CA3AF] font-medium">
                {lang === 'uz' ? 'Buyurtma summasi' : lang === 'ru' ? 'Сумма заказа' : 'Order amount'}
              </span>
              <span className="text-[#1F2937] font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#9CA3AF] font-medium">
                {lang === 'uz' ? `Xizmat (${serviceRatePct}%)` : lang === 'ru' ? `Сервис (${serviceRatePct}%)` : `Service (${serviceRatePct}%)`}
              </span>
              <span className="text-[#1F2937] font-semibold">{formatCurrency(service)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-3 border-t border-dashed border-[#E5E7EB]">
              <span className="font-black text-[14px] text-[#1F2937]">
                {lang === 'uz' ? "To'lovga jami" : lang === 'ru' ? 'Итого к оплате' : 'Total to pay'}
              </span>
              <span className="font-black text-[22px] text-[#ff5a00] leading-none">{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        {guestMode && cart.length > 0 && !hasUnavailableCartItems && (
          <p className="mb-3 text-center text-[12px] font-semibold leading-5 text-[#6B7280]">
            {lang === 'uz'
              ? 'Ofitsiant tanlovni tekshiradi va oshxonaga yuboradi.'
              : lang === 'ru'
                ? 'Официант проверит выбор и отправит его на кухню.'
                : 'A waiter will review and send this selection to the kitchen.'}
          </p>
        )}

        <button
          onClick={guestMode ? onGuestFinish : handleSend}
          disabled={isSending || (!hasPendingSubmission && (cart.length === 0 || hasUnavailableCartItems || (!!reviewWarning && !reviewConfirmed)))}
          className={`w-full rounded-xl font-black text-[14px] active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
            hasPendingSubmission && !isSending
              ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-200'
              : cart.length > 0 && !isSending && !hasUnavailableCartItems && (!reviewWarning || reviewConfirmed)
              ? 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-200'
              : cart.length > 0 && isSending
                ? 'bg-[#ff5a00] text-white opacity-80 cursor-wait shadow-lg shadow-orange-200'
                : 'bg-[#F3F4F6] text-[#D1D5DB] cursor-not-allowed'
          }`}
          style={{ height: '52px' }}
        >
          {guestMode
            ? <CheckCircle2 size={17} />
            : isSending ? <Loader2 size={17} className="animate-spin" /> : <UtensilsCrossed size={17} />}
          {guestMode
            ? hasUnavailableCartItems
              ? (lang === 'uz' ? 'Mavjud bo‘lmagan taomni olib tashlang' : lang === 'ru' ? 'Удалите недоступное блюдо' : 'Remove unavailable meal')
              : (lang === 'uz' ? 'Tanlovni yakunlash' : lang === 'ru' ? 'Завершить выбор' : 'Finish selection')
            : reviewWarning && !reviewConfirmed
              ? (lang === 'uz' ? 'Avval tekshiruvni tasdiqlang' : lang === 'ru' ? 'Сначала подтвердите проверку' : 'Confirm the review first')
            : isSending
            ? (lang === 'uz' ? 'Yuborilmoqda...' : lang === 'ru' ? 'Отправка...' : 'Sending...')
            : hasPendingSubmission
              ? (lang === 'uz' ? 'Yuborishni qayta tekshirish' : lang === 'ru' ? 'Повторить отправку' : 'Retry submission')
            : hasUnavailableCartItems
              ? (lang === 'uz' ? 'Mavjud bo‘lmagan taomni olib tashlang' : lang === 'ru' ? 'Удалите недоступное блюдо' : 'Remove unavailable meal')
              : (lang === 'uz' ? 'Buyurtmani yuborish' : lang === 'ru' ? 'Отправить заказ' : 'Submit order')}
        </button>
      </div>
    </div>
  )
}
