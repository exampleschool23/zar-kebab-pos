import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatLongDate, formatMonthYear } from '../lib/dateFormat'

const CALENDAR_DAY_MS = 86400000

function calendarDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function calendarIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function shiftCalendarMonth(monthKey, amount) {
  const parsed = calendarDate(`${String(monthKey || '').slice(0, 7)}-01`)
  if (!parsed) return String(monthKey || '').slice(0, 7)
  parsed.setUTCMonth(parsed.getUTCMonth() + amount)
  return calendarIso(parsed).slice(0, 7)
}

function buildRangeCalendar(monthKey) {
  const first = calendarDate(`${monthKey}-01`)
  if (!first) return []
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const start = new Date(first.getTime() - mondayOffset * CALENDAR_DAY_MS)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * CALENDAR_DAY_MS)
    const iso = calendarIso(date)
    return { date: iso, day: date.getUTCDate(), inMonth: iso.slice(0, 7) === monthKey }
  })
}

export default function DateRangePicker({ l, lang, rangeKey, dateFrom, dateTo, today, onPreset, onApply }) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(dateFrom.slice(0, 7))
  const [draftFrom, setDraftFrom] = useState(dateFrom)
  const [draftTo, setDraftTo] = useState(dateTo)
  const [selectingEnd, setSelectingEnd] = useState(false)
  const pickerRef = useRef(null)
  const secondMonth = shiftCalendarMonth(visibleMonth, 1)
  const presets = [
    { key: 'today', label: l.today },
    { key: 'previousMonth', label: l.previousMonth },
    { key: 'previousWeek', label: l.previousWeek },
    { key: 'previousCurrentWeek', label: l.previousCurrentWeek },
    { key: 'currentWeek', label: l.currentWeek },
    { key: 'currentNextWeek', label: l.currentNextWeek },
    { key: 'month', label: l.month },
    { key: 'nextWeek', label: l.nextWeek },
    { key: 'nextMonth', label: l.nextMonth },
  ]

  useEffect(() => {
    if (!open) return undefined
    function closeOnOutsideClick(event) {
      if (!pickerRef.current?.contains(event.target)) setOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function togglePicker() {
    if (!open) {
      setDraftFrom(dateFrom)
      setDraftTo(dateTo)
      setVisibleMonth(dateFrom.slice(0, 7))
      setSelectingEnd(false)
    }
    setOpen(current => !current)
  }

  function selectDay(date) {
    if (!selectingEnd) {
      setDraftFrom(date)
      setDraftTo('')
      setSelectingEnd(true)
      return
    }
    setDraftFrom(date < draftFrom ? date : draftFrom)
    setDraftTo(date < draftFrom ? draftFrom : date)
    setSelectingEnd(false)
  }

  function applyDraft() {
    if (!draftFrom) return
    onApply(draftFrom, draftTo || draftFrom)
    setOpen(false)
  }

  function applyPreset(key) {
    onPreset(key)
    setOpen(false)
  }

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={togglePicker}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`grid w-full min-w-0 items-center gap-2 rounded-2xl border bg-[#F9FAFB] p-2 text-left transition-all sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_36px] ${
          open ? 'border-[#ff5a00] bg-white ring-2 ring-[#ff5a00]/10' : 'border-[#E5E7EB] hover:border-orange-200 hover:bg-white'
        }`}
      >
        <span className="min-w-0 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-[#EEF0F3]">
          <span className="block text-[9px] font-black uppercase tracking-wider text-[#9CA3AF]">{l.from}</span>
          <span className="mt-0.5 block truncate text-sm font-black text-[#1F2937]">{formatLongDate(dateFrom, lang, dateFrom)}</span>
        </span>
        <ArrowRight size={14} className="hidden justify-self-center text-[#C3C8D0] sm:block" />
        <span className="min-w-0 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-[#EEF0F3]">
          <span className="block text-[9px] font-black uppercase tracking-wider text-[#9CA3AF]">{l.to}</span>
          <span className="mt-0.5 block truncate text-sm font-black text-[#1F2937]">{formatLongDate(dateTo, lang, dateTo)}</span>
        </span>
        <span className="hidden h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-[#ff5a00] sm:flex">
          <ChevronDown size={17} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div role="dialog" aria-label={l.selectDateRange} className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-h-[min(650px,calc(100vh-140px))] overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-2xl shadow-slate-900/15 sm:p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_210px]">
            <MonthCalendar
              l={l}
              lang={lang}
              monthKey={visibleMonth}
              draftFrom={draftFrom}
              draftTo={draftTo}
              today={today}
              onSelect={selectDay}
              onPrevious={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, -1))}
              onNext={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, 1))}
              showPrevious
              showMobileNext
            />
            <div className="hidden md:block">
              <MonthCalendar
                l={l}
                lang={lang}
                monthKey={secondMonth}
                draftFrom={draftFrom}
                draftTo={draftTo}
                today={today}
                onSelect={selectDay}
                onNext={() => setVisibleMonth(shiftCalendarMonth(visibleMonth, 1))}
                showNext
              />
            </div>
            <aside className="border-t border-[#EEF0F3] pt-3 md:col-span-2 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#9CA3AF]">{l.presets}</p>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
                {presets.map(preset => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset.key)}
                    aria-current={rangeKey === preset.key ? 'true' : undefined}
                    className={`rounded-lg px-2.5 py-2 text-left text-xs font-bold transition-colors ${
                      rangeKey === preset.key ? 'bg-orange-50 text-[#ff5a00]' : 'text-[#4B5563] hover:bg-[#F8F9FB] hover:text-[#ff5a00]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </aside>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-[#EEF0F3] pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-xs font-bold text-[#6B7280]">
              {draftFrom ? formatLongDate(draftFrom, lang, draftFrom) : '—'}
              <span className="mx-2 text-[#C3C8D0]">→</span>
              {draftTo ? formatLongDate(draftTo, lang, draftTo) : '…'}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="h-10 flex-1 rounded-xl border border-[#E5E7EB] px-4 text-xs font-black text-[#6B7280] hover:bg-gray-50 sm:flex-none">
                {l.cancel}
              </button>
              <button type="button" disabled={!draftFrom} onClick={applyDraft} className="h-10 flex-1 rounded-xl bg-[#ff5a00] px-4 text-xs font-black text-white shadow-sm shadow-orange-200 hover:bg-[#e95100] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:shadow-none sm:flex-none">
                {l.applyRange}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MonthCalendar({
  l,
  lang,
  monthKey,
  draftFrom,
  draftTo,
  today,
  onSelect,
  onPrevious,
  onNext,
  showPrevious = false,
  showNext = false,
  showMobileNext = false,
}) {
  const days = buildRangeCalendar(monthKey)
  return (
    <div className="min-w-0">
      <div className="mb-3 grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-1">
        {showPrevious ? (
          <button type="button" onClick={onPrevious} aria-label={l.previousMonth} className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6B7280] hover:bg-orange-50 hover:text-[#ff5a00]">
            <ChevronLeft size={17} />
          </button>
        ) : <span />}
        <p className="truncate text-center text-sm font-black text-[#1F2937]">{formatMonthYear(monthKey, lang, monthKey)}</p>
        {showNext || showMobileNext ? (
          <button type="button" onClick={onNext} aria-label={l.nextMonth} className={`flex h-9 w-9 items-center justify-center rounded-xl text-[#6B7280] hover:bg-orange-50 hover:text-[#ff5a00] ${showMobileNext && !showNext ? 'md:hidden' : ''}`}>
            <ChevronRight size={17} />
          </button>
        ) : <span />}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={formatMonthYear(monthKey, lang, monthKey)}>
        {l.weekdays.map(weekday => (
          <span key={weekday} role="columnheader" className="pb-1 text-center text-[9px] font-black uppercase text-[#9CA3AF]">{weekday}</span>
        ))}
        {days.map(day => {
          const selectedEdge = day.date === draftFrom || day.date === draftTo
          const inRange = Boolean(draftFrom && draftTo && day.date > draftFrom && day.date < draftTo)
          const isToday = day.date === today
          return (
            <button
              key={day.date}
              type="button"
              role="gridcell"
              disabled={!day.inMonth}
              aria-label={formatLongDate(day.date, lang, day.date)}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={selectedEdge || inRange}
              onClick={() => onSelect(day.date)}
              className={`flex h-9 items-center justify-center rounded-xl text-xs font-black transition-colors ${
                selectedEdge
                  ? 'bg-[#ff5a00] text-white shadow-sm shadow-orange-200'
                  : inRange
                    ? 'bg-orange-50 text-[#d94d00]'
                    : day.inMonth
                      ? isToday
                        ? 'bg-white text-[#ff5a00] ring-1 ring-orange-200 hover:bg-orange-50'
                        : 'text-[#4B5563] hover:bg-orange-50 hover:text-[#ff5a00]'
                      : 'cursor-default text-[#D1D5DB]'
              }`}
            >
              {day.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
