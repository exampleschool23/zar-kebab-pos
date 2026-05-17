import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApp } from '../store/AppContext'
import { getAllProfiles, updateProfile } from '../lib/supabase'
import AppShell from '../components/AppShell'
import StatusBadge from '../components/StatusBadge'
import { canEditTeamMember, assignableRoles } from '../lib/permissions'
import { Search, RefreshCw, UserCircle2, Loader2, Eye } from 'lucide-react'

const ROLES    = ['owner', 'admin', 'waiter', 'cashier', 'kitchen', 'stakeholder', 'guest']
const STATUSES = ['pending', 'active', 'disabled']

const ROLE_LABELS = {
  owner:       { uz: 'Egasi',      ru: 'Владелец',      en: 'Owner'       },
  admin:       { uz: 'Admin',      ru: 'Администратор', en: 'Admin'       },
  waiter:      { uz: 'Ofitsiant',  ru: 'Официант',      en: 'Waiter'      },
  cashier:     { uz: 'Kassir',     ru: 'Кассир',        en: 'Cashier'     },
  kitchen:     { uz: 'Oshxona',    ru: 'Кухня',         en: 'Kitchen'     },
  stakeholder: { uz: 'Stakeholder', ru: 'Стейкхолдер',  en: 'Stakeholder' },
  guest:       { uz: 'Mehmon',     ru: 'Гость',         en: 'Guest'       },
}

const ROLE_BADGE = {
  owner:       'bg-orange-100 text-[#ff5a00] border-orange-200',
  admin:       'bg-blue-100 text-blue-700 border-blue-200',
  waiter:      'bg-green-100 text-green-700 border-green-200',
  cashier:     'bg-teal-100 text-teal-700 border-teal-200',
  kitchen:     'bg-yellow-100 text-yellow-700 border-yellow-200',
  stakeholder: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  guest:       'bg-gray-100 text-gray-600 border-gray-200',
}

const STATUS_LABELS = {
  pending:  { uz: 'Kutilmoqda', ru: 'Ожидает',   en: 'Pending'  },
  active:   { uz: 'Faol',       ru: 'Активен',   en: 'Active'   },
  disabled: { uz: 'Bloklangan', ru: 'Заблокирован', en: 'Disabled' },
}

