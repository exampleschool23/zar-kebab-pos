import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Store, Percent, Globe, Printer, Bell, Shield, Table2,
  Check, ChevronRight, Activity, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { useApp } from '../store/AppContext'
import AppShell from '../components/AppShell'
import { runDbHealthChecks } from '../lib/dbHealth'

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
  const navigate = useNavigate()
  const lang     = state.lang
  const settings = state.settings

  const [restaurantName, setRestaurantName] = useState(settings.restaurantName)
  const [serviceRate,    setServiceRate]    = useState(settings.serviceRate)
  const [receiptFooter,  setReceiptFooter]  = useState(settings.receiptFooter)
  const [autoPrint,      setAutoPrint]      = useState(settings.autoPrint)
  const [notifications,  setNotifications]  = useState(true)
  const [saved,          setSaved]          = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState('')
  const [health,         setHealth]         = useState(null)
  const [healthLoading,  setHealthLoading]  = useState(false)
  const [healthError,    setHealthError]    = useState('')

  useEffect(() => {
    setRestaurantName(settings.restaurantName)
    setServiceRate(settings.serviceRate)
    setReceiptFooter(settings.receiptFooter)
    setAutoPrint(settings.autoPrint)
  }, [settings.restaurantName, settings.serviceRate, settings.receiptFooter, settings.autoPrint])

  async function handleSave() {
    setSaving(true)
    setError('')
    const result = await dispatch({
      type: 'SET_SETTINGS',
      payload: { restaurantName, serviceRate, receiptFooter, autoPrint },
    })
    setSaving(false)
    if (result?.error) {
      setError(result.error.message || 'Failed to save settings')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function checkHealth() {
    setHealthLoading(true)
    setHealthError('')
    try {
      setHealth(await runDbHealthChecks())
    } catch (err) {
      setHealthError(err.message || 'Could not check system health')
    } finally {
      setHealthLoading(false)
    }
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
      tableManagement: 'Stollar',
      tableManagementSub: 'Restoran stollari, zonalari va sig‘imini boshqarish',
      language:        'Til',
      languageSub:     'Interfeys tili',
      autoPrint:       'Avtomatik bosib chiqarish',
      autoPrintSub:    'To\'lovdan keyin chekni avtomatik bosib chiqarish',
      notifications:   'Bildirishnomalar',
      notifSub:        'Yangi buyurtmalar uchun ovozli signal',
      systemHealth:    'Tizim holati',
      systemHealthSub: 'Baza jadvallari, ustunlari va RPC tekshiruvi',
      runHealth:       'Tekshirish',
      healthy:         'Hammasi joyida',
      unhealthy:       'Muammo bor',
      save:            'Saqlash',
      saving:          'Saqlanmoqda...',
      saved:           'Saqlandi!',
      saveError:       'Sozlamalarni saqlab bo‘lmadi',
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
      tableManagement: 'Столы',
      tableManagementSub: 'Управление столами, зонами и вместимостью',
      language:        'Язык',
      languageSub:     'Язык интерфейса',
      autoPrint:       'Автоматическая печать',
      autoPrintSub:    'Печатать чек автоматически после оплаты',
      notifications:   'Уведомления',
      notifSub:        'Звук при новых заказах',
      systemHealth:    'Состояние системы',
      systemHealthSub: 'Проверка таблиц, колонок и RPC в базе',
      runHealth:       'Проверить',
      healthy:         'Всё в порядке',
      unhealthy:       'Есть проблемы',
      save:            'Сохранить',
      saving:          'Сохранение...',
      saved:           'Сохранено!',
      saveError:       'Не удалось сохранить настройки',
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
      tableManagement: 'Tables',
      tableManagementSub: 'Manage restaurant tables, zones, and capacity',
      language:        'Language',
      languageSub:     'Interface language',
      autoPrint:       'Auto-print Receipt',
      autoPrintSub:    'Print receipt automatically after payment',
      notifications:   'Notifications',
      notifSub:        'Sound alert for new orders',
      systemHealth:    'System health',
      systemHealthSub: 'Checks database tables, columns, and RPCs',
      runHealth:       'Check',
      healthy:         'Healthy',
      unhealthy:       'Needs attention',
      save:            'Save Changes',
      saving:          'Saving...',
      saved:           'Saved!',
      saveError:       'Could not save settings',
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
          <SettingRow icon={Table2} label={l.tableManagement} sub={l.tableManagementSub}>
            <button
              onClick={() => navigate('/admin/tables')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-gray-50 px-3 py-2 text-[13px] font-bold text-[#1F2937] transition-colors hover:bg-gray-100"
            >
              Open
              <ChevronRight size={14} />
            </button>
          </SettingRow>
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

        <Section title={l.systemHealth}>
          <div className="px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#F3F4F6] bg-[#F9FAFB]">
                  <Activity size={16} className="text-[#6B7280]" />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#1F2937]">{l.systemHealth}</p>
                  <p className="mt-0.5 text-[12px] text-[#9CA3AF]">{l.systemHealthSub}</p>
                </div>
              </div>
              <button
                onClick={checkHealth}
                disabled={healthLoading}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-gray-50 px-3 py-2 text-[13px] font-bold text-[#1F2937] transition-colors hover:bg-gray-100 disabled:opacity-60"
              >
                <RefreshCw size={14} className={healthLoading ? 'animate-spin' : ''} />
                {l.runHealth}
              </button>
            </div>

            {healthError && (
              <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {healthError}
              </p>
            )}

            {health && (
              <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
                <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black ${
                  health.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                  {health.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
                  {health.ok ? l.healthy : l.unhealthy}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {health.checks.map(check => (
                    <div key={`${check.type}-${check.name}`} className="rounded-xl bg-white px-3 py-2 text-xs">
                      <p className="font-black text-[#1F2937]">{check.name}</p>
                      <p className={check.ok ? 'font-bold text-emerald-600' : 'font-bold text-red-600'}>{check.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full rounded-2xl font-black text-[14px] flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-[#ff5a00] text-white hover:bg-[#cc4800] shadow-lg shadow-orange-100 disabled:cursor-not-allowed disabled:opacity-70'
          }`}
          style={{ height: '52px' }}
        >
          {saved ? <Check size={18} /> : <Shield size={18} />}
          {saved ? l.saved : saving ? l.saving : l.save}
        </button>
        {error && (
          <p className="mt-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {l.saveError}: {error}
          </p>
        )}
      </div>
    </AppShell>
  )
}
