import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { withReadTimeout } from '../lib/writeTimeout'

export default function CashierLoyaltyNameSearch({ lang, onSelect, onSearchChange }) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const labels = lang === 'uz' ? {
    search: 'Karta egasining ismi bo‘yicha qidirish', loading: 'Qidirilmoqda…',
    empty: 'Faol karta topilmadi', failed: 'Qidirib bo‘lmadi. Qayta urinib ko‘ring.',
    retry: 'Qayta urinish', more: 'Ko‘proq natija bor. Ismni aniqroq kiriting.',
  } : lang === 'ru' ? {
    search: 'Поиск по имени владельца карты', loading: 'Поиск…',
    empty: 'Активная карта не найдена', failed: 'Не удалось выполнить поиск. Попробуйте снова.',
    retry: 'Повторить', more: 'Есть ещё результаты. Уточните имя.',
  } : {
    search: 'Search by cardholder name', loading: 'Searching…',
    empty: 'No active cards found', failed: 'Could not search. Please try again.',
    retry: 'Retry', more: 'More matches available. Enter a more specific name.',
  }

  useEffect(() => {
    if (!query.trim()) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        // Escape LIKE wildcards so names are always searched as literal text.
        const name = query.trim().replace(/[\\%_]/g, '\\$&')
        const { data, error } = await withReadTimeout(signal => supabase
          .from('loyalty_cards')
          .select('id, customer_name, card_number')
          .eq('is_active', true)
          .ilike('customer_name', `%${name}%`)
          .order('customer_name')
          .order('card_number')
          .limit(21)
          .abortSignal(signal), 'cashier-loyalty-name-search')
        if (error) throw error
        if (!cancelled) setResult({ query, cards: data || [] })
      } catch {
        if (!cancelled) setResult({ query, error: true })
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, retry])

  const current = result?.query === query ? result : null
  return (
    <div className="mb-3">
      <input
        type="search"
        aria-label={labels.search}
        placeholder={labels.search}
        value={query}
        onChange={event => {
          setQuery(event.target.value)
          setResult(null)
          onSearchChange()
        }}
        className="w-full border-2 border-[#E5E7EB] rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1F2937] focus:outline-none focus:border-[#ff5a00]"
      />
      {query.trim() && (
        <div className="mt-2 rounded-xl border border-[#E5E7EB] overflow-hidden">
          <div role="status" className="text-xs text-[#6B7280]">
            {!current && <p className="p-3">{labels.loading}</p>}
            {current?.error && <p className="p-3">{labels.failed} <button type="button" className="font-bold underline" onClick={() => { setResult(null); setRetry(value => value + 1) }}>{labels.retry}</button></p>}
            {current?.cards?.length === 0 && <p className="p-3">{labels.empty}</p>}
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {current?.cards?.slice(0, 20).map(card => (
              <li key={card.id}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-orange-50 focus:bg-orange-50" onClick={() => {
                  setQuery('')
                  setResult(null)
                  onSelect(card.card_number)
                }}>
                  <span className="font-bold text-[#1F2937]">{card.customer_name}</span>
                  <span className="shrink-0 text-[#6B7280]">{card.card_number}</span>
                </button>
              </li>
            ))}
          </ul>
          {current?.cards?.length > 20 && <p className="p-3 text-xs text-[#6B7280]">{labels.more}</p>}
        </div>
      )}
    </div>
  )
}
