import React, { useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, X, Table2, MapPin, Users, Hash, Power, PowerOff, Layers, CalendarClock } from 'lucide-react'
import { useApp } from '../store/AppContext'
import AppShell from '../components/AppShell'
import { canDeleteTable, canDisableTable } from '../lib/tableManagement'

const DEFAULT_ZONES = ['Main Hall', 'VIP', 'Outdoor', 'Second Floor']

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `zone-${Date.now()}`
}

function makeTableId(name) {
  const suffix = slugify(name).slice(0, 36)
  return `tbl-${suffix}-${Date.now().toString(36)}`
}

function normalizeTable(table, zones = []) {
  const zone = zones.find(z => z.id === table.zone_id || z.name === table.zone_name)
  return {
    id: table.id || '',
    name: table.name || '',
    zone_id: table.zone_id || zone?.id || '',
    zone_name: table.zone_name || zone?.name || 'Main Hall',
    capacity: Number(table.capacity) || 4,
    sort_order: Number(table.sort_order) || 0,
    status: table.status || 'available',
    is_active: table.is_active !== false,
    reserved_for_name: table.reserved_for_name || '',
    reserved_for_phone: table.reserved_for_phone || '',
    reserved_at: table.reserved_at ? String(table.reserved_at).slice(0, 16) : '',
    reserved_until: table.reserved_until ? String(table.reserved_until).slice(0, 16) : '',
    reservation_notes: table.reservation_notes || '',
  }
}

