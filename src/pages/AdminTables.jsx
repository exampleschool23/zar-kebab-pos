import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { ArrowLeft, Plus, Edit2, Trash2, X } from 'lucide-react'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={17} className="text-gray-400" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

const STATUS_OPTIONS = ['available', 'occupied', 'needs_bill']

function dotColor(s) {
  if (s === 'available')  return 'bg-green-400'
  if (s === 'occupied')   return 'bg-orange-400'
  if (s === 'needs_bill') return 'bg-red-400'
  return 'bg-gray-400'
}

export default function AdminTables() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const lang = state.lang
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ id: '', name: '', status: 'available' })

  function openNew()   { setForm({ id: 't' + Date.now(), name: '', status: 'available' }); setModal('new') }
  function openEdit(t) { setForm({ ...t }); setModal('edit') }
  function save() {
    if (!form.name.trim()) return
    dispatch({ type: modal === 'new' ? 'ADD_TABLE' : 'UPDATE_TABLE', payload: form })
    setModal(null)
  }
  function del(id) {
    if (window.confirm('Delete this table?')) dispatch({ type: 'DELETE_TABLE', payload: id })
  }

  return (
    <div className="min-h-screen bg-orange-50 w-full max-w-full overflow-x-hidden">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <span className="font-black text-gray-900">{t(lang, 'tables')}</span>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="p-4 max-w-2xl mx-auto">
        <div className="flex justify-end mb-3">
          <button
            onClick={openNew}
            className="bg-brand text-white rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-1.5 hover:bg-brand-dark transition-colors shadow-md shadow-orange-200"
          >
            <Plus size={16} /> Add Table
          </button>
        </div>

        <div className="space-y-2">
          {state.tables.map(table => (
            <div key={table.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3 hover:shadow-sm transition-shadow">
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${dotColor(table.status)}`} />
              <p className="flex-1 font-bold text-gray-900">{table.name}</p>
              <p className="text-xs text-gray-400">
                {table.status === 'needs_bill' ? t(lang, 'needsBill') : t(lang, table.status)}
              </p>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(table)} className="p-2 rounded-xl hover:bg-orange-50 text-gray-300 hover:text-brand transition-colors">
                  <Edit2 size={14} />
                </button>
                <button onClick={() => del(table.id)} className="p-2 rounded-xl hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {modal && (
        <Modal title={modal === 'new' ? 'Add Table' : 'Edit Table'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Table Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Table 11"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
              >
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>
                    {s === 'needs_bill' ? t(lang, 'needsBill') : t(lang, s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setModal(null)} className="flex-1 border-2 border-gray-200 rounded-xl py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                {t(lang, 'cancel')}
              </button>
              <button onClick={save} className="flex-1 bg-brand text-white rounded-xl py-2.5 text-sm font-bold hover:bg-brand-dark transition-colors shadow-md shadow-orange-200">
                {t(lang, 'save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
