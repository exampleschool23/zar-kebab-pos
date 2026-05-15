import React, { useState } from 'react'
import { useApp } from '../store/AppContext'
import { t } from '../lib/i18n'
import AppShell from '../components/AppShell'
import StatusBadge from '../components/StatusBadge'
import { Plus, Edit2, Trash2, X } from 'lucide-react'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <X size={17} className="text-gray-400" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

const STATUS_OPTIONS = ['available', 'occupied', 'needs_bill']

export default function AdminTables() {
  const { state, dispatch } = useApp()
  const lang = state.lang
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({ id: '', name: '', status: 'available' })

  function openNew()    { setForm({ id: 't' + Date.now(), name: '', status: 'available' }); setModal('new') }
  function openEdit(tb) { setForm({ ...tb }); setModal('edit') }
  function save() {
    if (!form.name.trim()) return
    dispatch({ type: modal === 'new' ? 'ADD_TABLE' : 'UPDATE_TABLE', payload: form })
    setModal(null)
  }
  function del(id) {
    if (window.confirm('Delete this table?')) dispatch({ type: 'DELETE_TABLE', payload: id })
  }

  const available = state.tables.filter(t => t.status === 'available').length
  const occupied  = state.tables.filter(t => t.status === 'occupied').length
  const needsBill = state.tables.filter(t => t.status === 'needs_bill').length

  return (
    <AppShell title={t(lang, 'tables')}>
      <div className="p-5 max-w-3xl mx-auto">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Available', count: available, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Occupied',  count: occupied,  color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Needs Bill', count: needsBill, color: 'text-red-600',   bg: 'bg-red-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Add button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={openNew}
            className="bg-[#ff5a00] text-white rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200"
          >
            <Plus size={15} /> Add Table
          </button>
        </div>

        {/* Table list */}
        <div className="space-y-2">
          {state.tables.map(table => (
            <div
              key={table.id}
              className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">{table.name}</p>
              </div>
              <StatusBadge status={table.status} />
              <div className="flex gap-1 flex-shrink-0 ml-2">
                <button
                  onClick={() => openEdit(table)}
                  className="p-2 rounded-xl hover:bg-orange-50 text-gray-300 hover:text-[#ff5a00] transition-colors"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={() => del(table.id)}
                  className="p-2 rounded-xl hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Add Table' : 'Edit Table'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1.5">Table Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Table 11"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 font-semibold mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
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
              <button onClick={save} className="flex-1 bg-[#ff5a00] text-white rounded-xl py-2.5 text-sm font-bold hover:bg-[#cc4800] transition-colors shadow-md shadow-orange-200">
                {t(lang, 'save')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  )
}
