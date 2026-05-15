import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import { ArrowLeft, Printer, CheckCircle2, Banknote, CreditCard } from 'lucide-react'

export default function CashierBill() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const lang = state.lang
  const [payMethod, setPayMethod] = useState('cash') // 'cash' | 'card'

  const order = state.orders.find(o => o.table_id === tableId && o.payment_status !== 'paid')
  const table = state.tables.find(t => t.id === tableId)

  if (!order) {
    return (
      <AppShell title="Bill">
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-semibold">No active order for this table</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-[#ff5a00] font-semibold hover:underline flex items-center gap-1"
          >
            <ArrowLeft size={15} />
            {t(lang, 'back')}
          </button>
        </div>
      </AppShell>
    )
  }

  function handlePaid() {
    dispatch({ type: 'MARK_ORDER_PAID', payload: tableId })
    navigate('/cashier/tables')
  }

  return (
    <AppShell title={`Bill — ${table?.name || ''}`}>
      <div className="p-5 max-w-2xl mx-auto">
        {/* Back */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm font-medium mb-5 transition-colors"
        >
          <ArrowLeft size={16} />
          {t(lang, 'back')}
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Order items — wider */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50">
              <h2 className="font-bold text-gray-900 text-base">{t(lang, 'orderItems')}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{order.table_name} · {order.waiter_name}</p>
            </div>

            <div className="divide-y divide-gray-50">
              {order.items.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(item.price)} × {item.quantity}</p>
                  </div>
                  <span className="font-bold text-gray-900 flex-shrink-0 text-sm">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Payment summary */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50">
                <h3 className="font-bold text-gray-900 text-base">Payment Summary</h3>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t(lang, 'orderAmount')}</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t(lang, 'service')}</span>
                  <span>{formatCurrency(order.service_fee)}</span>
                </div>
                <div className="flex justify-between font-black text-xl text-gray-900 pt-2 border-t border-gray-100">
                  <span>{t(lang, 'total')}</span>
                  <span className="text-[#ff5a00]">{formatCurrency(order.total)}</span>
                </div>
              </div>
            </div>

            {/* Payment method */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Payment Method</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setPayMethod('cash')}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    payMethod === 'cash'
                      ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <Banknote size={20} />
                  Cash
                </button>
                <button
                  onClick={() => setPayMethod('card')}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    payMethod === 'card'
                      ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00]'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <CreditCard size={20} />
                  Card
                </button>
              </div>

              <button
                onClick={handlePaid}
                className="w-full flex items-center justify-center gap-2 bg-[#ff5a00] text-white rounded-xl py-3.5 font-bold text-sm hover:bg-[#cc4800] transition-colors shadow-lg shadow-orange-200 active:scale-[0.98] mb-2"
              >
                <CheckCircle2 size={17} />
                Process Payment
              </button>
              <button
                onClick={() => navigate(`/receipt/${order.id}`)}
                className="w-full flex items-center justify-center gap-2 bg-white border-2 border-gray-200 text-gray-700 rounded-xl py-3 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                <Printer size={15} />
                {t(lang, 'printReceipt')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
