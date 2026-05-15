import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { ArrowLeft, Printer, CheckCircle2 } from 'lucide-react'

export default function CashierBill() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const lang = state.lang

  const order = state.orders.find(o => o.table_id === tableId && o.payment_status !== 'paid')
  const table = state.tables.find(t => t.id === tableId)

  if (!order) {
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center w-full max-w-full overflow-x-hidden">
        <div className="text-center text-gray-400">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-medium">No active order for this table</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-brand font-semibold">
            ← {t(lang, 'back')}
          </button>
        </div>
      </div>
    )
  }

  function handlePaid() {
    dispatch({ type: 'MARK_ORDER_PAID', payload: tableId })
    navigate('/cashier/tables')
  }

  return (
    <div className="min-h-screen bg-orange-50 w-full max-w-full overflow-x-hidden">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <p className="font-black text-gray-900">{table?.name}</p>
            <p className="text-xs text-gray-400">{t(lang, 'cashier')}</p>
          </div>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="p-4 max-w-lg mx-auto">
        {/* Order items card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-50">
            <h2 className="font-bold text-gray-900">{t(lang, 'orderItems')}</h2>
            <p className="text-xs text-gray-400">{order.table_name} · {order.waiter_name}</p>
          </div>

          <div className="divide-y divide-gray-50">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                  <p className="text-xs text-gray-400">{formatCurrency(item.price)} × {item.quantity}</p>
                </div>
                <span className="font-bold text-gray-900 flex-shrink-0">
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-4 py-4 bg-gray-50 space-y-2 border-t border-gray-100">
            <div className="flex justify-between text-sm text-gray-500">
              <span>{t(lang, 'orderAmount')}</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>{t(lang, 'service')}</span>
              <span>{formatCurrency(order.service_fee)}</span>
            </div>
            <div className="flex justify-between font-black text-base text-gray-900 pt-2 border-t border-gray-200">
              <span>{t(lang, 'totalToPay')}</span>
              <span className="text-brand">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/receipt/${order.id}`)}
            className="flex-1 flex items-center justify-center gap-2 bg-white border-2 border-gray-200 text-gray-700 rounded-xl py-3.5 font-bold text-sm hover:bg-gray-50 transition-colors"
          >
            <Printer size={17} />
            {t(lang, 'printReceipt')}
          </button>
          <button
            onClick={handlePaid}
            className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white rounded-xl py-3.5 font-bold text-sm hover:bg-green-600 transition-colors shadow-lg shadow-green-200"
          >
            <CheckCircle2 size={17} />
            {t(lang, 'markAsPaid')}
          </button>
        </div>
      </main>
    </div>
  )
}
