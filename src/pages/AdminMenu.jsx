import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t, getItemName, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { ArrowLeft, Plus, Edit2, Trash2, X } from 'lucide-react'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <X size={17} className="text-gray-400" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 font-semibold mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all"
      />
    </div>
  )
}

const blankItem = {
  id: '', category_id: '',
  name_uz: '', name_ru: '', name_en: '',
  description_uz: '', description_ru: '', description_en: '',
  price: '', image_url: '', available: true,
}

const blankCat = { id: '', name_uz: '', name_ru: '', name_en: '', image_url: '', sort_order: 99 }

export default function AdminMenu() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const lang = state.lang

  const [tab, setTab] = useState('items')
  const [itemModal, setItemModal] = useState(null)   // null | 'new' | 'edit'
  const [catModal,  setCatModal]  = useState(null)
  const [form,    setForm]    = useState(blankItem)
  const [catForm, setCatForm] = useState(blankCat)

  // ── Item CRUD ──
  function openNewItem()   { setForm({ ...blankItem, id: 'i' + Date.now() }); setItemModal('new') }
  function openEditItem(i) { setForm({ ...i }); setItemModal('edit') }
  function saveItem() {
    if (!form.name_uz || !form.price || !form.category_id) return
    dispatch({ type: itemModal === 'new' ? 'ADD_MENU_ITEM' : 'UPDATE_MENU_ITEM', payload: { ...form, price: Number(form.price) } })
    setItemModal(null)
  }
  function deleteItem(id) {
    if (window.confirm('Delete this item?')) dispatch({ type: 'DELETE_MENU_ITEM', payload: id })
  }

  // ── Category CRUD ──
  function openNewCat()   { setCatForm({ ...blankCat, id: 'c' + Date.now() }); setCatModal('new') }
  function openEditCat(c) { setCatForm({ ...c }); setCatModal('edit') }
  function saveCat() {
    if (!catForm.name_uz) return
    dispatch({ type: catModal === 'new' ? 'ADD_CATEGORY' : 'UPDATE_CATEGORY', payload: catForm })
    setCatModal(null)
  }
  function deleteCat(id) {
    if (id === 'all') return
    if (window.confirm('Delete category?')) dispatch({ type: 'DELETE_CATEGORY', payload: id })
  }

  function setF(key) { return e => setForm(f => ({ ...f, [key]: e.target.value })) }
  function setCF(key) { return e => setCatForm(f => ({ ...f, [key]: e.target.value })) }

  return (
    <div className="min-h-screen bg-orange-50 w-full max-w-full overflow-x-hidden">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <span className="font-black text-gray-900">{t(lang, 'menu')}</span>
        </div>
        <LanguageSwitcher />
      </header>

      {/* Tabs */}
      <div className="flex bg-white border-b border-gray-100 sticky top-[57px] z-10">
        {[['items', t(lang, 'menuItems')], ['categories', t(lang, 'categories')]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              tab === key ? 'text-brand border-b-2 border-brand' : 'text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="p-4 max-w-2xl mx-auto">
        {/* ── Menu Items tab ── */}
        {tab === 'items' && (
          <>
            <div className="flex justify-end mb-3">
              <button
                onClick={openNewItem}
                className="bg-brand text-white rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-brand-dark transition-colors shadow-md shadow-orange-200"
              >
                <Plus size={16} /> {t(lang, 'addItem')}
              </button>
            </div>
            <div className="space-y-2">
              {state.menuItems.map(item => (
                <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  {item.image_url ? (
                    <img src={item.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-xl flex-shrink-0">🍖</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 truncate">{getItemName(item, lang)}</p>
                    <p className="text-xs text-brand font-bold">{formatCurrency(item.price)}</p>
                    <p className={`text-[10px] font-medium ${item.available ? 'text-green-500' : 'text-red-400'}`}>
                      {item.available ? '● Available' : '● Hidden'}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEditItem(item)} className="p-2 rounded-xl hover:bg-orange-50 text-gray-300 hover:text-brand transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteItem(item.id)} className="p-2 rounded-xl hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Categories tab ── */}
        {tab === 'categories' && (
          <>
            <div className="flex justify-end mb-3">
              <button
                onClick={openNewCat}
                className="bg-brand text-white rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-brand-dark transition-colors shadow-md shadow-orange-200"
              >
                <Plus size={16} /> {t(lang, 'addCategory')}
              </button>
            </div>
            <div className="space-y-2">
              {state.categories.filter(c => c.id !== 'all').map(cat => (
                <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-3">
                  {cat.image_url ? (
                    <img src={cat.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-xl flex-shrink-0">🍽️</div>
                  )}
                  <p className="flex-1 font-bold text-sm text-gray-900">{getCategoryName(cat, lang)}</p>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEditCat(cat)} className="p-2 rounded-xl hover:bg-orange-50 text-gray-300 hover:text-brand transition-colors">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteCat(cat.id)} className="p-2 rounded-xl hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Item modal ── */}
      {itemModal && (
        <Modal title={itemModal === 'new' ? t(lang, 'addItem') : t(lang, 'editItem')} onClose={() => setItemModal(null)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">{t(lang, 'category')}</label>
              <select
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              >
                <option value="">— {t(lang, 'category')} —</option>
                {state.categories.filter(c => c.id !== 'all').map(c => (
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
            <div className="flex items-center gap-2 pt-1">
              <input
                id="avail"
                type="checkbox"
                checked={form.available}
                onChange={e => setForm(f => ({ ...f, available: e.target.checked }))}
                className="accent-brand w-4 h-4"
              />
              <label htmlFor="avail" className="text-sm text-gray-700 font-medium">{t(lang, 'available_item')}</label>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setItemModal(null)} className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                {t(lang, 'cancel')}
              </button>
              <button onClick={saveItem} className="flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-bold hover:bg-brand-dark transition-colors shadow-md shadow-orange-200">
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
            <div className="flex gap-2 pt-2">
              <button onClick={() => setCatModal(null)} className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                {t(lang, 'cancel')}
              </button>
              <button onClick={saveCat} className="flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-bold hover:bg-brand-dark transition-colors shadow-md shadow-orange-200">
                {t(lang, 'save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
