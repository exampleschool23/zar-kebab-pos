import React, { useState } from 'react'
import {
  Store, Percent, Globe, Printer, Bell, Shield,
  Check, ChevronRight,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import AppShell from '../components/AppShell'

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden mb-5">
      <div className="px-5 py-3.5 border-b border-[#F3F4F6]">
        <p className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest">{title}</p>
      </div>
      <div className="divide-y divide-[#F9FAFB]">{children}</div>
    </div>
  )
}

function SettingRow({ icon: Icon, label, sub, children }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-[#F9FAFB] border border-[#F3F4F6] flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-[#6B7280]" />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#1F2937]">{label}</p>
          {sub && <p className="text-[12px] text-[#9CA3AF] mt-0.5">{sub}</p>}
        </div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-[#ff5a00]' : 'bg-[#E5E7EB]'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

export default function AdminSettings() {
  const { state, dispatch } = useApp()
  const lang     = state.lang
  const settings = state.settings

  const [restaurantName, setRestaurantName] = useState(settings.restaurantName)
  const [serviceRate,    setServiceRate]    = useState(settings.serviceRate)
  const [receiptFooter,  setReceiptFooter]  = useState(settings.receiptFooter)
  const [autoPrint,      setAutoPrint]      = useState(settings.autoPrint)
  const [notifications,  setNotifications]  = useState(true)
  const [saved,          setSaved]          = useState(false)

  function handleSave() {
    dispatch({
      type: 'SET_SETTINGS',
      payload: { restaurantName, serviceRate, receiptFooter, autoPrint },
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const L = {
    uz: {
      title:           'Sozlamalar',
      sub:             'Restoran konfiguratsiyasi',
      restaurant:      'Restoran ma\'lumotlari',
      restaurantName:  'Restoran nomi',
      restaurantNameSub: 'Cheklarda va hisobotlarda ko\'rsatiladi',
      billing:         'Hisob-kitob',
      serviceCharge:   'Xizmat to\'lovi',
      serviceChargeSub: 'Barcha buyurtmalarga qo\'shiladi',
      receiptFooterL:  'Chek pastki qismi',
      receiptFooterSub: 'Chek pastida ko\'rsatiladigan matn',
      system:          'Tizim',
      language:        'Til',
      languageSub:     'Interfeys tili',
      autoPrint:       'Avtomatik bosib chiqarish',
      autoPrintSub:    'To\'lovdan keyin chekni avtomatik bosib chiqarish',
      notifications:   'Bildirishnomalar',
      notifSub:        'Yangi buyurtmalar uchun ovozli signal',
      save:            'Saqlash',
      saved:           'Saqlandi!',
    },
    ru: {
      title:           'Настройки',
      sub:             'Конфигурация ресторана',
      restaurant:      'Данные ресторана',
      restaurantName:  'Название ресторана',
      restaurantNameSub: 'Отображается на чеках и в отчётах',
      billing:         'Выставление счётов',
      serviceCharge:   'Сервисный сбор',
      serviceChargeSub: 'Добавляется ко всем заказам',
      receiptFooterL:  'Нижняя часть чека',
      receiptFooterSub: 'Текст внизу каждого чека',
      system:          'Система',
      language:        'Язык',
      languageSub:     'Язык интерфейса',
      autoPrint:       'Автоматическая печать',
      autoPrintSub:    'Печатать чек автоматически после оплаты',
      notifications:   'Уведомления',
      notifSub:        'Звук при новых заказах',
      save:            'Сохранить',
      saved:           'Сохранено!',
    },
    en: {
      title:           'Settings',
      sub:             'Restaurant configuration',
      restaurant:      'Restaurant Details',
      restaurantName:  'Restaurant Name',
      restaurantNameSub: 'Shown on receipts and reports',
      billing:         'Billing',
      serviceCharge:   'Service Charge',
      serviceChargeSub: 'Added to all orders',
      receiptFooterL:  'Receipt Footer',
      receiptFooterSub: 'Text shown at the bottom of each receipt',
      system:          'System',
      language:        'Language',
      languageSub:     'Interface language',
      autoPrint:       'Auto-print Receipt',
      autoPrintSub:    'Print receipt automatically after payment',
      notifications:   'Notifications',
      notifSub:        'Sound alert for new orders',
      save:            'Save Changes',
      saved:           'Saved!',
    },
  }
  const l = L[lang] || L.en

  return (
    <AppShell title={l.title}>
      <div className="max-w-[720px] mx-auto px-5 py-6">

        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">{l.sub}</p>
        </div>

        {/* Restaurant details */}
        <Section title={l.restaurant}>
          <SettingRow icon={Store} label={l.restaurantName} sub={l.restaurantNameSub}>
            <input
              type="text"
              value={restaurantName}
              onChange={e => setRestaurantName(e.target.value)}
              className="w-[180px] border border-[#E5E7EB] rounded-xl px-3 py-2 text-[13px] text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all text-right"
            />
          </SettingRow>
        </Section>

        {/* Billing */}
        <Section title={l.billing}>
          <SettingRow icon={Percent} label={l.serviceCharge} sub={l.serviceChargeSub}>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 10, 15, 20].map(v => (
                  <button
                    key={v}
                    onClick={() => setServiceRate(v)}
                    className={`px-2.5 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                      serviceRate === v
                        ? 'bg-[#ff5a00] text-white'
                        : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-gray-200'
                    }`}
                  >
                    {v}%
                  </button>
                ))}
              </div>
            </div>
          </SettingRow>
          <SettingRow icon={Printer} label={l.receiptFooterL} sub={l.receiptFooterSub}>
            <input
              type="text"
              value={receiptFooter}
              onChange={e => setReceiptFooter(e.target.value)}
              className="w-[200px] border border-[#E5E7EB] rounded-xl px-3 py-2 text-[13px] text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all text-right"
            />
          </SettingRow>
        </Section>

        {/* System */}
        <Section title={l.system}>
          <SettingRow icon={Globe} label={l.language} sub={l.languageSub}>
            <div className="flex gap-1 bg-[#F3F4F6] p-1 rounded-xl">
              {['uz', 'ru', 'en'].map(lg => (
                <button
                  key={lg}
                  onClick={() => dispatch({ type: 'SET_LANG', payload: lg })}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all ${
                    lang === lg ? 'bg-white text-[#1F2937] shadow-sm' : 'text-[#9CA3AF] hover:text-[#6B7280]'
                  }`}
                >
                  {lg}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow icon={Printer} label={l.autoPrint} sub={l.autoPrintSub}>
            <Toggle value={autoPrint} onChange={setAutoPrint} />
          </SettingRow>
          <SettingRow icon={Bell} label={l.notifications} sub={l.notifSub}>
            <Toggle value={notifications} onChange={setNotifications} />
          </SettingRow>
        </Section>

        {/* Save button */}
        <button
          onClick={handleSave}
          className={`w-full rounded-2xl font-black text-[14px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-100'
          }`}
          style={{ height: '52px' }}
        >
          {saved ? <Check size={18} /> : <Shield size={18} />}
          {saved ? l.saved : l.save}
        </button>
      </div>
    </AppShell>
  )
}
