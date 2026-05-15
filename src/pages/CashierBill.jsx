import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import StatusBadge from '../components/StatusBadge'
import {
  ArrowLeft, Printer, CheckCircle2, Banknote, CreditCard,
  Receipt, Users, Clock,
} from 'lucide-react'

// SERVICE_RATE: change this to adjust service charge percentage (0.2 = 20%)
const SERVICE_RATE = 0.2

// Quick cash amount presets shown as shortcut buttons
const CASH_PRESETS = [
  { label: 'Exact', exact: true },
  { label: '130,000', value: 130000 },
  { label: '150,000', value: 150000 },
  { label: '200,000', value: 200000 },
  { label: '250,000', value: 250000 },
]

function elapsedSince(iso) {
  if (!iso) return null
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return '< 1 min'
  if (m < 60) return `${m} min ago`
  return `${Math.floor(m / 60)}h ${m % 60}m ago`
}

export default function CashierBill() {
  const { tableId }  = useParams()
  const navigate     = useNavigate()
  const { state, dispatch } = useApp()
  const lang = state.lang

  const [payMethod, setPayMethod]   = useState('cash')   // 'cash' | 'card'
  const [received, setReceived]     = useState('')        // raw string input

  const order = state.orders.find(o => o.table_id === tableId && o.payment_status !== 'paid')
  const table = state.tables.find(t => t.id === tableId)

  // Recalculate totals from the order (supports live SERVICE_RATE adjustment)
  const subtotal    = order ? order.items.reduce((s, i) => s + i.price * i.quantity, 0) : 0
  const serviceFee  = Math.round(subtotal * SERVICE_RATE)
  const total       = subtotal + serviceFee

  // Cash logic
  const receivedNum = parseFloat(received) || 0
  const change      = receivedNum - total
  const shortfall   = total - receivedNum

  // Set received to a preset value
  function applyPreset(preset) {
    if (preset.exact) setReceived(String(total))
    else setReceived(String(preset.value))
  }

  function handlePaid() {
    dispatch({ type: 'MARK_ORDER_PAID', payload: tableId })
    navigate('/cashier/tables')
  }

  const canProcess = payMethod === 'card' || (payMethod === 'cash' && receivedNum >= total)

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!order) {
    return (
      <AppShell title="Bill">
        <div className="flex flex-col items-center justify-center py-32 text-gray-400">
          <Receipt size={48} className="mb-4 opacity-20" strokeWidth={1.5} />
          <p className="font-semibold text-gray-500">No active order for this table</p>
          <p className="text-sm text-gray-400 mt-1">The order may have already been paid.</p>
          <button
            onClick={() => navigate('/cashier/tables')}
            className="mt-5 flex items-center gap-2 text-[#ff5a00] font-semibold hover:underline text-sm"
          >
            <ArrowLeft size={15} /> Back to tables
          </button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={`Bill — ${table?.name || ''}`}>
      <div className="w-full max-w-[1200px] mx-auto px-5 py-5">

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl hover:bg-white border border-gray-200 transition-colors"
            >
              <ArrowLeft size={17} className="text-gray-500" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-black text-gray-900 text-xl">Bill — {table?.name}</h1>
                <StatusBadge status={order.payment_status === 'paid' ? 'paid' : order.status} />
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                {order.waiter_name && (
                  <span className="flex items-center gap-1">
                    <Users size={11} /> {order.waiter_name}
                  </span>
                )}
                {order.created_at && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {elapsedSince(order.created_at)}
                  </span>
                )}
                <span>{order.items.length} items</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Two-column layout ────────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">

          {/* ── LEFT: Order receipt (65%) ──────────────────────────────────── */}
          <div className="w-full lg:flex-[65] min-w-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Card header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="font-black text-gray-900 text-base">
                    {t(lang, 'orderItems') || 'Order Items'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {order.table_name} · {order.items.reduce((s, i) => s + i.quantity, 0)} items
                  </p>
                </div>
                <Receipt size={18} className="text-gray-300" />
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-12 gap-2 px-6 py-2.5 bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                <div className="col-span-5">Item</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2 text-right">Unit Price</div>
                <div className="col-span-3 text-right">Total</div>
              </div>

              {/* Item rows */}
              <div className="divide-y divide-gray-50">
                {order.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 px-6 py-3.5 items-center hover:bg-gray-50/50 transition-colors">
                    <div className="col-span-5 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 leading-snug">{item.name}</p>
                      {item.notes && (
                        <p className="text-[11px] text-gray-400 mt-0.5 italic">Note: {item.notes}</p>
                      )}
                    </div>
                    <div className="col-span-2 text-center">
                      <span className="inline-flex items-center justify-center bg-gray-100 text-gray-700 font-bold text-xs rounded-lg w-8 h-7">
                        ×{item.quantity}
                      </span>
                    </div>
                    <div className="col-span-2 text-right text-sm text-gray-500 font-medium">
                      {formatCurrency(item.price)}
                    </div>
                    <div className="col-span-3 text-right font-black text-sm text-gray-900">
                      {formatCurrency(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Subtotals inside receipt card */}
              <div className="px-6 py-4 bg-gray-50/60 border-t border-gray-100 space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t(lang, 'orderAmount') || 'Subtotal'}</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{t(lang, 'service') || `Service (${SERVICE_RATE * 100}%)`}</span>
                  <span>{formatCurrency(serviceFee)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                  <span className="font-black text-gray-900 text-base">
                    {t(lang, 'totalToPay') || 'Total to Pay'}
                  </span>
                  <span className="font-black text-2xl text-[#ff5a00]">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Payment panel (35%) ─────────────────────────────────── */}
          <div className="w-full lg:flex-[35] flex flex-col gap-4 lg:sticky lg:top-5">

            {/* Total highlight */}
            <div className="bg-[#ff5a00] rounded-2xl px-6 py-5 text-white">
              <p className="text-sm font-semibold opacity-80 mb-1">
                {t(lang, 'totalToPay') || 'Total to Pay'}
              </p>
              <p className="font-black text-4xl tracking-tight">{formatCurrency(total)}</p>
              <p className="text-xs opacity-60 mt-2">{order.items.length} items · {table?.name}</p>
            </div>

            {/* Payment method selector */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                Payment Method
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { key: 'cash', label: 'Cash', icon: Banknote },
                  { key: 'card', label: 'Card', icon: CreditCard },
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setPayMethod(key)}
                    className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-bold text-sm transition-all ${
                      payMethod === key
                        ? 'border-[#ff5a00] bg-orange-50 text-[#ff5a00]'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Cash section */}
              {payMethod === 'cash' && (
                <div className="space-y-3">
                  {/* Quick presets */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 mb-2">Quick Amount</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CASH_PRESETS.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => applyPreset(p)}
                          className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:border-[#ff5a00] hover:text-[#ff5a00] bg-white transition-all"
                        >
                          {p.exact ? 'Exact' : p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount received input */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-400 block mb-1.5">
                      Amount Received (UZS)
                    </label>
                    <input
                      type="number"
                      value={received}
                      onChange={e => setReceived(e.target.value)}
                      placeholder={`Min: ${total.toLocaleString()}`}
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base font-bold text-gray-900 focus:outline-none focus:border-[#ff5a00] transition-all"
                    />
                  </div>

                  {/* Change / Shortfall */}
                  {receivedNum > 0 && (
                    <div className={`rounded-xl px-4 py-3 ${
                      change >= 0
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}>
                      {change >= 0 ? (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-green-700">
                            {t(lang, 'change') || 'Change'}
                          </span>
                          <span className="font-black text-lg text-green-700">
                            {formatCurrency(change)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-red-600">Remaining</span>
                          <span className="font-black text-lg text-red-600">
                            {formatCurrency(shortfall)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Card section */}
              {payMethod === 'card' && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 flex items-center gap-2">
                  <CreditCard size={16} className="text-blue-500 flex-shrink-0" />
                  <p className="text-sm text-blue-700 font-medium">Card terminal payment</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-2.5">
              <button
                onClick={handlePaid}
                disabled={!canProcess}
                className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-black text-base transition-all active:scale-[0.98] ${
                  canProcess
                    ? 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-200'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 size={19} />
                {t(lang, 'processPayment') || 'Process Payment'}
              </button>

              <button
                onClick={() => navigate(`/receipt/${order.id}`)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors"
              >
                <Printer size={16} />
                {t(lang, 'printReceipt') || 'Print Receipt'}
              </button>

              <button
                onClick={() => navigate('/cashier/tables')}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600 py-1.5 transition-colors font-medium"
              >
                ← Back to tables
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
