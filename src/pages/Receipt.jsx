import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { formatCurrency } from '../lib/formatCurrency'
import { ArrowLeft, Printer } from 'lucide-react'

const L = {
  uz: {
    orderAmount: 'Buyurtma summasi',
    service:     'Xizmat 20%',
    total:       "To'lovga jami",
    scan:        'Instagram uchun skanerlang',
    table:       'Stol',
    date:        'Sana',
    time:        'Vaqt',
    item:        'Mahsulot',
    qty:         'Miq.',
    price:       'Narx',
    thankyou:    'Tashrif uchun rahmat!',
  },
  ru: {
    orderAmount: 'Сумма заказа',
    service:     'Обслуживание 20%',
    total:       'Итого к оплате',
    scan:        'Сканируйте для Instagram',
    table:       'Стол',
    date:        'Дата',
    time:        'Время',
    item:        'Товар',
    qty:         'Кол.',
    price:       'Цена',
    thankyou:    'Спасибо за визит!',
  },
  en: {
    orderAmount: 'Order amount',
    service:     'Service 20%',
    total:       'Total to pay',
    scan:        'Scan for Instagram',
    table:       'Table',
    date:        'Date',
    time:        'Time',
    item:        'Item',
    qty:         'Qty',
    price:       'Price',
    thankyou:    'Thank you for visiting!',
  },
}

export default function Receipt() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const lang = state.lang
  const labels = L[lang] || L.en

  const order = state.orders.find(o => o.id === orderId)

  if (!order) {
    return (
      <div className="min-h-screen bg-[#faf7f0] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-4xl mb-2">🧾</p>
          <p>Order not found</p>
          <button onClick={() => navigate(-1)} className="mt-4 text-[#ff5a00] font-semibold hover:underline">
            ← Back
          </button>
        </div>
      </div>
    )
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString()
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-gray-100 w-full max-w-full overflow-x-hidden">
      {/* Top bar — hidden when printing */}
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 font-medium text-sm hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={17} />
          Back
        </button>
        <div className="flex items-center gap-1">
          {['uz', 'ru', 'en'].map(l => (
            <button
              key={l}
              onClick={() => dispatch({ type: 'SET_LANG', payload: l })}
              className={`px-2 py-1 rounded-lg text-xs font-bold uppercase transition-colors ${
                lang === l
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 bg-gray-900 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-black transition-colors"
        >
          <Printer size={15} />
          Print
        </button>
      </div>

      {/* Receipt */}
      <div className="flex justify-center p-6 print:p-0">
        <div
          className="bg-white shadow-xl print:shadow-none"
          style={{
            width: '280px',
            padding: '20px',
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: '11px',
            color: '#111',
          }}
        >
          {/* Brand */}
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #999', paddingBottom: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '3px' }}>ZAR KEBAB</div>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>Restaurant & Cafe</div>
          </div>

          {/* Meta */}
          <div style={{ marginBottom: '10px', lineHeight: '1.8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#666' }}>{labels.table}:</span>
              <span style={{ fontWeight: 700 }}>{order.table_name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#666' }}>{labels.date}:</span>
              <span>{dateStr}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#666' }}>{labels.time}:</span>
              <span>{timeStr}</span>
            </div>
          </div>

          {/* Column headers */}
          <div style={{ borderTop: '1px dashed #999', paddingTop: '8px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '9px', textTransform: 'uppercase' }}>
              <span style={{ flex: 1 }}>{labels.item}</span>
              <span style={{ width: '24px', textAlign: 'center' }}>{labels.qty}</span>
              <span style={{ width: '72px', textAlign: 'right' }}>{labels.price}</span>
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: '10px' }}>
            {order.items.map((item, i) => (
              <div key={i} style={{ marginBottom: '6px' }}>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: '10px' }}>
                  <span>{formatCurrency(item.price)}</span>
                  <span>×{item.quantity}</span>
                  <span style={{ fontWeight: 700, color: '#111' }}>{formatCurrency(item.price * item.quantity)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ borderTop: '1px dashed #999', paddingTop: '8px', lineHeight: '1.9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{labels.orderAmount}</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{labels.service}</span>
              <span>{formatCurrency(order.service_fee)}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontWeight: 900, fontSize: '13px',
              borderTop: '1px solid #333', paddingTop: '6px', marginTop: '4px',
            }}>
              <span>{labels.total}</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>

          {/* QR placeholder */}
          <div style={{ marginTop: '16px', borderTop: '1px dashed #999', paddingTop: '12px', textAlign: 'center' }}>
            <div style={{
              width: '80px', height: '80px', border: '2px solid #333',
              margin: '0 auto 6px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '9px', color: '#666',
            }}>
              Instagram QR
            </div>
            <div style={{ fontSize: '9px', color: '#666' }}>{labels.scan}</div>
            <div style={{ fontSize: '9px', color: '#aaa', marginTop: '2px' }}>@zarKebab</div>
          </div>

          {/* Footer */}
          <div style={{
            marginTop: '12px', borderTop: '1px dashed #999', paddingTop: '8px',
            textAlign: 'center', color: '#aaa', fontSize: '9px',
          }}>
            {labels.thankyou}
          </div>
        </div>
      </div>
    </div>
  )
}