const L = {
  uz: {
    title:       'Jamoa',
    search:      'Ism yoki email...',
    allRoles:    'Barcha lavozimlar',
    allStatuses: 'Barcha holatlar',
    refresh:     'Yangilash',
    nameEmail:   'Ism / Email',
    status:      'Holat',
    role:        'Lavozim',
    accountStatus: 'Hisob holati',
    noUsers:     'Foydalanuvchilar topilmadi',
    you:         '(siz)',
    members:     n => `${n} ta a'zo`,
  },
  ru: {
    title:       'Команда',
    search:      'Имя или email...',
    allRoles:    'Все роли',
    allStatuses: 'Все статусы',
    refresh:     'Обновить',
    nameEmail:   'Имя / Email',
    status:      'Статус',
    role:        'Роль',
    accountStatus: 'Статус аккаунта',
    noUsers:     'Пользователи не найдены',
    you:         '(вы)',
    members:     n => `${n} участников`,
  },
  en: {
    title:       'Team Members',
    search:      'Search by name or email...',
    allRoles:    'All roles',
    allStatuses: 'All statuses',
    refresh:     'Refresh',
    nameEmail:   'Name / Email',
    status:      'Status',
    role:        'Role',
    accountStatus: 'Account Status',
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
  const myRole = myProfile?.role || 'waiter'

  // Roles the current viewer is allowed to assign in dropdowns
  const allowedRoles = assignableRoles(myRole)

  const [users, setUsers]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [roleFilter, setRoleFilter]     = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [saving, setSaving]             = useState(null)

  async function loadUsers() {
    setLoading(true)
    const { data } = await getAllProfiles()
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  async function handleChange(userId, field, value) {
    const target = users.find(u => u.id === userId)
    // Guard: prevent removing/disabling the last active owner
    if (target?.role === 'owner') {
      const activeOwners = users.filter(u => u.role === 'owner' && u.status !== 'disabled')
      if (field === 'role'   && value !== 'owner'    && activeOwners.length <= 1) return
      if (field === 'status' && value === 'disabled' && activeOwners.length <= 1) return
    }
    setSaving(userId)
    await updateProfile(userId, { [field]: value })
    setUsers(u => u.map(x => x.id === userId ? { ...x, [field]: value } : x))
    setSaving(null)
  }

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole   = roleFilter   === 'all' || u.role   === roleFilter
    const matchStatus = statusFilter === 'all' || u.status === statusFilter
    return matchSearch && matchRole && matchStatus
  })

  return (
    <AppShell title={l.title}>
      <div className="p-5 max-w-5xl mx-auto">

        {/* Read-only notice for non-editors */}
        {!['owner', 'admin'].includes(myRole) && (
          <div className="flex items-center gap-2.5 mb-4 px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl text-sm text-blue-700">
            <Eye size={15} className="flex-shrink-0" />
            <span className="font-medium">
              {lang === 'uz' ? 'Faqat ko\'rish huquqi — rollarni o\'zgartirib bo\'lmaydi.'
               : lang === 'ru' ? 'Только просмотр — изменение ролей недоступно.'
               : 'View-only access — you cannot change roles or account statuses.'}
            </span>
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
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
          >
            <option value="all">{l.allRoles}</option>
            {ROLES.map(r => (
              <option key={r} value={r}>{(ROLE_LABELS[r]?.[lang] || ROLE_LABELS[r]?.en) ?? r}</option>
            ))}
          </select>
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
            <div className="hidden sm:grid grid-cols-[1fr_120px_140px_140px_40px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.nameEmail}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.status}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.role}</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{l.accountStatus}</p>
              <div />
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {filtered.map(user => {
                const isMe       = user.id === myProfile?.id
                const isSaving   = saving === user.id
                // Can this viewer edit this specific user's role/status?
                const canEdit    = !isMe && canEditTeamMember(myRole, user.role)
                const roleLabel  = (ROLE_LABELS[user.role]?.[lang] || ROLE_LABELS[user.role]?.en) ?? user.role
                const statusLabel = (STATUS_LABELS[user.status]?.[lang] || STATUS_LABELS[user.status]?.en) ?? user.status

                return (
                  <div
                    key={user.id}
                    className={`grid grid-cols-1 sm:grid-cols-[1fr_120px_140px_140px_40px] gap-3 sm:gap-4 items-center px-5 py-4 transition-colors ${
                      isSaving ? 'bg-orange-50/50' : 'hover:bg-gray-50/50'
                    }`}
                  >
                    {/* Name / Email */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        user.role === 'stakeholder' ? 'bg-indigo-600' : 'bg-[#1a1a1a]'
                      }`}>
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
                          {user.role === 'stakeholder' && (
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border leading-none ${ROLE_BADGE.stakeholder}`}>
                              Viewer
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                    </div>

                    {/* Current status badge */}
                    <div>
                      <StatusBadge status={user.status} />
                    </div>

                    {/* Role — editable select or read-only badge */}
                    {canEdit ? (
                      <select
                        value={user.role || 'waiter'}
                        disabled={isSaving}
                        onChange={e => handleChange(user.id, 'role', e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] disabled:opacity-50 disabled:cursor-not-allowed w-full"
                      >
                        {allowedRoles.map(r => (
                          <option key={r} value={r}>{(ROLE_LABELS[r]?.[lang] || ROLE_LABELS[r]?.en) ?? r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-1.5 rounded-xl text-xs font-semibold border ${ROLE_BADGE[user.role] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {roleLabel}
                      </span>
                    )}

                    {/* Account status — editable select or read-only label */}
                    {canEdit ? (
                      <select
                        value={user.status || 'pending'}
                        disabled={isSaving}
                        onChange={e => handleChange(user.id, 'status', e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] disabled:opacity-50 disabled:cursor-not-allowed w-full"
                      >
                        {STATUSES.map(s => (
                          <option key={s} value={s}>{(STATUS_LABELS[s]?.[lang] || STATUS_LABELS[s]?.en) ?? s}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                        {statusLabel}
                      </span>
                    )}

                    {/* Loading indicator */}
                    <div className="flex items-center justify-center">
                      {isSaving && <Loader2 size={15} className="animate-spin text-[#ff5a00]" />}
                    </div>
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
