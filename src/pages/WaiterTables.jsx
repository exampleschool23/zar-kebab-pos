import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { t } from '../lib/i18n'
import AppShell from '../components/AppShell'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency } from '../lib/formatCurrency'
import { RefreshCw } from 'lucide-react'

function elapsedSince(isoString) {
  if (!isoString) return null
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)
  if (diff < 1) return '< 1 min'
  if (diff < 60) return `${diff} min`
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

function TableCard({ table, order, onClick }) {
  const elapsed = order ? elapsedSince(order.created_at) : null

  const borderColor =
    table.status === 'available'  ? 'border-green-200 hover:border-green-400' :
    table.status === 'occupied'   ? 'border-orange-200 hover:border-orange-400' :
    table.status === 'needs_bill' ? 'border-red-200 hover:border-red-400' :
    'border-gray-200'

  return (
    <button
      onClick={onClick}
      className={`bg-white border-2 ${borderColor} rounded-2xl p-4 text-left transition-all active:scale-95 hover:shadow-md w-full`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="font-black text-gray-900 text-base">{table.name}</span>
        <StatusBadge status={table.status} />
      </div>

      {order && (
        <>
          <p className="text-[#ff5a00] font-bold text-sm">{formatCurrency(order.total)}</p>
          {elapsed && (
            <p className="text-xs text-gray-400 mt-0.5">{elapsed} ago</p>
          )}
        </>
      )}
      {!order && table.status === 'available' && (
        <p className="text-xs text-gray-400">Tap to start order</p>
      )}
    </button>
  )
}

export default function WaiterTables() {
  const { state, dispatch } = useApp()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const lang = state.lang

  const waiterName = profile?.full_name || state.user?.name || 'Waiter'

  function getTableOrder(tableId) {
    return state.orders.find(
      o => o.table_id === tableId && o.payment_status !== 'paid'
    )
  }

  function handleTable(table) {
    dispatch({ type: 'SET_TABLE', payload: table.id })
    dispatch({ type: 'CLEAR_CART' })
    navigate(`/waiter/order/${table.id}`)
  }

  function handleRefresh() {
    // In a real app this would re-fetch; here it's a no-op visual cue
  }

  return (
    <AppShell title={t(lang, 'tables')}>
      <div className="p-5 max-w-4xl mx-auto">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-gray-900">{t(lang, 'tables')}</h2>
            <p className="text-sm text-gray-400 mt-0.5">Welcome back, {waiterName}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        {/* Status legend */}
        <div className="flex gap-4 mb-5 flex-wrap">
          {[
            { status: 'available',  label: 'Available'  },
            { status: 'occupied',   label: 'Occupied'   },
            { status: 'needs_bill', label: 'Needs Bill' },
          ].map(({ status, label }) => (
            <div key={status} className="flex items-center gap-1.5">
              <StatusBadge status={status} />
            </div>
          ))}
        </div>

        {/* Table grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {state.tables.map(table => (
            <TableCard
              key={table.id}
              table={table}
              order={getTableOrder(table.id)}
              onClick={() => handleTable(table)}
            />
          ))}
        </div>
      </div>
    </AppShell>
  )
}
