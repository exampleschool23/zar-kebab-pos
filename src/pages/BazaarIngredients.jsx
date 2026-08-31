import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArrowLeft, Edit3, Loader2, PackagePlus, Plus, RefreshCw, RotateCcw, Save, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { OperationalError, OperationalLoading } from '../components/OperationalState'
import { useApp } from '../store/AppContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { normalizeRole } from '../lib/permissions'
import { formatCurrency } from '../lib/formatCurrency'
import { formatMoneyInput, normalizeMoneyInput } from '../lib/moneyInput'
import { withWriteTimeout } from '../lib/writeTimeout'
import { BAZAAR_ENTRY_CATEGORIES, BAZAAR_ENTRY_UNITS, bazaarCategoryLabel, bazaarUnitLabel, normalizeBazaarProductKey } from '../lib/bazaar'
import { bazaarIngredientMatches, isBazaarIngredientNetworkError, runBazaarIngredientWriteWithRecovery } from '../lib/bazaarIngredientWrites'

const INPUT = 'h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm font-semibold text-[#1F2937] outline-none transition-all placeholder:text-[#C3C8D0] focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-[#9CA3AF]'

const COPY = {
  en: {
    title: 'Bazaar ingredients', sub: 'Keep one canonical name and normal unit price for every ingredient.', back: 'Daily Bazaar', add: 'Add ingredient', edit: 'Edit ingredient', name: 'Ingredient name', nameHint: 'The name cannot be changed later. Archive it and add a corrected ingredient instead.', category: 'Category', unit: 'Purchase unit', normalPrice: 'Normal price per unit', save: 'Save ingredient', saving: 'Saving…', cancel: 'Cancel', search: 'Search ingredients…', active: 'Active', archived: 'Archived', all: 'All', archive: 'Archive', restore: 'Restore', empty: 'No ingredients found.', loadFailed: 'Could not load ingredients.', saveFailed: 'Could not save the ingredient.', statusFailed: 'Could not update the ingredient status.', connectionFailed: 'Connection was interrupted. Please try again; a completed save will not be duplicated.', saved: 'Ingredient saved.', statusUpdated: 'Ingredient status updated.', refresh: 'Refresh', readOnly: 'Your access is read-only.', required: 'Enter a name and a normal price greater than zero.', migrationMissing: 'Apply the latest Bazaar migrations to manage ingredients.'
  },
  ru: {
    title: 'Ингредиенты базара', sub: 'Единое название и обычная цена за единицу для каждого ингредиента.', back: 'Ежедневный базар', add: 'Добавить ингредиент', edit: 'Изменить ингредиент', name: 'Название ингредиента', nameHint: 'Название потом изменить нельзя. Архивируйте запись и добавьте исправленную.', category: 'Категория', unit: 'Единица закупки', normalPrice: 'Обычная цена за единицу', save: 'Сохранить', saving: 'Сохранение…', cancel: 'Отмена', search: 'Поиск ингредиентов…', active: 'Активные', archived: 'Архивные', all: 'Все', archive: 'В архив', restore: 'Восстановить', empty: 'Ингредиенты не найдены.', loadFailed: 'Не удалось загрузить ингредиенты.', saveFailed: 'Не удалось сохранить ингредиент.', statusFailed: 'Не удалось изменить статус ингредиента.', connectionFailed: 'Соединение прервалось. Повторите попытку — уже выполненное сохранение не продублируется.', saved: 'Ингредиент сохранён.', statusUpdated: 'Статус ингредиента изменён.', refresh: 'Обновить', readOnly: 'У вас доступ только для чтения.', required: 'Введите название и обычную цену больше нуля.', migrationMissing: 'Примените последние миграции базара для управления ингредиентами.'
  },
  uz: {
    title: 'Bozor masalliqlari', sub: 'Har bir masalliq uchun yagona nom va odatiy birlik narxini saqlang.', back: 'Kunlik bozor', add: 'Masalliq qo‘shish', edit: 'Masalliqni tahrirlash', name: 'Masalliq nomi', nameHint: 'Nomni keyin o‘zgartirib bo‘lmaydi. Uni arxivlab, to‘g‘ri nom bilan yangisini qo‘shing.', category: 'Kategoriya', unit: 'Xarid birligi', normalPrice: 'Birlik uchun odatiy narx', save: 'Saqlash', saving: 'Saqlanmoqda…', cancel: 'Bekor qilish', search: 'Masalliq qidirish…', active: 'Faol', archived: 'Arxiv', all: 'Barchasi', archive: 'Arxivlash', restore: 'Tiklash', empty: 'Masalliq topilmadi.', loadFailed: 'Masalliqlarni yuklab bo‘lmadi.', saveFailed: 'Masalliqni saqlab bo‘lmadi.', statusFailed: 'Masalliq holatini o‘zgartirib bo‘lmadi.', connectionFailed: 'Aloqa uzildi. Qayta urinib ko‘ring — saqlangan yozuv takrorlanmaydi.', saved: 'Masalliq saqlandi.', statusUpdated: 'Masalliq holati yangilandi.', refresh: 'Yangilash', readOnly: 'Sizda faqat ko‘rish huquqi bor.', required: 'Nom va noldan katta odatiy narx kiriting.', migrationMissing: 'Masalliqlarni boshqarish uchun oxirgi bozor migratsiyalarini qo‘llang.'
  },
}

