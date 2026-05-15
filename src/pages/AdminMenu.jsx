import React, { useState, useMemo } from 'react'
import { useApp } from '../store/AppContext'
import { t, getItemName, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import { Plus, Edit2, Trash2, X, UtensilsCrossed, ChevronUp, ChevronDown } from 'lucide-react'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <X size={17} className="text-gray-400" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 font-semibold mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
      />
    </div>
  )
}

function OrderBtn({ onClick, disabled, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors ${
        disabled
          ? 'border-gray-100 text-gray-200 cursor-not-allowed'
          : 'border-gray-200 text-gray-400 hover:border-orange-300 hover:text-[#ff5a00]'
      }`}
    >
      <Icon size={12} />
    </button>
  )
}

const blankItem = {
  id: '', category_id: '',
  name_uz: '', name_ru: '', name_en: '',
  description_uz: '', description_ru: '', description_en: '',
  price: '', image_url: '', available: true, sort_order: '',
}

const blankCat = { id: '', name_uz: '', name_ru: '', name_en: '', image_url: '', sort_order: '' }

export default function AdminMenu() {
  const { state, dispatch } = useApp()
  const lang = state.lang

  const [tab, setTab] = useState('items')
  const [itemModal, setItemModal] = useState(null)
  const [catModal,  setCatModal]  = useState(null)
  const [form,    setForm]    = useState(blankItem)
  const [catForm, setCatForm] = useState(blankCat)
  const [activeCat, setActiveCat] = useState('all')

  // ── Sorted data ────────────────────────────────────────────────────────────
  const sortedCategories = useMemo(() =>
    [...state.categories].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories]
  )
  const realSortedCats = useMemo(() =>
    sortedCategories.filter(c => c.id !== 'all'),
    [sortedCategories]
  )

  const filteredItems = useMemo(() => {
    const items = activeCat === 'all'
      ? state.menuItems
      : state.menuItems.filter(i => i.category_id === activeCat)
    return [...items].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999))
  }, [state.menuItems, activeCat])

  // ── Item CRUD ──────────────────────────────────────────────────────────────
  function openNewItem() {
    const maxOrder = state.menuItems.length > 0
      ? Math.max(...state.menuItems.map(i => i.sort_order ?? 0))
      : 0
    setForm({ ...blankItem, id: 'i' + Date.now(), sort_order: maxOrder + 1 })
    setItemModal('new')
  }
  function openEditItem(i) { setForm({ ...i, sort_order: i.sort_order ?? 0 }); setItemModal('edit') }
  function saveItem() {
    if (!form.name_uz || !form.price || !form.category_id) return
    dispatch({
      type: itemModal === 'new' ? 'ADD_MENU_ITEM' : 'UPDATE_MENU_ITEM',
      payload: { ...form, price: Number(form.price), sort_order: Number(form.sort_order) || 0 },
    })
    setItemModal(null)
  }
  function deleteItem(id) {
    if (window.confirm('Delete this item?')) dispatch({ type: 'DELETE_MENU_ITEM', payload: id })
  }
  function moveItem(item, direction) {
    const idx = filteredItems.findIndex(i => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= filteredItems.length) return
    dispatch({ type: 'REORDER_MENU_ITEM', payload: { idA: item.id, idB: filteredItems[swapIdx].id } })
  }

  // ── Category CRUD ──────────────────────────────────────────────────────────
  function openNewCat() {
    const maxOrder = realSortedCats.length > 0
      ? Math.max(...realSortedCats.map(c => c.sort_order ?? 0))
      : 0
    setCatForm({ ...blankCat, id: 'c' + Date.now(), sort_order: maxOrder + 1 })
    setCatModal('new')
  }
  function openEditCat(c) { setCatForm({ ...c, sort_order: c.sort_order ?? 0 }); setCatModal('edit') }
  function saveCat() {
    if (!catForm.name_uz) return
    dispatch({
      type: catModal === 'new' ? 'ADD_CATEGORY' : 'UPDATE_CATEGORY',
      payload: { ...catForm, sort_order: Number(catForm.sort_order) || 0 },
    })
    setCatModal(null)
  }
  function deleteCat(id) {
    if (id === 'all') return
    if (window.confirm('Delete category?')) dispatch({ type: 'DELETE_CATEGORY', payload: id })
  }
  function moveCat(cat, direction) {
    const idx = realSortedCats.findIndex(c => c.id === cat.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= realSortedCats.length) return
    dispatch({ type: 'REORDER_CATEGORY', payload: { idA: cat.id, idB: realSortedCats[swapIdx].id } })
  }

  function setF(key)  { return e => setForm(f => ({ ...f, [key]: e.target.value })) }
  function setCF(key) { return e => setCatForm(f => ({ ...f, [key]: e.target.value })) }

  return (
    <AppShell title={t(lang, 'menu')}>
      {/* Tabs — flush against header, no top gap */}
      <div className="flex bg-white border-b border-gray-100 sticky top-[52px] z-10">
        {[['items', t(lang, 'menuItems')], ['categories', t(lang, 'categories')]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${
              tab === key ? 'text-[#ff5a00] border-[#ff5a00]' : 'text-gray-400 border-transparent hover:text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-5 pt-3 pb-6 max-w-4xl mx-auto">
        {/* ── Menu Items tab ── */}
        {tab === 'items' && (
          <>
            <div className="flex items-center justify-between mb-3">
              {/* Category filter pills */}
              <div className="flex gap-2 overflow-x-auto scrollbar-none pb-0.5 flex-1 mr-4">
                {sortedCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCat(cat.id)}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      activeCat === cat.id
                        ? 'bg-[#ff5a00] text-white'
                        : 'bg-white border border-gray-200 text-gray-500 hover:border-orange-200'
                    }`}
                  >
                    {getCategoryName(cat, lang)}
                  </button>
                ))}
              </div>
              <button
                onClick={openNewItem}
                className="flex-shrink-0 bg-[#ff5a00] text-white rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200"
              >
                <Plus size={15} /> {t(lang, 'addItem')}
              </button>
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <UtensilsCrossed size={40} className="mx-auto mb-3 opacity-20" />
                <p>No items in this category</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                {filteredItems.map((item, idx) => {
                  const isFirst = idx === 0
                  const isLast  = idx === filteredItems.length - 1
                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                    >
                      {/* Image */}
                      {item.image_url ? (
                        <img src={item.image_url} alt={getItemName(item, lang)} className="w-full h-44 object-cover" />
                      ) : (
                        <div className="w-full h-44 bg-orange-50 flex items-center justify-center">
                          <UtensilsCrossed size={32} className="text-orange-200" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="p-4 flex flex-col flex-1">
                        <p className="font-bold text-gray-900 text-sm leading-snug mb-0.5">{getItemName(item, lang)}</p>
                        <p className="text-[#ff5a00] font-black text-sm mb-2">{formatCurrency(item.price)}</p>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full w-fit ${
                          item.available ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                        }`}>
                          {item.available ? 'Available' : 'Hidden'}
                        </span>

                        {/* Actions: order controls + edit/delete */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                          {/* ↑ ↓ */}
                          <div className="flex gap-1">
                            <OrderBtn icon={ChevronUp}   onClick={() => moveItem(item, 'up')}   disabled={isFirst} />
                            <OrderBtn icon={ChevronDown} onClick={() => moveItem(item, 'down')} disabled={isLast} />
                          </div>
                          {/* edit / delete */}
                          <button
                            onClick={() => openEditItem(item)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-[#ff5a00] transition-colors text-xs font-semibold"
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500 transition-colors text-xs font-semibold"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Categories tab ── */}
        {tab === 'categories' && (
          <>
            <div className="flex justify-end mb-3">
              <button
                onClick={openNewCat}
                className="bg-[#ff5a00] text-white rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200"
              >
                <Plus size={15} /> {t(lang, 'addCategory')}
              </button>
            </div>
            <div className="space-y-2">
              {realSortedCats.map((cat, idx) => {
                const isFirst = idx === 0
                const isLast  = idx === realSortedCats.length - 1
                return (
                  <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                    {cat.image_url ? (
                      <img src={cat.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-xl flex-shrink-0">🍽️</div>
                    )}
                    <p className="flex-1 font-bold text-sm text-gray-900">{getCategoryName(cat, lang)}</p>
                    <p className="text-xs text-gray-400 mr-1">
                      {state.menuItems.filter(i => i.category_id === cat.id).length} items
                    </p>
                    {/* ↑ ↓ */}
                    <div className="flex gap-1 flex-shrink-0">
                      <OrderBtn icon={ChevronUp}   onClick={() => moveCat(cat, 'up')}   disabled={isFirst} />
                      <OrderBtn icon={ChevronDown} onClick={() => moveCat(cat, 'down')} disabled={isLast} />
                    </div>
                    {/* divider */}
                    <div className="w-px h-5 bg-gray-100 flex-shrink-0" />
                    {/* edit / delete */}
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEditCat(cat)} className="p-2 rounded-xl hover:bg-orange-50 text-gray-300 hover:text-[#ff5a00] transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteCat(cat.id)} className="p-2 rounded-xl hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Item modal ── */}
      {itemModal && (
        <Modal title={itemModal === 'new' ? t(lang, 'addItem') : t(lang, 'editItem')} onClose={() => setItemModal(null)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1.5">{t(lang, 'category')}</label>
              <select
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
              >
                <option value="">— {t(lang, 'category')} —</option>
                {realSortedCats.map(c => (
                  <option key={c.id} value={c.id}>{getCategoryName(c, lang)}</option>
                ))}
              </select>
            </div>
            <Field label={t(lang, 'nameUz')} value={form.name_uz} onChange={setF('name_uz')} />
            <Field label={t(lang, 'nameRu')} value={form.name_ru} onChange={setF('name_ru')} />
            <Field label={t(lang, 'nameEn')} value={form.name_en} onChange={setF('name_en')} />
            <Field label={t(lang, 'descUz')} value={form.description_uz} onChange={setF('description_uz')} />
            <Field label={t(lang, 'descRu')} value={form.description_ru} onChange={setF('description_ru')} />
            <Field label={t(lang, 'descEn')} value={form.description_en} onChange={setF('description_en')} />
            <Field label={`${t(lang, 'price')} (UZS)`} type="number" value={form.price} onChange={setF('price')} placeholder="25000" />
            <Field label={t(lang, 'imageUrl')} value={form.image_url} onChange={setF('image_url')} placeholder="https://..." />
            <Field label="Sort order" type="number" value={form.sort_order} onChange={setF('sort_order')} placeholder="1" />
            <div className="flex items-center gap-2 pt-1">
              <input
                id="avail"
                type="checkbox"
                checked={form.available}
                onChange={e => setForm(f => ({ ...f, available: e.target.checked }))}
                className="accent-[#ff5a00] w-4 h-4"
              />
              <label htmlFor="avail" className="text-sm text-gray-700 font-medium">{t(lang, 'available_item')}</label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setItemModal(null)} className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                {t(lang, 'cancel')}
              </button>
              <button onClick={saveItem} className="flex-1 bg-[#ff5a00] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200">
                {t(lang, 'save')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Category modal ── */}
      {catModal && (
        <Modal title={catModal === 'new' ? t(lang, 'addCategory') : 'Edit Category'} onClose={() => setCatModal(null)}>
          <div className="space-y-3">
            <Field label={t(lang, 'nameUz')} value={catForm.name_uz} onChange={setCF('name_uz')} />
            <Field label={t(lang, 'nameRu')} value={catForm.name_ru} onChange={setCF('name_ru')} />
            <Field label={t(lang, 'nameEn')} value={catForm.name_en} onChange={setCF('name_en')} />
            <Field label={t(lang, 'imageUrl')} value={catForm.image_url} onChange={setCF('image_url')} placeholder="https://..." />
            <Field label="Sort order" type="number" value={catForm.sort_order} onChange={setCF('sort_order')} placeholder="1" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setCatModal(null)} className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                {t(lang, 'cancel')}
              </button>
              <button onClick={saveCat} className="flex-1 bg-[#ff5a00] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200">
                {t(lang, 'save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  )
}
