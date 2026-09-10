import React from 'react'
import { formatCurrency } from '../lib/formatCurrency'

const labels = {
  en: { title: 'Product Contribution', revenue: 'Revenue', profit: 'Profit', share: 'share', sold: 'sold', margin: 'margin', missingCost: 'Cost unavailable', none: 'No sales data yet' },
  uz: { title: 'Mahsulot hissasi', revenue: 'Daromad', profit: 'Foyda', share: 'ulush', sold: 'sotildi', margin: 'marja', missingCost: 'Tannarx mavjud emas', none: "Savdo ma’lumotlari yo‘q" },
  ru: { title: 'Вклад продуктов', revenue: 'Выручка', profit: 'Прибыль', share: 'доля', sold: 'продано', margin: 'маржа', missingCost: 'Себестоимость недоступна', none: 'Нет данных о продажах' },
}

export default function ProductContributionCard({ rows, lang, periodLabel, loading, LoadingView }) {
  const l = labels[lang] || labels.en
  return <section aria-busy={loading} className="col-span-12 xl:col-span-4 min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
    <h3 className="mb-4 text-base font-black text-[#1F2937]">{l.title} · {periodLabel}</h3>
    {loading ? <LoadingView /> : rows.length === 0 ? <p className="py-6 text-center text-sm text-[#9CA3AF]">{l.none}</p> :
      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {rows.map((row, index) => <div key={row.menuItemId || row.name} className="rounded-xl border border-gray-100 p-2.5">
          <div className="flex items-center gap-2.5">
            <span className="w-5 text-center text-xs font-black text-gray-400">{index + 1}</span>
            {row.imageUrl ? <img src={row.imageUrl} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="h-9 w-9 rounded-lg bg-gray-100" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-gray-800">{row.name}</p>
              <p className="text-[11px] text-gray-500">{row.quantity} {l.sold} · {row.revenueSharePct}% {l.share}</p>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-gray-100 pt-2 text-xs">
            <div><p className="text-gray-400">{l.revenue}</p><p className="font-black text-gray-800">{formatCurrency(row.revenue)}</p></div>
            <div><p className="text-gray-400">{l.profit}</p>{row.profit === null
              ? <p className="font-bold text-amber-600" title={l.missingCost}>—</p>
              : <p className="font-black text-emerald-700">{formatCurrency(row.profit)} · {row.marginPct}% {l.margin}</p>}</div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${row.revenueSharePct}%` }} /></div>
        </div>)}
      </div>}
  </section>
}
