import React from 'react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import { TrendingUp, DollarSign, ShoppingBag, Calendar, Download } from 'lucide-react'
import { mockReports } from '../data/mockData'

export default function Reports() {
  const { state } = useApp()
  const lang = state.lang

  const summaryCards = [
    {
      label: t(lang, 'totalRevenue'),
      value: formatCurrency(mockReports.totalRevenue),
      icon: DollarSign,
      bg: 'bg-green-50',
      iconColor: 'text-green-600',
      valueColor: 'text-green-700',
    },
    {
      label: t(lang, 'numberOfOrders'),
      value: mockReports.numberOfOrders,
      icon: ShoppingBag,
      bg: 'bg-orange-50',
      iconColor: 'text-[#ff5a00]',
      valueColor: 'text-[#ff5a00]',
    },
  ]

  return (
    <AppShell title={t(lang, 'reports')}>
      <div className="p-5 max-w-3xl mx-auto">
        {/* Date row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar size={15} className="text-gray-400" />
            <span>{mockReports.date}</span>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <Download size={14} />
            Export
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {summaryCards.map((card, i) => (
            <div key={i} className={`${card.bg} rounded-2xl p-5`}>
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center mb-3 shadow-sm">
                <card.icon size={20} className={card.iconColor} />
              </div>
              <p className={`text-2xl font-black ${card.valueColor} leading-tight`}>{card.value}</p>
              <p className="text-xs text-gray-500 mt-1 font-medium">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Best selling */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-[#ff5a00]" />
              <h3 className="font-bold text-gray-900">{t(lang, 'bestSelling')}</h3>
            </div>
            <span className="text-xs text-gray-400">{mockReports.bestSelling.length} items</span>
          </div>
          <div className="divide-y divide-gray-50">
            {mockReports.bestSelling.map((item, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <span className={`w-8 h-8 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 ${
                  i === 0 ? 'bg-[#ff5a00] text-white' :
                  i === 1 ? 'bg-orange-100 text-[#ff5a00]' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">
                    {item.quantity} {lang === 'ru' ? 'шт.' : lang === 'uz' ? 'dona' : 'sold'}
                  </p>
                </div>
                {/* Mini bar */}
                <div className="hidden sm:block w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-[#ff5a00] rounded-full"
                    style={{
                      width: `${Math.round((item.quantity / mockReports.bestSelling[0].quantity) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-[#ff5a00] font-bold text-sm flex-shrink-0 min-w-[80px] text-right">
                  {formatCurrency(item.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
