import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { deleteProfile, getAllProfiles, updateProfile } from '../lib/supabase'
import AppShell from '../components/AppShell'
import StatusBadge from '../components/StatusBadge'
import {
  FEATURE_DEFINITIONS,
  assignableRoles,
  canDeleteTeamMember,
  canEditTeamMember,
  canManageFeatureAccess,
  featureAccessForProfile,
} from '../lib/permissions'
import { Search, RefreshCw, UserCircle2, Loader2, Eye, Trash2, X, Check, ShieldCheck, ChevronDown } from 'lucide-react'

const STATUSES = ['pending', 'active', 'disabled']
const ROLES = ['owner', 'admin', 'waiter', 'cashier', 'stakeholder', 'guest']

const STATUS_LABELS = {
  pending:  { uz: 'Kutilmoqda', ru: 'Ожидает',   en: 'Pending'  },
  active:   { uz: 'Faol',       ru: 'Активен',   en: 'Active'   },
  disabled: { uz: 'Bloklangan', ru: 'Заблокирован', en: 'Disabled' },
}

const ROLE_LABELS = {
  owner:       { uz: 'Egasi',     ru: 'Владелец',   en: 'Owner' },
  admin:       { uz: 'Admin',     ru: 'Админ',      en: 'Admin' },
  waiter:      { uz: 'Ofitsiant', ru: 'Официант',   en: 'Waiter' },
  cashier:     { uz: 'Kassir',    ru: 'Кассир',     en: 'Cashier' },
  stakeholder: { uz: 'Kuzatuvchi', ru: 'Наблюдатель', en: 'Stakeholder' },
  guest:       { uz: 'Mehmon',    ru: 'Гость',      en: 'Guest' },
}

const L = {
  uz: {
    title:       'Jamoa',
    search:      'Ism yoki email...',
    allStatuses: 'Barcha holatlar',
    refresh:     'Yangilash',
    nameEmail:   'Ism / Email',
    role:        'Rol',
    status:      'Holat',
    accountStatus: 'Hisob holati',
    actions:     'Amallar',
    delete:      'O‘chirish',
    confirmDelete: 'Tasdiqlash',
    cancel:      'Bekor qilish',
    deleteHint:  'Foydalanuvchi profili o‘chiriladi. Eski buyurtmalardagi ismlar saqlanadi.',
    deleteError: 'Foydalanuvchini o‘chirib bo‘lmadi',
    deleted:     'Foydalanuvchi o‘chirildi',
    access:      'Kirish huquqlari',
    accessHelp:  'Bu foydalanuvchi uchun kerakli funksiyalarni yoqing yoki o‘chiring.',
    manageAccess: 'Kirish huquqlari',
    accessSaved: 'Kirish huquqlari saqlandi',
    accessError: 'Kirish huquqlarini saqlab bo‘lmadi',
    noUsers:     'Foydalanuvchilar topilmadi',
    you:         '(siz)',
    members:     n => `${n} ta a'zo`,
  },
  ru: {
    title:       'Команда',
    search:      'Имя или email...',
    allStatuses: 'Все статусы',
    refresh:     'Обновить',
    nameEmail:   'Имя / Email',
    role:        'Роль',
    status:      'Статус',
    accountStatus: 'Статус аккаунта',
    actions:     'Действия',
    delete:      'Удалить',
    confirmDelete: 'Подтвердить',
    cancel:      'Отмена',
    deleteHint:  'Профиль пользователя будет удалён. Имена в старых заказах сохранятся.',
    deleteError: 'Не удалось удалить пользователя',
    deleted:     'Пользователь удалён',
    access:      'Доступы',
    accessHelp:  'Включите или выключите нужные функции для этого пользователя.',
    manageAccess: 'Доступы',
    accessSaved: 'Доступы сохранены',
    accessError: 'Не удалось сохранить доступы',
    noUsers:     'Пользователи не найдены',
    you:         '(вы)',
    members:     n => `${n} участников`,
  },
  en: {
    title:       'Team Members',
    search:      'Search by name or email...',
    allStatuses: 'All statuses',
    refresh:     'Refresh',
    nameEmail:   'Name / Email',
    role:        'Role',
    status:      'Status',
    accountStatus: 'Account Status',
    actions:     'Actions',
    delete:      'Delete',
    confirmDelete: 'Confirm',
    cancel:      'Cancel',
    deleteHint:  'This removes the user profile. Names already stored on old orders stay preserved.',
    deleteError: 'Could not delete user',
    deleted:     'User deleted',
    access:      'Feature access',
    accessHelp:  'Enable or disable the features this specific user should have.',
    manageAccess: 'Feature access',
    accessSaved: 'Feature access saved',
    accessError: 'Could not save feature access',
    noUsers:     'No users found',
    you:         '(you)',
    members:     n => `${n} member${n !== 1 ? 's' : ''}`,
  },
}

