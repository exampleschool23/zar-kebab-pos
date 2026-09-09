import React from 'react'
import AppShell from '../components/AppShell'
import IngredientNavigation from '../components/IngredientNavigation'
import IngredientMovement from '../components/IngredientMovement'
import { useApp } from '../store/AppContext'

export default function IngredientUsage() {
  const { state } = useApp()
  const lang = state.lang || 'ru'
  const title = { en: 'Purchases & usage', ru: 'Закупки и расход', uz: 'Xaridlar va sarf' }[lang] || 'Purchases & usage'
  return (
    <AppShell title={title}>
      <div className="min-h-full bg-[#FAF7F0] px-4 py-5 sm:px-5 sm:py-6 lg:px-6 2xl:px-8">
        <div className="mx-auto max-w-7xl">
          <IngredientNavigation lang={lang} />
          <IngredientMovement lang={lang} />
        </div>
      </div>
    </AppShell>
  )
}
