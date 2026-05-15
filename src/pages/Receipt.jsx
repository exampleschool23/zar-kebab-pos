import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { formatCurrency } from '../lib/formatCurrency'
import { ArrowLeft, Printer } from 'lucide-react'

const L = {
  uz: {
    orderAmount: 'Buyurtma summasi',
    loyalty:     'Sodiqlik chegirmasi',
    service:     'Xizmat haqi (20%)',
    total:       "To'lovga jami",
    scan:        'Instagram uchun skanerlang',
    table:       'Stol',
    waiter:      'Ofitsiant',
    date:        'Sana',
    item:        'Taom',
    qty:         'Soni',
    amount:      'Summa',
    thankyou1:   'Tashrif uchun rahmat!',
    thankyou2:   'Yana kutib qolamiz!',
    slogan:      'Mazali taom, issiq mehmon',
  },
  ru: {
    orderAmount: 'Сумма заказа',
    loyalty:     'Скидка лояльности',
    service:     'Обслуживание (20%)',
    total:       'Итого к оплате',
    scan:        'Сканируйте для Instagram',
    table:       'Стол',
    waiter:      'Официант',
    date:        'Дата',
    item:        'Блюдо',
    qty:         'Кол.',
    amount:      'Сумма',
    thankyou1:   'Спасибо за визит!',
    thankyou2:   'Ждём вас снова!',
    slogan:      'Вкусная еда, тёплый приём',
  },
  en: {
    orderAmount: 'Order amount',
    loyalty:     'Loyalty discount',
    service:     'Service (20%)',
    total:       'Total to pay',
    scan:        'Scan for Instagram',
    table:       'Table',
    waiter:      'Waiter',
    date:        'Date',
    item:        'Item',
    qty:         'Qty',
    amount:      'Amount',
    thankyou1:   'Thank you for visiting!',
    thankyou2:   'See you again soon!',
    slogan:      'Good food, warm welcome',
  },
}

const PRINT_CSS = `
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { margin: 0; padding: 0; background: white; }
  .no-print { display: none !important; }
  .receipt-wrap { padding: 0 !important; background: white !important; }
  .receipt-paper {
    width: 80mm !important;
    max-width: 80mm !important;
    box-shadow: none !important;
    margin: 0 !important;
    padding: 6mm 4mm !important;
    border: none !important;
    border-radius: 0 !important;
  }
}
`

export default function Receipt() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const { state, dispatch } = useApp()
  const lang = state.lang
  const labels = L[lang] || L.uz

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
  const dateStr = now.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const subtotal       = order.subtotal
  const loyaltyPct     = order.loyalty_discount_pct || 0
  const loyaltyAmt     = order.loyalty_discount_amount || 0
  const afterDiscount  = order.discounted_subtotal || subtotal
  const serviceFee     = order.service_fee
  const total          = order.total

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=https://instagram.com/zarkebab&size=160x160&margin=4`

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="min-h-screen bg-gray-100 no-print" style={{ display: 'block' }}>
        {/* Top bar */}
        <div className="no-print sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm z-10">
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
      </div>

      {/* Receipt wrapper — visible on screen and in print */}
      <div className="receipt-wrap flex justify-center bg-gray-100 py-8 px-4 min-h-screen">
        <div
          className="receipt-paper bg-white shadow-2xl rounded-lg"
          style={{
            width: '340px',
            maxWidth: '100%',
            padding: '28px 24px',
            fontFamily: '"Courier New", Courier, monospace',
            color: '#111',
          }}
        >
          {/* ── Brand header ── */}
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.1 }}>
              ZarKebab
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', fontStyle: 'italic' }}>
              {labels.slogan}
            </div>
          </div>

          <Divider />

          {/* ── CHEK title ── */}
          <div style={{ textAlign: 'center', margin: '10px 0' }}>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '8px' }}>CHEK</div>
          </div>

          <Divider />

          {/* ── Order meta ── */}
          <div style={{ marginBottom: '10px', lineHeight: '2' }}>
            <Row label={labels.table} value={order.table_name} bold />
            <Row label={labels.waiter} value={order.waiter_name || '—'} />
            <Row label={labels.date} value={`${dateStr}  ${timeStr}`} />
          </div>

          <Divider />

          {/* ── Items table header ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 36px 80px',
            fontSize: '10px',
            fontWeight: 700,
            color: '#888',
            textTransform: 'uppercase',
            padding: '4px 0',
            borderBottom: '1px dashed #ccc',
            marginBottom: '4px',
          }}>
            <span>{labels.item}</span>
            <span style={{ textAlign: 'center' }}>{labels.qty}</span>
            <span style={{ textAlign: 'right' }}>{labels.amount}</span>
          </div>

          {/* ── Items ── */}
          <div style={{ marginBottom: '8px' }}>
            {order.items.map((item, i) => (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 36px 80px',
                alignItems: 'start',
                padding: '5px 0',
                borderBottom: '1px dotted #eee',
                fontSize: '11px',
              }}>
                <span style={{ fontWeight: 600, paddingRight: '4px', lineHeight: 1.3 }}>
                  {item.name}
                </span>
                <span style={{ textAlign: 'center', color: '#555' }}>{item.quantity}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>
                  {formatCurrency(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <Divider />

          {/* ── Totals ── */}
          <div style={{ lineHeight: '1.9', fontSize: '12px', margin: '8px 0' }}>
            <Row label={labels.orderAmount} value={formatCurrency(subtotal)} />
            {loyaltyPct > 0 && (
              <Row
                label={`${labels.loyalty} (${loyaltyPct}%)`}
                value={`− ${formatCurrency(loyaltyAmt)}`}
                color="#16a34a"
              />
            )}
            <Row label={labels.service} value={formatCurrency(serviceFee)} />
          </div>

          <Divider double />

          {/* ── Grand total ── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '18px',
            fontWeight: 900,
            margin: '10px 0 12px',
          }}>
            <span>{labels.total}</span>
            <span>{formatCurrency(total)}</span>
          </div>

          <Divider />

          {/* ── QR code ── */}
          <div style={{ textAlign: 'center', padding: '14px 0 6px' }}>
            <img
              src={qrUrl}
              alt="Instagram QR"
              width={110}
              height={110}
              style={{ display: 'block', margin: '0 auto 6px' }}
            />
            <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>{labels.scan}</div>
            <div style={{ fontSize: '11px', fontWeight: 700, marginTop: '2px' }}>@zarkebab</div>
          </div>

          <Divider />

          {/* ── Footer ── */}
          <div style={{ textAlign: 'center', fontSize: '11px', padding: '10px 0 4px', lineHeight: '1.8' }}>
            <div style={{ fontWeight: 700 }}>{labels.thankyou1}</div>
            <div style={{ color: '#666' }}>{labels.thankyou2}</div>
            <div style={{ fontSize: '10px', color: '#aaa', marginTop: '6px', fontStyle: 'italic' }}>
              {labels.slogan}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function Divider({ double }) {
  return (
    <div style={{
      borderTop: double ? '2px solid #333' : '1px dashed #bbb',
      margin: '8px 0',
    }} />
  )
}

function Row({ label, value, bold, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: color || 'inherit' }}>
      <span style={{ color: color || '#555' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  )
}