export default function AdminUsers() {
  const { profile: myProfile } = useAuth()
  const { state } = useApp()
  const lang   = state.lang
  const l      = L[lang] || L.en
  const myRole = (myProfile?.role || 'guest').toLowerCase()
  const canEditAccess = canManageFeatureAccess(myProfile)

  const [users, setUsers]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [saving, setSaving]             = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deleting, setDeleting]         = useState(null)
  const [notice, setNotice]             = useState(null)
  const [expandedAccessId, setExpandedAccessId] = useState(null)

  async function loadUsers() {
    setLoading(true)
    const { data } = await getAllProfiles()
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  async function handleChange(userId, field, value) {
    const target = users.find(u => u.id === userId)
    if (!target || target.id === myProfile?.id) return
    if (!canEditTeamMember(myRole, target.role)) return
    if (field === 'status' && !STATUSES.includes(value)) return
    if (field === 'role' && !assignableRoles(myRole).includes(value)) return

    // Guard: prevent removing/disabling the last active owner
    if (target?.role === 'owner') {
      const activeOwners = users.filter(u => u.role === 'owner' && u.status !== 'disabled')
      if (field === 'status' && value === 'disabled' && activeOwners.length <= 1) return
      if (field === 'role' && value !== 'owner' && activeOwners.length <= 1) return
    }
    setSaving(userId)
    setNotice(null)
    const { error } = await updateProfile(userId, { [field]: value })
    if (error) {
      setNotice({ tone: 'error', message: error.message || l.accessError })
      setSaving(null)
      return
    }
    setUsers(u => u.map(x => x.id === userId ? { ...x, [field]: value } : x))
    setSaving(null)
  }

  async function handleFeatureAccessChange(user, featureKey, enabled) {
    if (!canEditAccess || user.id === myProfile?.id) return
    const currentAccess = featureAccessForProfile(user)
    const nextAccess = enabled
      ? [...new Set([...currentAccess, featureKey])]
      : currentAccess.filter(key => key !== featureKey)

    setSaving(user.id)
    setNotice(null)
    const { error } = await updateProfile(user.id, { feature_access: nextAccess })
    if (error) {
      setNotice({ tone: 'error', message: error.message || l.accessError })
      setSaving(null)
      return
    }
    setUsers(list => list.map(row => row.id === user.id ? { ...row, feature_access: nextAccess } : row))
    setSaving(null)
    setNotice({ tone: 'success', message: l.accessSaved })
  }

  async function handleDelete(user) {
    if (!canDeleteTeamMember(myProfile, user, user.id === myProfile?.id)) return
    setDeleting(user.id)
    setNotice(null)
    const { error } = await deleteProfile(user.id)
    if (error) {
      setNotice({ tone: 'error', message: error.message || l.deleteError })
      setDeleting(null)
      return
    }
    setUsers(list => list.filter(row => row.id !== user.id))
    setConfirmDeleteId(null)
    setDeleting(null)
    setNotice({ tone: 'success', message: l.deleted })
  }

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || u.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <AppShell title={l.title}>
      <div className="w-full max-w-[1280px] mx-auto px-4 py-5 sm:px-5 lg:px-6">

        {/* Read-only notice for non-editors */}
        {!['owner', 'admin'].includes(myRole) && (
          <div className="flex items-center gap-2.5 mb-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-700">
            <Eye size={15} className="flex-shrink-0" />
            <span className="font-medium">
              {lang === 'uz' ? 'Faqat ko\'rish huquqi — hisob holati va kirish huquqlarini o\'zgartirib bo\'lmaydi.'
               : lang === 'ru' ? 'Только просмотр — изменение статуса аккаунта и доступов недоступно.'
              : 'View-only access — you cannot change account statuses or feature access.'}
            </span>
          </div>
        )}

        {notice && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            notice.tone === 'error'
              ? 'border-red-100 bg-red-50 text-red-700'
              : 'border-green-100 bg-green-50 text-green-700'
          }`}>
            {notice.message}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={l.search}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
          >
            <option value="all">{l.allStatuses}</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{(STATUS_LABELS[s]?.[lang] || STATUS_LABELS[s]?.en) ?? s}</option>
            ))}
          </select>
          <button
            onClick={loadUsers}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {l.refresh}
          </button>
        </div>

        {/* Count */}
        <p className="text-xs text-gray-400 mb-4">{l.members(filtered.length)}</p>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <UserCircle2 size={44} className="mx-auto mb-3 opacity-20" />
            <p>{l.noUsers}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="hidden xl:grid xl:grid-cols-[minmax(240px,1fr)_100px_minmax(540px,580px)] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.nameEmail}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.status}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.actions}</p>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {filtered.map(user => {
                const isMe       = user.id === myProfile?.id
                const isSaving   = saving === user.id
                const canEditRoleStatus = !isMe && canEditTeamMember(myRole, user.role)
                const canDelete  = canDeleteTeamMember(myProfile, user, isMe)
                const isDeleting = deleting === user.id
                const isConfirmingDelete = confirmDeleteId === user.id
                const isAccessExpanded = expandedAccessId === user.id
                const statusLabel = (STATUS_LABELS[user.status]?.[lang] || STATUS_LABELS[user.status]?.en) ?? user.status
                const roleLabel = (ROLE_LABELS[user.role]?.[lang] || ROLE_LABELS[user.role]?.en) ?? user.role
                const roleOptions = assignableRoles(myRole)
                const featureAccess = featureAccessForProfile(user)
                const accessCount = featureAccess.length

                return (
                  <div
                    key={user.id}
                    className={`grid grid-cols-1 xl:grid-cols-[minmax(240px,1fr)_100px_minmax(540px,580px)] gap-3 xl:gap-4 items-center px-4 py-4 sm:px-5 transition-colors ${
                      isSaving ? 'bg-orange-50/50' : 'hover:bg-gray-50/50'
                    }`}
                  >
                    {/* Name / Email */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#1a1a1a]">
                        <span className="text-white text-xs font-black">
                          {(user.full_name || user.email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-sm text-gray-900 truncate">
                            {user.full_name || '—'}
                          </p>
                          {isMe && <span className="text-[10px] text-[#ff5a00] font-bold">{l.you}</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{roleLabel}</p>
                      </div>
                    </div>

                    {/* Current status badge */}
                    <div>
                      <StatusBadge status={user.status} />
                    </div>

                    {/* Actions */}
                    <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 xl:flex-nowrap">
                      {isSaving && <Loader2 size={15} className="animate-spin text-[#ff5a00]" />}
                      {canEditRoleStatus && (
                        <select
                          value={ROLES.includes(user.role) ? user.role : 'guest'}
                          disabled={isSaving}
                          onChange={e => handleChange(user.id, 'role', e.target.value)}
                          className="h-10 w-[124px] flex-shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 disabled:cursor-not-allowed disabled:opacity-50"
                          title={l.role}
                        >
                          {roleOptions.map(role => (
                            <option key={role} value={role}>{(ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.en) ?? role}</option>
                          ))}
                        </select>
                      )}
                      {canEditRoleStatus ? (
                        <select
                          value={user.status || 'pending'}
                          disabled={isSaving}
                          onChange={e => handleChange(user.id, 'status', e.target.value)}
                          className="h-10 w-[124px] flex-shrink-0 rounded-xl border border-gray-200 bg-white px-3 text-xs font-semibold focus:border-[#ff5a00] focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 disabled:cursor-not-allowed disabled:opacity-50"
                          title={l.accountStatus}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{(STATUS_LABELS[s]?.[lang] || STATUS_LABELS[s]?.en) ?? s}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="inline-flex h-10 flex-shrink-0 items-center rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs font-semibold text-gray-600">
                          {statusLabel}
                        </span>
                      )}
                      {canEditAccess && !isMe && (
                        <button
                          type="button"
                          onClick={() => setExpandedAccessId(current => current === user.id ? null : user.id)}
                          className={`inline-flex h-10 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-xs font-black transition-colors ${
                            isAccessExpanded
                              ? 'border-orange-200 bg-orange-50 text-[#ff5a00]'
                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <ShieldCheck size={14} />
                          <span>{l.manageAccess}</span>
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{accessCount}</span>
                          <ChevronDown size={14} className={`transition-transform ${isAccessExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {canDelete && !isConfirmingDelete && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(user.id)
                            setNotice(null)
                          }}
                          disabled={isDeleting}
                          title={l.delete}
                          className="inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 text-xs font-black text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          <span>{l.delete}</span>
                        </button>
                      )}
                      {canDelete && isConfirmingDelete && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDelete(user)}
                            disabled={isDeleting}
                            title={l.confirmDelete}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-600 px-2.5 py-2 text-xs font-black text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            {l.confirmDelete}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={isDeleting}
                            title={l.cancel}
                            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs font-black text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    {canDelete && isConfirmingDelete && (
                      <p className="xl:col-start-3 text-xs font-medium leading-snug text-red-500">
                        {l.deleteHint}
                      </p>
                    )}
                    {canEditAccess && !isMe && isAccessExpanded && (
                      <div className="xl:col-span-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-gray-600">
                              <ShieldCheck size={14} className="text-[#ff5a00]" />
                              {l.access}
                            </p>
                            <p className="mt-0.5 text-xs font-medium leading-snug text-gray-400">{l.accessHelp}</p>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {FEATURE_DEFINITIONS.map(feature => {
                            const enabled = featureAccessForProfile(user).includes(feature.key)
                            return (
                              <label
                                key={feature.key}
                                className={`flex cursor-pointer items-start gap-2 rounded-xl border bg-white p-3 transition-colors ${
                                  enabled ? 'border-orange-200 ring-1 ring-orange-100' : 'border-gray-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  disabled={isSaving}
                                  onChange={event => handleFeatureAccessChange(user, feature.key, event.target.checked)}
                                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#ff5a00] focus:ring-[#ff5a00]"
                                />
                                <span className="min-w-0">
                                  <span className="block text-xs font-black text-gray-900">
                                    {feature.labels[lang] || feature.labels.en}
                                  </span>
                                  <span className="block text-[11px] font-medium leading-snug text-gray-400">
                                    {feature.description[lang] || feature.description.en}
                                  </span>
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
