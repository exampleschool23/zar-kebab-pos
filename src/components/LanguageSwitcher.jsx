import React from 'react'
import { useApp } from '../store/AppContext'

const LANGUAGE_LABELS = {
  uz: '🇺🇿 UZ',
  ru: '🇷🇺 RU',
  en: '🇬🇧 EN',
}

export default function LanguageSwitcher({ value, onChange }) {
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
    <label className="relative inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] text-xs font-black text-[#1F2937] shadow-sm transition-colors hover:bg-white">
      <select
        value={activeLang}
        onChange={event => changeLanguage(event.target.value)}
        aria-label={activeLang === 'uz' ? 'Til' : activeLang === 'ru' ? 'Язык' : 'Language'}
        className="h-full appearance-none rounded-xl bg-transparent px-3 py-0 text-xs font-black uppercase outline-none"
      >
      {['uz', 'ru', 'en'].map(l => (
        <option
          key={l}
          value={l}
        >
          {LANGUAGE_LABELS[l]}
        </option>
      ))}
      </select>
    </label>
  )
}
