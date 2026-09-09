import React from 'react'
import { NavLink } from 'react-router-dom'

const LABELS = {
  en: { catalog: 'Add ingredient', usage: 'Purchases & usage' },
  ru: { catalog: 'Добавить ингредиент', usage: 'Закупки и расход' },
  uz: { catalog: 'Masalliq qo‘shish', usage: 'Xaridlar va sarf' },
}

export default function IngredientNavigation({ lang }) {
  const l = LABELS[lang] || LABELS.en
  return (
    <nav className="mb-5 flex flex-wrap gap-2">
      {[['/admin/ingredients', l.catalog], ['/admin/ingredients/usage', l.usage]].map(([path, label]) => (
        <NavLink key={path} to={path} end className={({ isActive }) => `rounded-xl border px-4 py-3 text-sm font-bold ${isActive ? 'border-orange-200 bg-orange-50 text-[#ff5a00]' : 'border-[#E5E7EB] bg-white text-[#6B7280]'}`}>{label}</NavLink>
      ))}
    </nav>
  )
}
