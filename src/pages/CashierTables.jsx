import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import StatusBadge from '../components/StatusBadge'
import { Receipt, CreditCard } from 'lucide-react'

function elapsedSince(isoString) {
  if (!isoString) return null
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diff < 1) return '< 1 min'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

export default function CashierTables() {
  const { state } = useApp()
  const navigate = useNavigate()
  const lang = state.lang

  const activeTables = state.tables.filter(t => ['occupied', 'needs_bill'].includes(t.status))

  function getTableOrder(tableId) {
    return state.orders.find(
      o => o.table_id === tableId && o.payment_status !== 'paid'
    )
  }

  return (
    <AppShell title={t(lang, 'tables')}>
      <div className="p-5 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-gray-900">{t(lang, 'tables')}</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {activeTables.length} table{activeTables.length !== 1 ? 's' : ''} with active orders
            </p>
          </div>
        </div>

        {activeTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <CreditCard size={48} className="mb-3 opacity-20" />
            <p className="font-semibold">{t(lang, 'noOrders')}</p>
            <p className="text-sm mt-1 opacity-60">No tables need payment right now</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeTables.map(table => {
              const order = getTableOrder(table.id)
              const elapsed = order ? elapsedSince(order.created_at) : null
              return (
                <div
                  key={table.id}
                  className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="font-black text-gray-900 text-base">{table.name}</span>
                    <StatusBadge status={table.status} />
                  </div>
                  {order && (
                    <p className="text-[#ff5a00] font-black text-lg mb-1">{formatCurrency(order.total)}</p>
                  )}
                  {elapsed && (
                    <p className="text-xs text-gray-400 mb-3">{elapsed} ago</p>
                  )}
                  <button
                    onClick={() => navigate(`/cashier/bill/${table.id}`)}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#ff5a00] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#cc4800] transition-colors shadow-sm shadow-orange-200 active:scale-95"
                  >
                    <Receipt size={14} />
                    Open Bill
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