function emptyIngredient() {
  return { product_key: '', product_name: '', category: 'vegetables', unit: 'kg', normal_unit_price: '' }
}

function isMissingMigration(error) {
  const text = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return text.includes('normal_unit_price') || text.includes('is_catalog_managed') || text.includes('save_bazaar_ingredient') || text.includes('set_bazaar_ingredient_active') || text.includes('pgrst202') || text.includes('pgrst204')
}

function savedIngredientRow(data) {
  return Array.isArray(data) ? data[0] : data
}

export default function BazaarIngredients() {
  const navigate = useNavigate()
  const { state } = useApp()
  const { profile } = useAuth()
  const lang = state.lang || 'ru'
  const l = COPY[lang] || COPY.en
  const canManage = normalizeRole(profile?.role || state.user?.role || 'guest') === 'owner'
  const [ingredients, setIngredients] = useState([])
  const [form, setForm] = useState(emptyIngredient)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingKey, setUpdatingKey] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const errorMessage = useCallback((requestError, fallback) => {
    if (isMissingMigration(requestError)) return l.migrationMissing
    if (isBazaarIngredientNetworkError(requestError)) return l.connectionFailed
    return requestError?.message || fallback
  }, [l.connectionFailed, l.migrationMissing])

  const upsertIngredient = useCallback(ingredient => {
    if (!ingredient?.product_key) return
    setIngredients(current => [...current.filter(item => item.product_key !== ingredient.product_key), ingredient]
      .sort((left, right) => left.product_name.localeCompare(right.product_name)))
  }, [])

  const loadIngredients = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('bazaar_product_catalog')
      .select('product_key, product_name, category, unit, normal_unit_price, is_active, is_catalog_managed, last_purchase_date, updated_at')
      .eq('is_catalog_managed', true)
      .order('product_name')
    if (loadError) setError(errorMessage(loadError, l.loadFailed))
    else setIngredients(data || [])
    setLoading(false)
  }, [errorMessage, l.loadFailed])

  useEffect(() => { loadIngredients() }, [loadIngredients])

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeBazaarProductKey(query)
    return ingredients.filter(item => {
      if (status === 'active' && !item.is_active) return false
      if (status === 'archived' && item.is_active) return false
      return !normalizedQuery || normalizeBazaarProductKey(item.product_name).includes(normalizedQuery)
    })
  }, [ingredients, query, status])

  function editIngredient(ingredient) {
    setForm({ ...ingredient, normal_unit_price: String(ingredient.normal_unit_price || '') })
    setError('')
    setNotice('')
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  async function saveIngredient(event) {
    event.preventDefault()
    if (!canManage || saving) return
    if (!form.product_name.trim() || Number(form.normal_unit_price) <= 0) {
      setError(l.required)
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        ...(form.product_key ? { product_key: form.product_key } : {}),
        product_name: form.product_name.trim(),
        category: form.category,
        unit: form.unit,
        normal_unit_price: normalizeMoneyInput(form.normal_unit_price),
      }
      const expectedKey = form.product_key || normalizeBazaarProductKey(payload.product_name)
      const { data: savedData, error: saveError } = await runBazaarIngredientWriteWithRecovery({
        write: () => withWriteTimeout(
          signal => supabase.rpc('save_bazaar_ingredient', { payload }).abortSignal(signal),
          'SAVE_BAZAAR_INGREDIENT',
        ),
        reconcile: async () => {
          const { data, error: reconcileError } = await supabase
            .from('bazaar_product_catalog')
            .select('product_key, product_name, category, unit, normal_unit_price, is_active, is_catalog_managed, last_purchase_date, updated_at')
            .eq('product_key', expectedKey)
            .maybeSingle()
          if (reconcileError) throw reconcileError
          return bazaarIngredientMatches(data, payload) ? data : null
        },
      })
      if (saveError) throw saveError
      upsertIngredient(savedIngredientRow(savedData))
      setForm(emptyIngredient())
      setNotice(l.saved)
    } catch (saveError) {
      setError(errorMessage(saveError, l.saveFailed))
    } finally {
      setSaving(false)
    }
  }

  async function setIngredientActive(ingredient) {
    if (!canManage || updatingKey) return
    setUpdatingKey(ingredient.product_key)
    setError('')
    setNotice('')
    try {
      const nextActive = !ingredient.is_active
      const { data: savedData, error: statusError } = await runBazaarIngredientWriteWithRecovery({
        write: () => withWriteTimeout(
          signal => supabase.rpc('set_bazaar_ingredient_active', {
            p_product_key: ingredient.product_key,
            p_is_active: nextActive,
          }).abortSignal(signal),
          'SET_BAZAAR_INGREDIENT_ACTIVE',
        ),
        reconcile: async () => {
          const { data, error: reconcileError } = await supabase
            .from('bazaar_product_catalog')
            .select('product_key, product_name, category, unit, normal_unit_price, is_active, is_catalog_managed, last_purchase_date, updated_at')
            .eq('product_key', ingredient.product_key)
            .maybeSingle()
          if (reconcileError) throw reconcileError
          return bazaarIngredientMatches(data, { is_active: nextActive }) ? data : null
        },
      })
      if (statusError) throw statusError
      upsertIngredient(savedIngredientRow(savedData))
      setNotice(l.statusUpdated)
    } catch (statusError) {
      setError(errorMessage(statusError, l.statusFailed))
    } finally {
      setUpdatingKey('')
    }
  }

  return (
    <AppShell title={l.title}>
      <div className="min-h-full bg-[#FAF7F0] px-4 py-5 sm:px-5 sm:py-6 lg:px-6 2xl:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => navigate('/admin/bazaar')} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#1F2937] px-3 text-xs font-black text-white"><ArrowLeft size={14} />{l.back}</button>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-[#ff5a00]"><PackagePlus size={21} /></div>
              <div><h1 className="text-2xl font-black text-[#1F2937]">{l.title}</h1><p className="mt-1 text-sm font-medium text-[#6B7280]">{l.sub}</p></div>
            </div>
            <button type="button" onClick={loadIngredients} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#6B7280]"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />{l.refresh}</button>
          </div>

          {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
          {notice && !error && <div role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{notice}</div>}

          {canManage ? (
            <form onSubmit={saveIngredient} className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div><h2 className="font-black text-[#1F2937]">{form.product_key ? l.edit : l.add}</h2><p className="mt-1 text-xs font-medium text-[#9CA3AF]">{l.nameHint}</p></div>
                {form.product_key && <button type="button" onClick={() => setForm(emptyIngredient())} className="inline-flex items-center gap-1 text-xs font-black text-[#6B7280]"><X size={14} />{l.cancel}</button>}
              </div>
              <fieldset disabled={saving} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(170px,1fr)_140px_minmax(190px,1fr)_auto] xl:items-end">
                <label className="text-xs font-black text-[#6B7280]">{l.name}<input value={form.product_name} onChange={event => setForm(current => ({ ...current, product_name: event.target.value }))} disabled={Boolean(form.product_key)} maxLength={160} className={`${INPUT} mt-1.5`} /></label>
                <label className="text-xs font-black text-[#6B7280]">{l.category}<select value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} className={`${INPUT} mt-1.5`}>{BAZAAR_ENTRY_CATEGORIES.map(category => <option key={category.key} value={category.key}>{bazaarCategoryLabel(category.key, lang)}</option>)}</select></label>
                <label className="text-xs font-black text-[#6B7280]">{l.unit}<select value={form.unit} onChange={event => setForm(current => ({ ...current, unit: event.target.value }))} className={`${INPUT} mt-1.5`}>{BAZAAR_ENTRY_UNITS.map(unit => <option key={unit.key} value={unit.key}>{bazaarUnitLabel(unit.key, lang)}</option>)}</select></label>
                <label className="text-xs font-black text-[#6B7280]">{l.normalPrice}<input inputMode="numeric" value={formatMoneyInput(form.normal_unit_price)} onChange={event => setForm(current => ({ ...current, normal_unit_price: normalizeMoneyInput(event.target.value) }))} className={`${INPUT} mt-1.5 text-right tabular-nums`} /></label>
                <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-5 text-sm font-black text-white disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : form.product_key ? <Save size={16} /> : <Plus size={16} />}{saving ? l.saving : l.save}</button>
              </fieldset>
            </form>
          ) : <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{l.readOnly}</div>}

          <section className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-3.5 text-[#9CA3AF]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={l.search} className={`${INPUT} pl-9`} /></div>
              <div className="flex rounded-xl bg-[#F3F4F6] p-1">{['active', 'archived', 'all'].map(key => <button key={key} type="button" onClick={() => setStatus(key)} className={`rounded-lg px-3 py-2 text-xs font-black ${status === key ? 'bg-white text-[#ff5a00] shadow-sm' : 'text-[#6B7280]'}`}>{l[key]}</button>)}</div>
            </div>
            {loading ? <OperationalLoading title={l.title} description="" /> : error && ingredients.length === 0 ? <OperationalError title={l.loadFailed} description={error} actionLabel={l.refresh} onAction={loadIngredients} /> : filtered.length === 0 ? <p className="p-10 text-center text-sm font-bold text-[#9CA3AF]">{l.empty}</p> : (
              <div className="divide-y divide-[#F3F4F6]">{filtered.map(ingredient => (
                <div key={ingredient.product_key} className="grid gap-3 p-4 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,0.7fr)_110px_minmax(180px,0.7fr)_auto] sm:items-center">
                  <div><p className="font-black text-[#1F2937]">{ingredient.product_name}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${ingredient.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{ingredient.is_active ? l.active : l.archived}</span></div>
                  <p className="text-sm font-bold text-[#6B7280]">{bazaarCategoryLabel(ingredient.category, lang)}</p>
                  <p className="text-sm font-bold text-[#6B7280]">{bazaarUnitLabel(ingredient.unit, lang)}</p>
                  <p className="font-black tabular-nums text-[#1F2937]">{formatCurrency(ingredient.normal_unit_price)} / {bazaarUnitLabel(ingredient.unit, lang)}</p>
                  {canManage && <div className="flex justify-end gap-2"><button type="button" onClick={() => editIngredient(ingredient)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] text-[#6B7280]"><Edit3 size={14} /></button><button type="button" disabled={updatingKey === ingredient.product_key} onClick={() => setIngredientActive(ingredient)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-black ${ingredient.is_active ? 'border-red-200 text-red-600' : 'border-green-200 text-green-700'}`}>{updatingKey === ingredient.product_key ? <Loader2 size={14} className="animate-spin" /> : ingredient.is_active ? <Archive size={14} /> : <RotateCcw size={14} />}{ingredient.is_active ? l.archive : l.restore}</button></div>}
                </div>
              ))}</div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  )
}
