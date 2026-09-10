import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { buildIncomeMonthOptions, incomeMonthColors, hideZeroIncomeMonths, loadDashboardWeeklyIncome } from '../lib/weeklyIncome'
import { loadEarliestOrderDate } from '../lib/db'
import { restaurantTodayStr, toRestaurantDateStr } from '../lib/analytics'
import { formatCurrency } from '../lib/formatCurrency'
import { formatMonthYear } from '../lib/dateFormat'

const labels = {
  en: { title: 'Average daily income by 10-day period', sub: 'Latest 20 periods · zero-income months hidden · 1–10 · 11–20 · 21–month end · completed days only, including days without sales', empty: 'No income in this range', month: 'Through month', retry: 'Retry', error: 'Could not load income by period', loading: 'Loading…', days: 'days', total: 'Total', target: 'Daily target' },
  uz: { title: 'Dekadalar bo‘yicha o‘rtacha kunlik daromad', sub: 'Oxirgi 20 davr · daromadsiz oylar yashirilgan · 1–10 · 11–20 · 21–oy oxiri · faqat tugallangan kunlar, savdosiz kunlar ham hisoblanadi', empty: 'Bu davrda daromad yo‘q', month: 'Shu oygacha', retry: 'Qayta urinish', error: 'Dekada daromadini yuklab bo‘lmadi', loading: 'Yuklanmoqda…', days: 'kun', total: 'Jami', target: 'Kunlik maqsad' },
  ru: { title: 'Средний дневной доход по декадам', sub: 'Последние 20 периодов · месяцы без дохода скрыты · 1–10 · 11–20 · 21–конец месяца · только завершённые дни, включая дни без продаж', empty: 'Нет дохода за этот период', month: 'По месяц', retry: 'Повторить', error: 'Не удалось загрузить доход по декадам', loading: 'Загрузка…', days: 'дн.', total: 'Всего', target: 'Дневная цель' },
}

export default function WeeklyIncomeChart({ lang, target = 0 }) {
  const l = labels[lang] || labels.en
  const today = restaurantTodayStr()
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [firstMonth, setFirstMonth] = useState(null)
  const [startFailed, setStartFailed] = useState(false)
  const [result, setResult] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const cache = useRef(new Map())
  const scrollContainer = useRef(null)
  useEffect(() => {
    let cancelled = false
    setStartFailed(false)
    loadEarliestOrderDate().then(date => {
      if (!cancelled) setFirstMonth(date ? toRestaurantDateStr(date).slice(0, 7) : '')
    }).catch(() => { if (!cancelled) setStartFailed(true) })
    return () => { cancelled = true }
  }, [retry])
  const key = month + ':' + today
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    setFailed(false)
    setResult(null)
    if (cache.current.has(key)) {
      setResult({ key, rows: cache.current.get(key) })
      return
    }
    loadDashboardWeeklyIncome(month + '-01', { signal: controller.signal })
      .then(rows => {
        if (cancelled) return
        cache.current.set(key, rows)
        setResult({ key, rows })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; controller.abort() }
  }, [month, key, retry])
  const rows = result?.key === key ? hideZeroIncomeMonths(result.rows) : null
  // Position newly loaded ranges before paint; preserve manual scrolling on other renders.
  useLayoutEffect(() => {
    const container = scrollContainer.current
    if (result?.key === key && container) container.scrollLeft = container.scrollWidth
  }, [result, key])
  const monthGroups = []
  const chartRows = (rows || []).map(row => {
    const monthKey = row.weekStart.slice(0, 7)
    let group = monthGroups[monthGroups.length - 1]
    const startsMonth = group?.key !== monthKey
    if (startsMonth) {
      group = { key: monthKey, count: 0, ...incomeMonthColors(monthKey) }
      monthGroups.push(group)
    }
    group.count += 1
    return { ...row, barColor: group.border, monthStyle: { backgroundColor: group.background, borderLeft: startsMonth ? '2px solid ' + group.border : '2px solid transparent' } }
  })
  const monthOptions = buildIncomeMonthOptions(firstMonth || today.slice(0, 7), today.slice(0, 7))
  const max = Math.max(target * 1.2, ...(rows || []).map(row => row.averageDailyIncome * 1.2), 1)
  return (
    <section aria-busy={!rows && !failed} className="mb-4 min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-[#1F2937]">{l.title}</h3>
          <p className="mt-1 text-xs text-gray-500">{l.sub}</p>
        </div>
        <label className="text-xs font-bold text-gray-600">{l.month}
          <select disabled={firstMonth === null || startFailed} value={month} onChange={event => setMonth(event.target.value)}
            className="ml-2 rounded-lg border border-gray-200 bg-white p-2">
            {monthOptions.map(value => <option key={value} value={value}>{formatMonthYear(value, lang)}</option>)}
          </select>
        </label>
      </div>
      {failed || startFailed ? <div role="alert" className="text-sm text-red-700">{l.error} <button type="button" onClick={() => setRetry(value => value + 1)} className="ml-3 rounded border px-3 py-1">{l.retry}</button></div>
        : !rows ? <p role="status" className="py-16 text-center text-sm text-gray-500">{l.loading}</p>
        : rows.length === 0 ? <p className="py-16 text-center text-sm text-gray-500">{l.empty}</p>
        : <div ref={scrollContainer} className="overflow-x-auto">
          <div style={{ minWidth: rows.length * 90 }}>
            <p className="mb-3 text-sm font-bold text-gray-600">{rows.length > 0 && formatMonthYear(rows[0].weekStart, lang)} – {formatMonthYear(month + '-01', lang)}</p>
            <div className="flex">{monthGroups.map(group => <div key={group.key}
              className="min-w-0 rounded-t-lg border-t-4 py-2 text-center text-xs font-bold text-gray-700"
              style={{ flex: group.count, backgroundColor: group.background, borderColor: group.border }}>
              {formatMonthYear(group.key + '-01', lang)}
            </div>)}</div>
            <div className="relative flex h-48 items-end border-b border-gray-200" role="list" aria-label={l.title}>
              {target > 0 && <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dotted border-red-500" style={{ bottom: (target / max * 100) + '%' }}>
                <span className="absolute bottom-1 right-0 bg-white text-[10px] font-bold text-red-600">{l.target}: {formatCurrency(target)}</span>
              </div>}
              {chartRows.map(row => <div key={row.weekStart} role="listitem" tabIndex={0}
                aria-label={row.weekStart + ' – ' + row.weekEnd + ': ' + formatCurrency(row.averageDailyIncome)}
                title={l.total + ': ' + formatCurrency(row.totalIncome) + ' · ' + row.dayCount + ' ' + l.days}
                className="flex h-full min-w-0 flex-1 items-end px-2" style={row.monthStyle}>
                <div className="w-full rounded-t-lg"
                  style={{ backgroundColor: row.dayCount === 0 ? '#E5E7EB' : row.barColor, height: Math.max(1, row.averageDailyIncome / max * 100) + '%' }} />
              </div>)}
            </div>
            <div className="flex">{chartRows.map(row => <div key={row.weekStart} className="min-w-0 flex-1 px-2 pb-3 pt-2 text-center text-xs text-gray-500" style={row.monthStyle}>
              <p>{Number(row.weekStart.slice(8))}–{Number(row.weekEnd.slice(8))}</p>
              <p className="mt-1 font-bold" style={{ color: row.barColor }}>{row.averageDailyIncome > 0 ? formatCurrency(row.averageDailyIncome) : '—'}</p>
              <p className="mt-1 text-[10px]">{row.dayCount} {l.days}</p>
            </div>)}</div>
          </div>
        </div>}
    </section>
  )
}
