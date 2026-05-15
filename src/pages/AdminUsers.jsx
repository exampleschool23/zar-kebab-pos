import React, { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAllProfiles, updateProfile } from '../lib/supabase'
import AppShell from '../components/AppShell'
import StatusBadge from '../components/StatusBadge'
import { Search, RefreshCw, UserCircle2, Loader2 } from 'lucide-react'

const ROLES    = ['owner', 'admin', 'waiter', 'cashier', 'kitchen']
const STATUSES = ['pending', 'active', 'disabled']

export default function AdminUsers() {
  const { profile: myProfile } = useAuth()

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
    <AppShell title="Team Members">
      <div className="p-5 max-w-5xl mx-auto">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by name or email..."
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
            <option value="all">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
          >
            <option value="all">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button
            onClick={loadUsers}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Count */}
        <p className="text-xs text-gray-400 mb-4">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <UserCircle2 size={44} className="mx-auto mb-3 opacity-20" />
            <p>No users found</p>
          </div>
        ) : (
          /* Professional table layout */
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[1fr_120px_140px_140px_40px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Name / Email</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</p>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Status</p>
              <div />
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {filtered.map(user => {
                const isMe    = user.id === myProfile?.id
                const isSaving = saving === user.id
                return (
                  <div
                    key={user.id}
                    className={`grid grid-cols-1 sm:grid-cols-[1fr_120px_140px_140px_40px] gap-3 sm:gap-4 items-center px-5 py-4 transition-colors ${
                      isSaving ? 'bg-orange-50/50' : 'hover:bg-gray-50/50'
                    }`}
                  >
                    {/* Name / Email */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-black">
                          {(user.full_name || user.email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-900 truncate">
                          {user.full_name || '—'}
                          {isMe && <span className="ml-1.5 text-[10px] text-[#ff5a00] font-bold">(you)</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      </div>
                    </div>

                    {/* Current status badge */}
                    <div>
                      <StatusBadge status={user.status} />
                    </div>

                    {/* Role selector */}
                    <select
                      value={user.role || 'waiter'}
                      disabled={isMe || isSaving}
                      onChange={e => handleChange(user.id, 'role', e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    >
                      {ROLES.map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>

                    {/* Status selector */}
                    <select
                      value={user.status || 'pending'}
                      disabled={isMe || isSaving}
                      onChange={e => handleChange(user.id, 'status', e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    >
                      {STATUSES.map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>

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
