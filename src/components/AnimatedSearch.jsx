import React, { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

export default function AnimatedSearch({
  value,
  onChange,
  placeholder,
  searchLabel = 'Search',
  clearLabel = 'Clear search',
  closeLabel = 'Close search',
  variant = 'inline',
  className = '',
  buttonClassName = '',
  panelClassName = '',
}) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const hasValue = Boolean(value)

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  function clearSearch() {
    onChange('')
  }

  if (variant === 'overlay') {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={searchLabel}
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-[#64748B] transition-all duration-200 ease-out hover:bg-white hover:text-[#ff5a00] ${
            open ? 'scale-95 opacity-0' : 'scale-100 opacity-100'
          } ${hasValue ? 'text-[#ff5a00] ring-2 ring-[#ff5a00]/10' : ''} ${buttonClassName}`}
        >
          <Search size={17} />
        </button>

        <div
          className={`absolute inset-x-3 top-1/2 z-20 -translate-y-1/2 rounded-2xl border border-[#E5E7EB] bg-white p-1 shadow-lg transition-all duration-200 ease-out sm:inset-x-4 ${
            open
              ? 'pointer-events-auto scale-x-100 scale-y-100 opacity-100'
              : 'pointer-events-none scale-x-[0.08] scale-y-90 opacity-0'
          } ${panelClassName}`}
          style={{ transformOrigin: 'left center' }}
        >
          <div className="relative flex items-center gap-2">
            <Search size={17} className="absolute left-3.5 text-[#9CA3AF]" />
            <input
              ref={inputRef}
              value={value}
              onChange={event => onChange(event.target.value)}
              placeholder={placeholder}
              disabled={!open}
              tabIndex={open ? 0 : -1}
              className="h-10 min-w-0 flex-1 rounded-xl bg-[#F8FAFC] pl-10 pr-12 text-sm outline-none transition-all focus:bg-white disabled:opacity-100"
            />
            {hasValue && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={clearLabel}
                className="absolute right-12 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-white hover:text-[#6B7280]"
              >
                <X size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={closeLabel}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#ff5a00]"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <div
      className={`relative order-last flex transition-all duration-200 ease-out sm:order-none sm:min-w-0 ${
        open ? 'min-w-full flex-1 sm:min-w-[220px]' : 'h-10 w-10 min-w-10 flex-none flex-shrink-0'
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={searchLabel}
        className={`flex h-10 w-10 min-w-10 flex-none items-center justify-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#64748B] transition-all duration-200 ease-out hover:border-orange-200 hover:bg-white hover:text-[#ff5a00] ${
          open ? 'pointer-events-none absolute left-0 top-0 scale-95 opacity-0' : 'relative scale-100 opacity-100'
        } ${hasValue ? 'text-[#ff5a00] ring-2 ring-[#ff5a00]/10' : ''} ${buttonClassName}`}
      >
        <Search size={17} />
      </button>

      <div
        className={`relative flex h-10 min-w-0 items-center rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] transition-all duration-200 ease-out focus-within:border-[#ff5a00] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ff5a00]/20 ${
          open ? 'pointer-events-auto w-full scale-x-100 opacity-100' : 'pointer-events-none w-10 scale-x-0 opacity-0'
        } ${panelClassName}`}
        style={{ transformOrigin: 'left center' }}
      >
        <Search size={16} className="absolute left-3.5 text-[#9CA3AF] pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={!open}
          tabIndex={open ? 0 : -1}
          className="h-full w-full bg-transparent pl-10 pr-20 text-[14px] text-[#1F2937] placeholder-[#9CA3AF] outline-none disabled:opacity-100"
        />
        {hasValue && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-11 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition-colors hover:text-[#6B7280]"
            aria-label={clearLabel}
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-white hover:text-[#ff5a00]"
          aria-label={closeLabel}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
