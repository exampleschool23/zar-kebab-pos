import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { ArrowLeft, TrendingUp, ShoppingBag, DollarSign, Calendar } from 'lucide-react'
import { mockReports } from '../data/mockData'

export default function Reports() {
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang

  return (
    <div className="min-h-screen bg-orange-50 w-full max-w-full overflow-x-hidden">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <span className="font-black text-gray-900">{t(lang, 'reports')}</span>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        {/* Date badge */}
        <div className="flex items-center gap-1.5 text-sm text-gray-400 mb-5">
          <Calendar size={14} />
          <span>{mockReports.date}</span>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-gradient-to-br from-green-400 to-green-500 rounded-2xl p-4 text-white shadow-lg shadow-green-200">
            <DollarSign size={24} className="mb-1 opacity-80" />
            <p className="text-lg font-black leading-tight">{formatCurrency(mockReports.totalRevenue)}</p>
            <p className="text-xs opacity-80 mt-0.5">{t(lang, 'totalRevenue')}</p>
          </div>
          <div className="bg-gradient-to-br from-brand to-orange-500 rounded-2xl p-4 text-white shadow-lg shadow-orange-200">
            <ShoppingBag size={24} className="mb-1 opacity-80" />
            <p className="text-2xl font-black">{mockReports.numberOfOrders}</p>
            <p className="text-xs opacity-80 mt-0.5">{t(lang, 'numberOfOrders')}</p>
          </div>
        </div>

        {/* Best selling */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
            <TrendingUp size={16} className="text-brand" />
            <h3 className="font-bold text-gray-900">{t(lang, 'bestSelling')}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {mockReports.bestSelling.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span className="w-7 h-7 rounded-full bg-orange-100 text-brand text-xs font-black flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">{item.quantity} {lang === 'ru' ? 'шт.' : lang === 'uz' ? 'dona' : 'sold'}</p>
                </div>
                <span className="text-brand font-bold text-sm flex-shrink-0">
                  {formatCurrency(item.revenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
