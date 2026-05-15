import React from 'react'
import { useApp } from '../store/AppContext'

export default function LanguageSwitcher() {
  const { state, dispatch } = useApp()
  return (
    <div className="flex gap-1">
      {['uz', 'ru', 'en'].map(l => (
        <button
          key={l}
          onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
          className={`px-2 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
            state.lang === l
              ? 'bg-brand text-white'
              : 'bg-white text-gray-500 border border-gray-200 hover:bg-orange-50'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
