import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getAllProfiles, updateProfile } from '../lib/supabase'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { ArrowLeft, Search, RefreshCw, ShieldCheck, Clock, Ban, UserCircle2 } from 'lucide-react'

const ROLES    = ['owner', 'admin', 'waiter', 'cashier', 'kitchen']
const STATUSES = ['pending', 'active', 'disabled']

function statusStyle(s) {
  if (s === 'active')   return 'bg-green-50 text-green-700 border-green-200'
  if (s === 'pending')  return 'bg-amber-50 text-amber-700 border-amber-200'
  if (s === 'disabled') return 'bg-red-50 text-red-600 border-red-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

function statusIcon(s) {
  if (s === 'active')   return <ShieldCheck size={11} />
  if (s === 'pending')  return <Clock size={11} />
  if (s === 'disabled') return <Ban size={11} />
  return null
}

export default function AdminUsers() {
  const navigate = useNavigate()
  const { profile: myProfile } = useAuth()

  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [roleFilter, setRoleFilter]     = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [saving, setSaving]     = useState(null) // userId being saved

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
    <div className="min-h-screen bg-[#faf9f7] w-full max-w-full overflow-x-hidden">
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin')} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ArrowLeft size={19} className="text-gray-600" />
          </button>
          <div>
            <p className="font-black text-[#141414]">Team Members</p>
            <p className="text-xs text-gray-400">Manage roles & access</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button onClick={loadUsers} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <RefreshCw size={16} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00]"
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
        </div>

        {/* Count */}
        <p className="text-xs text-gray-400 mb-3">{filtered.length} member{filtered.length !== 1 ? 's' : ''}</p>

        {/* Users list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <UserCircle2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>No users found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(user => {
              const isMe = user.id === myProfile?.id
              const isSaving = saving === user.id
              return (
                <div
                  key={user.id}
                  className={`bg-white rounded-2xl border px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-all ${
                    isSaving ? 'border-[#ff5a00]/30 shadow-md' : 'border-gray-100'
                  }`}
                >
                  {/* Avatar + info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#141414] flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-black">
                        {(user.full_name || user.email || '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[#141414] truncate">
                        {user.full_name || '—'}
                        {isMe && <span className="ml-1.5 text-[10px] text-[#ff5a00] font-bold">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{user.email}</p>
                      {user.phone && <p className="text-xs text-gray-400">{user.phone}</p>}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusStyle(user.status)}`}>
                    {statusIcon(user.status)}
                    {user.status}
                  </span>

                  {/* Role selector */}
                  <select
                    value={user.role || 'waiter'}
                    disabled={isMe || isSaving}
                    onChange={e => handleChange(user.id, 'role', e.target.value)}
                    className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>

                  {isSaving && (
                    <RefreshCw size={14} className="animate-spin text-[#ff5a00] flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