function Modal({ title, description, onClose, children, maxWidth = 'sm:max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white w-full ${maxWidth} rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-black text-gray-900">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <X size={17} className="text-gray-400" />
          </button>
        </div>
        <div className="max-h-[calc(92dvh-76px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}

function Toggle({ value, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${value ? 'bg-[#ff5a00]' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-gray-500">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}
    </label>
  )
}

function StatusPill({ table }) {
  if (table.is_active === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11px] font-black text-gray-500">
        <PowerOff size={11} /> Disabled
      </span>
    )
  }
  if (table.status === 'reserved') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-black text-purple-700">
        <CalendarClock size={11} /> Reserved
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
      <Power size={11} /> Active
    </span>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const tones = {
    orange: 'bg-orange-50 text-[#ff5a00]',
    green: 'bg-emerald-50 text-emerald-600',
    gray: 'bg-gray-100 text-gray-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone] || tones.gray}`}>
        <Icon size={17} />
      </div>
      <p className="text-2xl font-black leading-none text-[#1F2937]">{value}</p>
      <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  )
}

export default function AdminTables() {
  const { state, dispatch } = useApp()
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(() => normalizeTable({}))
  const [zoneName, setZoneName] = useState('')
  const [zoneError, setZoneError] = useState('')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const tableZones = useMemo(() => {
    const stored = state.tableZones || []
    const names = new Map()
    stored.forEach(zone => names.set(zone.name.toLowerCase(), zone))
    state.tables.forEach(table => {
      const name = table.zone_name || 'Main Hall'
      if (!names.has(name.toLowerCase())) {
        names.set(name.toLowerCase(), {
          id: slugify(name),
          name,
          sort_order: 999,
          is_active: true,
        })
      }
    })
    DEFAULT_ZONES.forEach((name, index) => {
      if (!names.has(name.toLowerCase())) {
        names.set(name.toLowerCase(), {
          id: slugify(name),
          name,
          sort_order: index + 1,
          is_active: true,
        })
      }
    })
    return [...names.values()]
      .filter(zone => zone.is_active !== false)
      .sort((a, b) => (Number(a.sort_order) || 999) - (Number(b.sort_order) || 999) || a.name.localeCompare(b.name))
  }, [state.tableZones, state.tables])

  const sortedTables = useMemo(() =>
    [...state.tables].sort((a, b) =>
      (Number(a.sort_order) || 9999) - (Number(b.sort_order) || 9999) ||
      String(a.zone_name || '').localeCompare(String(b.zone_name || '')) ||
      String(a.name || '').localeCompare(String(b.name || ''))
    ),
    [state.tables]
  )

  const orderStats = useMemo(() => {
    const active = new Set()
    const history = new Set()
    state.orders.forEach(order => {
      if (!order.table_id) return
      history.add(order.table_id)
      if (order.payment_status !== 'paid' && order.status !== 'cancelled') active.add(order.table_id)
    })
    return { active, history }
  }, [state.orders])

  const activeCount = state.tables.filter(table => table.is_active !== false).length
  const disabledCount = state.tables.length - activeCount
  const reservedCount = state.tables.filter(table => table.is_active !== false && table.status === 'reserved').length

  function openNew() {
    const nextSort = state.tables.reduce((max, table) => Math.max(max, Number(table.sort_order) || 0), 0) + 1
    const firstZone = tableZones[0] || { id: 'main-hall', name: 'Main Hall' }
    setForm(normalizeTable({
      id: '',
      name: '',
      zone_id: firstZone.id,
      zone_name: firstZone.name,
      capacity: 4,
      sort_order: nextSort,
      status: 'available',
      is_active: true,
      reserved_for_name: '',
      reserved_for_phone: '',
      reserved_at: '',
      reserved_until: '',
      reservation_notes: '',
    }, tableZones))
    setErrors({})
    setModal('new')
  }

  function openEdit(table) {
    setForm(normalizeTable(table, tableZones))
    setErrors({})
    setModal('edit')
  }

  function validate(nextForm) {
    const nextErrors = {}
    const name = nextForm.name.trim()
    if (!name) nextErrors.name = 'Table name is required'
    const duplicate = state.tables.some(table =>
      table.id !== nextForm.id && table.name.trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicate) nextErrors.name = 'Table name must be unique'
    if (!Number.isFinite(Number(nextForm.capacity)) || Number(nextForm.capacity) <= 0) {
      nextErrors.capacity = 'Capacity should be a positive number'
    }
    if (!Number.isFinite(Number(nextForm.sort_order))) {
      nextErrors.sort_order = 'Sort order should be a number'
    }
    if (!nextForm.zone_name.trim()) nextErrors.zone = 'Zone / section is required'
    if (nextForm.status === 'reserved') {
      if (!nextForm.reserved_for_name.trim()) nextErrors.reserved_for_name = 'Guest name is required for reservations'
      if (!nextForm.reserved_at) nextErrors.reserved_at = 'Reservation time is required'
      if (nextForm.reserved_until && nextForm.reserved_at && new Date(nextForm.reserved_until) <= new Date(nextForm.reserved_at)) {
        nextErrors.reserved_until = 'End time should be after reservation time'
      }
    }
    return nextErrors
  }

  function updateZone(zoneId) {
    const zone = tableZones.find(z => z.id === zoneId)
    setForm(current => ({
      ...current,
      zone_id: zone?.id || '',
      zone_name: zone?.name || current.zone_name,
    }))
  }

  async function save() {
    const selectedZone = tableZones.find(z => z.id === form.zone_id || z.name === form.zone_name)
    const payload = {
      ...form,
      id: form.id || makeTableId(form.name),
      name: form.name.trim(),
      zone_id: selectedZone?.id || slugify(form.zone_name),
      zone_name: selectedZone?.name || form.zone_name.trim(),
      capacity: Math.max(1, Math.round(Number(form.capacity) || 1)),
      sort_order: Math.round(Number(form.sort_order) || 0),
      status: form.is_active === false ? 'available' : form.status || 'available',
      is_active: form.is_active !== false,
      reserved_for_name: form.is_active !== false && form.status === 'reserved' ? form.reserved_for_name.trim() : '',
      reserved_for_phone: form.is_active !== false && form.status === 'reserved' ? form.reserved_for_phone.trim() : '',
      reserved_at: form.is_active !== false && form.status === 'reserved' && form.reserved_at ? form.reserved_at : null,
      reserved_until: form.is_active !== false && form.status === 'reserved' && form.reserved_until ? form.reserved_until : null,
      reservation_notes: form.is_active !== false && form.status === 'reserved' ? form.reservation_notes.trim() : '',
    }
    const nextErrors = validate(payload)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const result = await dispatch({ type: modal === 'new' ? 'ADD_TABLE' : 'UPDATE_TABLE', payload })
    if (result?.error) {
      setNotice({ tone: 'error', message: result.error.message || 'Could not save table' })
      return
    }
    setModal(null)
    setNotice({ tone: 'success', message: modal === 'new' ? 'Table added' : 'Table updated' })
  }

  async function addZone() {
    const name = zoneName.trim()
    setZoneError('')
    if (!name) {
      setZoneError('Zone name is required')
      return
    }
    if (tableZones.some(zone => zone.name.toLowerCase() === name.toLowerCase())) {
      setZoneError('Zone name must be unique')
      return
    }
    const payload = {
      id: slugify(name),
      name,
      sort_order: tableZones.reduce((max, zone) => Math.max(max, Number(zone.sort_order) || 0), 0) + 1,
      is_active: true,
    }
    const result = await dispatch({ type: 'ADD_TABLE_ZONE', payload })
    if (result?.error) {
      setZoneError(result.error.message || 'Could not add zone')
      return
    }
    setZoneName('')
    setNotice({ tone: 'success', message: 'Zone added' })
  }

  function requestDisable(table) {
    const check = canDisableTable(table, state.orders)
    if (!check.ok && check.reason === 'active_orders') {
      setNotice({ tone: 'error', message: 'Close active orders before disabling this table.' })
      return
    }
    setConfirm({
      title: `Disable ${table.name}?`,
      message: 'Disabled tables stay visible here, keep their history, and disappear from the waiter Tables screen.',
      actionLabel: 'Disable table',
      tone: 'orange',
      onConfirm: async () => {
        const result = await dispatch({
          type: 'UPDATE_TABLE',
          payload: {
            ...table,
            is_active: false,
            status: 'available',
            reserved_for_name: '',
            reserved_for_phone: '',
            reserved_at: null,
            reserved_until: null,
            reservation_notes: '',
          },
        })
        if (result?.error) {
          setNotice({ tone: 'error', message: result.error.message || 'Could not disable table' })
        } else {
          setNotice({ tone: 'success', message: `${table.name} disabled` })
        }
        setConfirm(null)
      },
    })
  }

  function requestDelete(table) {
    const check = canDeleteTable(table, state.orders)
    if (!check.ok && check.reason === 'active_orders') {
      setNotice({ tone: 'error', message: 'Do not delete a table while it has active orders.' })
      return
    }
    if (!check.ok && check.reason === 'order_history') {
      setNotice({ tone: 'error', message: 'This table has order history. You can disable it instead.' })
      return
    }
    setConfirm({
      title: `Delete ${table.name}?`,
      message: 'This permanently removes the table. This is only allowed because it has no order history.',
      actionLabel: 'Delete table',
      tone: 'red',
      onConfirm: async () => {
        const result = await dispatch({ type: 'DELETE_TABLE', payload: table.id })
        if (result?.error) {
          setNotice({ tone: 'error', message: result.error.message || 'Could not delete table' })
        } else {
          setNotice({ tone: 'success', message: `${table.name} deleted` })
        }
        setConfirm(null)
      },
    })
  }

  return (
    <AppShell title="Tables">
      <div className="mx-auto max-w-[1180px] px-5 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#1F2937]">Tables</h1>
            <p className="mt-0.5 text-sm text-[#6B7280]">Manage restaurant tables, zones, and availability</p>
          </div>
          <button
            onClick={openNew}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#ff5a00] px-4 text-sm font-black text-white shadow-lg shadow-orange-100 transition-colors hover:bg-[#cc4800]"
          >
            <Plus size={16} />
            Add table
          </button>
        </div>

        {notice && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
            notice.tone === 'error'
              ? 'border-red-100 bg-red-50 text-red-700'
              : 'border-emerald-100 bg-emerald-50 text-emerald-700'
          }`}>
            {notice.message}
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard icon={Table2} label="Tables" value={state.tables.length} tone="orange" />
          <SummaryCard icon={Power} label="Active" value={activeCount} tone="green" />
          <SummaryCard icon={CalendarClock} label="Reserved" value={reservedCount} tone="purple" />
          <SummaryCard icon={PowerOff} label="Disabled" value={disabledCount} tone="gray" />
        </div>

        <div className="mb-5 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[#1F2937]">Zones</p>
              <p className="text-xs text-gray-500">Create sections like Main Hall, VIP, Outdoor, or Second Floor.</p>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {tableZones.map(zone => (
              <span key={zone.id} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {zone.name}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={zoneName}
              onChange={e => setZoneName(e.target.value)}
              placeholder="Add zone, e.g. Patio"
              className="h-10 flex-1 rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
            />
            <button
              onClick={addZone}
              className="h-10 rounded-xl border border-[#E5E7EB] bg-gray-50 px-4 text-sm font-black text-[#1F2937] transition-colors hover:bg-gray-100"
            >
              Add zone
            </button>
          </div>
          {zoneError && <p className="mt-2 text-xs font-bold text-red-600">{zoneError}</p>}
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="hidden grid-cols-[1.3fr_1fr_0.7fr_1fr_0.7fr_120px] gap-3 border-b border-[#F3F4F6] bg-gray-50 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-gray-400 md:grid">
            <span>Table name</span>
            <span>Zone / section</span>
            <span>Capacity</span>
            <span>Status</span>
            <span>Sort order</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-[#F3F4F6]">
            {sortedTables.map(table => {
              const activeOrders = orderStats.active.has(table.id)
              const hasHistory = orderStats.history.has(table.id)
              return (
                <div key={table.id} className={`grid gap-3 px-4 py-4 md:grid-cols-[1.3fr_1fr_0.7fr_1fr_0.7fr_120px] md:items-center ${table.is_active === false ? 'bg-gray-50/70' : 'bg-white'}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#1F2937]">{table.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400 md:hidden">{table.zone_name || 'Main Hall'} · sort {Number(table.sort_order) || 0}</p>
                    {activeOrders && <p className="mt-1 text-xs font-bold text-orange-600">Has active orders</p>}
                    {!activeOrders && hasHistory && <p className="mt-1 text-xs font-semibold text-gray-400">Has order history</p>}
                    {table.status === 'reserved' && table.reserved_for_name && (
                      <p className="mt-1 text-xs font-bold text-purple-600">{table.reserved_for_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-600">
                    <MapPin size={14} className="text-gray-300" />
                    {table.zone_name || 'Main Hall'}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-600">
                    <Users size={14} className="text-gray-300" />
                    {Number(table.capacity) || 4}
                  </div>
                  <div>
                    <StatusPill table={table} />
                    {table.status === 'reserved' && table.reserved_at && (
                      <p className="mt-1 text-xs font-semibold text-gray-400">{new Date(table.reserved_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</p>
                    )}
                  </div>
                  <div className="hidden items-center gap-1.5 text-sm font-semibold text-gray-600 md:flex">
                    <Hash size={14} className="text-gray-300" />
                    {Number(table.sort_order) || 0}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(table)}
                      className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-orange-50 hover:text-[#ff5a00]"
                      title="Edit"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => openEdit({ ...table, status: 'reserved' })}
                      disabled={activeOrders || table.is_active === false}
                      className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-purple-50 hover:text-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Reserve"
                    >
                      <CalendarClock size={15} />
                    </button>
                    <button
                      onClick={() => requestDisable(table)}
                      disabled={table.is_active === false}
                      className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                      title="Disable"
                    >
                      <PowerOff size={15} />
                    </button>
                    <button
                      onClick={() => requestDelete(table)}
                      className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {modal && (
        <Modal
          title={modal === 'new' ? 'Add table' : 'Edit table'}
          description="Set table name, zone, capacity, ordering, and availability."
          onClose={() => setModal(null)}
        >
          <div className="space-y-4">
            <Field label="Table name" error={errors.name}>
              <input
                value={form.name}
                onChange={e => setForm(current => ({ ...current, name: e.target.value }))}
                placeholder="Table 1, VIP 1, Outdoor 3"
                className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
              />
            </Field>

            <Field label="Zone / section" error={errors.zone}>
              <select
                value={form.zone_id}
                onChange={e => updateZone(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
              >
                {tableZones.map(zone => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Capacity" error={errors.capacity}>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={e => setForm(current => ({ ...current, capacity: e.target.value }))}
                  placeholder="4"
                  className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                />
              </Field>
              <Field label="Sort order" error={errors.sort_order}>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={e => setForm(current => ({ ...current, sort_order: e.target.value }))}
                  placeholder="1"
                  className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                />
              </Field>
            </div>

            <div className="rounded-2xl border border-[#E5E7EB] bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#1F2937]">Reserved</p>
                  <p className="text-xs text-gray-500">Capture guest details for this table reservation.</p>
                </div>
                <Toggle
                  value={form.status === 'reserved'}
                  onChange={value => setForm(current => ({
                    ...current,
                    status: value ? 'reserved' : 'available',
                    reserved_for_name: value ? current.reserved_for_name : '',
                    reserved_for_phone: value ? current.reserved_for_phone : '',
                    reserved_at: value ? current.reserved_at : '',
                    reserved_until: value ? current.reserved_until : '',
                    reservation_notes: value ? current.reservation_notes : '',
                  }))}
                  disabled={modal === 'edit' && orderStats.active.has(form.id)}
                />
              </div>
              {form.status === 'reserved' && (
                <div className="grid gap-3">
                  <Field label="Guest name" error={errors.reserved_for_name}>
                    <input
                      value={form.reserved_for_name}
                      onChange={e => setForm(current => ({ ...current, reserved_for_name: e.target.value }))}
                      placeholder="Customer name"
                      className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Phone">
                      <input
                        value={form.reserved_for_phone}
                        onChange={e => setForm(current => ({ ...current, reserved_for_phone: e.target.value }))}
                        placeholder="+998..."
                        className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                      />
                    </Field>
                    <Field label="Reservation time" error={errors.reserved_at}>
                      <input
                        type="datetime-local"
                        value={form.reserved_at}
                        onChange={e => setForm(current => ({ ...current, reserved_at: e.target.value }))}
                        className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                      />
                    </Field>
                  </div>
                  <Field label="Reserved until" error={errors.reserved_until}>
                    <input
                      type="datetime-local"
                      value={form.reserved_until}
                      onChange={e => setForm(current => ({ ...current, reserved_until: e.target.value }))}
                      className="h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                    />
                  </Field>
                  <Field label="Notes">
                    <textarea
                      value={form.reservation_notes}
                      onChange={e => setForm(current => ({ ...current, reservation_notes: e.target.value }))}
                      placeholder="Guest preferences, occasion, seating notes..."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm outline-none transition-all focus:border-[#ff5a00] focus:ring-2 focus:ring-[#ff5a00]/15"
                    />
                  </Field>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-[#E5E7EB] bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#1F2937]">Active</p>
                <p className="text-xs text-gray-500">Disabled tables do not appear for waiters.</p>
              </div>
              <Toggle
                value={form.is_active !== false}
                onChange={value => setForm(current => ({ ...current, is_active: value }))}
                disabled={modal === 'edit' && orderStats.active.has(form.id)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setModal(null)}
                className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-black text-gray-600 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                className="h-11 flex-1 rounded-xl bg-[#ff5a00] text-sm font-black text-white shadow-md shadow-orange-100 transition-colors hover:bg-[#cc4800]"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title={confirm.title} description={confirm.message} onClose={() => setConfirm(null)} maxWidth="sm:max-w-md">
          <div className="flex gap-2">
            <button
              onClick={() => setConfirm(null)}
              className="h-11 flex-1 rounded-xl border-2 border-gray-200 text-sm font-black text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={confirm.onConfirm}
              className={`h-11 flex-1 rounded-xl text-sm font-black text-white transition-colors ${
                confirm.tone === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#ff5a00] hover:bg-[#cc4800]'
              }`}
            >
              {confirm.actionLabel}
            </button>
          </div>
        </Modal>
      )}
    </AppShell>
  )
}
