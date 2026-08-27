import React from 'react'
import { ChevronDown } from 'lucide-react'
import { useApp } from '../store/AppContext'

const LANGUAGE_LABELS = {
  uz: 'UZ',
  ru: 'RU',
  en: 'EN',
}

const LANGUAGE_FLAGS = {
  uz: '🇺🇿',
  ru: '🇷🇺',
  en: '🇬🇧',
}

export default function LanguageSwitcher({ value, onChange, className = '', compact = false }) {
  const { state, dispatch } = useApp()
  const activeLang = value || state.lang

  function changeLanguage(lang) {
    if (onChange) {
      onChange(lang)
      return
    }
    dispatch({ type: 'SET_LANG', payload: lang })
  }

  return (
    <label className={`relative inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-xs font-black text-[#1F2937] shadow-sm transition-colors hover:bg-white ${compact ? 'w-[58px]' : ''} ${className}`}>
      <select
        value={activeLang}
        onChange={event => changeLanguage(event.target.value)}
        aria-label={activeLang === 'uz' ? 'Til' : activeLang === 'ru' ? 'Язык' : 'Language'}
        className={`h-full appearance-none rounded-xl bg-transparent py-0 font-black uppercase outline-none ${compact ? 'w-full pl-1.5 pr-4 text-[10px]' : 'pl-3 pr-7 text-xs'}`}
      >
      {['uz', 'ru', 'en'].map(l => (
        <option
          key={l}
          value={l}
        >
          {LANGUAGE_FLAGS[l]} {LANGUAGE_LABELS[l]}
        </option>
      ))}
      </select>
      <ChevronDown size={13} strokeWidth={3} className={`pointer-events-none absolute text-[#64748B] ${compact ? 'right-1.5' : 'right-2.5'}`} />
    </label>
  )
}
