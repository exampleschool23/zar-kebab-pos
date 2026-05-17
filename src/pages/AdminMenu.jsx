import React, { useState, useMemo, useRef } from 'react'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable,
  rectSortingStrategy, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useApp } from '../store/AppContext'
import { t, getItemName, getCategoryName } from '../lib/i18n'
import { formatCurrency } from '../lib/formatCurrency'
import AppShell from '../components/AppShell'
import {
  Plus, Edit2, Trash2, X, UtensilsCrossed,
  Search, LayoutGrid, List, Tag, FolderOpen, GripVertical,
  ImagePlus, Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ── Shared primitives ─────────────────────────────────────────────────────────

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

function ImageUploadField({ label, value, onChange }) {
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const input = e.target
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      // Create bucket if it doesn't exist yet
      const { data: buckets } = await supabase.storage.listBuckets()
      if (!buckets?.find(b => b.name === 'menu-images')) {
        await supabase.storage.createBucket('menu-images', { public: true })
      }

      const { error: uploadError } = await supabase.storage.from('menu-images').upload(path, file, { upsert: true })
      if (uploadError) {
        alert('Upload failed: ' + uploadError.message)
        return
      }
      const { data } = supabase.storage.from('menu-images').getPublicUrl(path)
      onChange({ target: { value: data.publicUrl } })
    } catch (err) {
      alert('Upload error: ' + err.message)
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  return (
    <div>
      <label className="block text-xs text-gray-500 font-semibold mb-1.5">{label}</label>
      <div className="flex gap-2 items-start">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 flex items-center gap-1.5 border-2 border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-500 hover:border-[#ff5a00] hover:text-[#ff5a00] transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder="https://..."
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all"
        />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {value && (
        <img src={value} alt="preview" className="mt-2 h-20 w-20 object-cover rounded-xl border border-gray-200" />
      )}
    </div>
  )
}

function OrangeBtn({ onClick, icon: Icon, children, small }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 bg-[#ff5a00] text-white rounded-xl font-bold hover:bg-[#cc4800] transition-colors shadow-sm shadow-orange-200 whitespace-nowrap ${
        small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
      }`}
    >
      {Icon && <Icon size={small ? 13 : 15} />}
      {children}
    </button>
  )
}

// ── Drag handle ───────────────────────────────────────────────────────────────

function DragHandle({ listeners, attributes }) {
  return (
    <button
      {...listeners}
      {...attributes}
      className="flex-shrink-0 p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing touch-none"
      tabIndex={-1}
    >
      <GripVertical size={15} />
    </button>
  )
}

// ── Sortable grid card ────────────────────────────────────────────────────────

function SortableItemCard({ item, lang, onEdit, onDelete, categories, isDragging: _isDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  const cat = categories.find(c => c.id === item.category_id)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-all flex flex-col group"
    >
      {/* Drag handle strip at top of image */}
      <div className="relative">
        {item.image_url ? (
          <img src={item.image_url} alt={getItemName(item, lang)} className="w-full h-[130px] object-cover" />
        ) : (
          <div className="w-full h-[130px] bg-orange-50 flex items-center justify-center">
            <UtensilsCrossed size={28} className="text-orange-200" />
          </div>
        )}
        {/* Drag handle overlay */}
        <button
          {...listeners}
          {...attributes}
          className="absolute top-2 left-2 p-1 rounded-lg bg-white/80 backdrop-blur-sm text-gray-400 hover:text-gray-700 hover:bg-white transition-colors cursor-grab active:cursor-grabbing touch-none shadow-sm"
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col flex-1">
        <p className="font-black text-gray-900 text-[13px] leading-snug line-clamp-2 mb-0.5">
          {getItemName(item, lang)}
        </p>
        {cat && (
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">
            {getCategoryName(cat, lang)}
          </p>
        )}
        <p className="text-[#ff5a00] font-black text-sm mb-2">{formatCurrency(item.price)}</p>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full w-fit mb-3 ${
          item.available ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
        }`}>
          {item.available
            ? (lang === 'uz' ? 'Mavjud' : lang === 'ru' ? 'Доступно' : 'Available')
            : (lang === 'uz' ? 'Yashirin' : lang === 'ru' ? 'Скрыто'  : 'Hidden')}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-gray-50">
          <button
            onClick={() => onEdit(item)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-[#ff5a00] hover:bg-orange-50 transition-colors text-[11px] font-semibold"
          >
            <Edit2 size={11} />
            {lang === 'uz' ? 'Tahrirl' : lang === 'ru' ? 'Ред.' : 'Edit'}
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1.5 rounded-xl border border-gray-200 text-gray-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sortable list row ─────────────────────────────────────────────────────────

function SortableItemRow({ item, lang, onEdit, onDelete, categories }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  const cat = categories.find(c => c.id === item.category_id)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
    >
      <DragHandle listeners={listeners} attributes={attributes} />
      {item.image_url ? (
        <img src={item.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
          <UtensilsCrossed size={18} className="text-orange-200" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm truncate">{getItemName(item, lang)}</p>
        {cat && <p className="text-xs text-gray-400">{getCategoryName(cat, lang)}</p>}
      </div>
      <p className="text-[#ff5a00] font-black text-sm flex-shrink-0">{formatCurrency(item.price)}</p>
      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex-shrink-0 ${
        item.available ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
      }`}>
        {item.available
          ? (lang === 'uz' ? 'Mavjud' : lang === 'ru' ? 'Доступно' : 'Available')
          : (lang === 'uz' ? 'Yashirin' : lang === 'ru' ? 'Скрыто'  : 'Hidden')}
      </span>
      <div className="flex gap-1.5 flex-shrink-0">
        <button
          onClick={() => onEdit(item)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-[#ff5a00] hover:bg-orange-50 transition-colors text-xs font-semibold"
        >
          <Edit2 size={12} />
          {lang === 'uz' ? 'Tahrirlash' : lang === 'ru' ? 'Редакт.' : 'Edit'}
        </button>
        <button
          onClick={() => onDelete(item.id)}
          className="p-1.5 rounded-xl border border-gray-200 text-gray-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Sortable category row ─────────────────────────────────────────────────────

// Shared grid template — header and every row must use the same string exactly.
const CAT_GRID = 'grid grid-cols-[20px_52px_1fr_110px_90px_160px] items-center gap-4 px-5'

function SortableCatRow({ cat, lang, itemCount, onEdit, onDelete, sortIndex }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    zIndex:  isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${CAT_GRID} py-4 hover:bg-gray-50/60 transition-colors border-b border-gray-100 last:border-0`}
    >
      {/* col 1 – drag handle */}
      <DragHandle listeners={listeners} attributes={attributes} />

      {/* col 2 – image */}
      {cat.image_url ? (
        <img src={cat.image_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
          <Tag size={18} className="text-orange-300" />
        </div>
      )}

      {/* col 3 – name + count */}
      <div className="min-w-0">
        <p className="font-bold text-gray-900 text-sm truncate">{getCategoryName(cat, lang)}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {lang === 'uz' ? `${itemCount} ta element` :
           lang === 'ru' ? `${itemCount} позиций` :
           `${itemCount} item${itemCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* col 4 – status */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full bg-green-50 text-green-600 whitespace-nowrap">
          {lang === 'uz' ? 'Faol' : lang === 'ru' ? 'Активно' : 'Active'}
        </span>
      </div>

      {/* col 5 – sort order (centred) */}
      <div className="flex justify-center">
        <span className="text-sm font-black text-gray-600 w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100">
          {sortIndex}
        </span>
      </div>

      {/* col 6 – actions */}
      <div className="flex gap-1.5 justify-end">
        <button
          onClick={() => onEdit(cat)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:border-orange-300 hover:text-[#ff5a00] hover:bg-orange-50 transition-colors text-xs font-semibold"
        >
          <Edit2 size={12} />
          {lang === 'uz' ? 'Tahrirlash' : lang === 'ru' ? 'Ред.' : 'Edit'}
        </button>
        <button
          onClick={() => onDelete(cat.id)}
          className="p-1.5 rounded-xl border border-gray-200 text-gray-300 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const blankItem = {
  id: '', category_id: '',
  name_uz: '', name_ru: '', name_en: '',
  description_uz: '', description_ru: '', description_en: '',
  price: '', image_url: '', available: true, sort_order: '',
}

const blankCat = { id: '', name_uz: '', name_ru: '', name_en: '', image_url: '', sort_order: '' }

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminMenu() {
  const { state, dispatch } = useApp()
  const lang = state.lang

  const [tab,        setTab]        = useState('items')
  const [itemModal,  setItemModal]  = useState(null)
  const [catModal,   setCatModal]   = useState(null)
  const [form,       setForm]       = useState(blankItem)
  const [catForm,    setCatForm]    = useState(blankCat)
  const [search,     setSearch]     = useState('')
  const [filterCat,  setFilterCat]  = useState('all')
  const [filterAvail,setFilterAvail]= useState('all')
  const [gridView,   setGridView]   = useState(true)
  const [activeId,   setActiveId]   = useState(null) // drag overlay

  // Sensors: pointer (mouse/trackpad) + touch
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  // ── Sorted data ────────────────────────────────────────────────────────────
  const sortedCategories = useMemo(() =>
    [...state.categories].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.categories]
  )
  const realSortedCats = useMemo(() =>
    sortedCategories.filter(c => c.id !== 'all'),
    [sortedCategories]
  )

  const sortedItems = useMemo(() =>
    [...state.menuItems].sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999)),
    [state.menuItems]
  )

  const filteredItems = useMemo(() => {
    return sortedItems.filter(item => {
      const matchCat    = filterCat === 'all' || item.category_id === filterCat
      const matchAvail  = filterAvail === 'all' || (filterAvail === 'available' ? item.available : !item.available)
      const q           = search.trim().toLowerCase()
      const matchSearch = !q || getItemName(item, lang).toLowerCase().includes(q)
      return matchCat && matchAvail && matchSearch
    })
  }, [sortedItems, filterCat, filterAvail, search, lang])

  const itemCountByCat = useMemo(() => {
    const m = { all: state.menuItems.length }
    state.menuItems.forEach(i => { m[i.category_id] = (m[i.category_id] || 0) + 1 })
    return m
  }, [state.menuItems])

  // ── Item CRUD ──────────────────────────────────────────────────────────────
  function openNewItem() {
    const maxOrder = state.menuItems.length > 0
      ? Math.max(...state.menuItems.map(i => i.sort_order ?? 0)) : 0
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

  // ── Category CRUD ──────────────────────────────────────────────────────────
  function openNewCat() {
    const maxOrder = realSortedCats.length > 0
      ? Math.max(...realSortedCats.map(c => c.sort_order ?? 0)) : 0
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

  function setF(key)  { return e => setForm(f => ({ ...f, [key]: e.target.value })) }
  function setCF(key) { return e => setCatForm(f => ({ ...f, [key]: e.target.value })) }

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function handleItemDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    dispatch({ type: 'REORDER_MENU_ITEM', payload: { idA: active.id, idB: over.id } })
  }

  function handleCatDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    dispatch({ type: 'REORDER_CATEGORY', payload: { idA: active.id, idB: over.id } })
  }

  // Overlay item for drag ghost
  const activeItem = activeId ? filteredItems.find(i => i.id === activeId) : null
  const activeCat  = activeId ? realSortedCats.find(c => c.id === activeId) : null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell title={t(lang, 'menu')}>
      <div className="min-h-screen bg-[#faf9f7]">

        {/* Page header */}
        <div className="bg-white border-b border-gray-100 px-6 pt-5 pb-0">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-black text-gray-900">{t(lang, 'menu')}</h1>
            <p className="text-sm text-gray-400 mt-0.5 mb-4">
              {lang === 'uz' ? 'Menyu elementlari va kategoriyalarini boshqaring' :
               lang === 'ru' ? 'Управляйте позициями меню и категориями' :
               'Manage your menu items and categories'}
            </p>
            <div className="flex gap-0">
              {[['items', t(lang, 'menuItems')], ['categories', t(lang, 'categories')]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-8 py-3 text-sm font-bold transition-all border-b-2 ${
                    tab === key ? 'text-[#ff5a00] border-[#ff5a00]' : 'text-gray-400 border-transparent hover:text-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6">

          {/* ══ Menu Items tab ═══════════════════════════════════════════════ */}
          {tab === 'items' && (
            <>
              {/* Toolbar row 1: search + availability + grid toggle + add */}
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={lang === 'uz' ? 'Menyu elementlarini qidirish...' :
                                 lang === 'ru' ? 'Поиск позиций меню...' : 'Search menu items...'}
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] transition-all shadow-sm"
                  />
                </div>
                <select
                  value={filterAvail}
                  onChange={e => setFilterAvail(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#ff5a00]/20 focus:border-[#ff5a00] shadow-sm cursor-pointer"
                >
                  <option value="all">
                    {lang === 'uz' ? 'Mavjudlik' : lang === 'ru' ? 'Доступность' : 'Availability'}
                  </option>
                  <option value="available">
                    {lang === 'uz' ? 'Mavjud' : lang === 'ru' ? 'Доступно' : 'Available'}
                  </option>
                  <option value="hidden">
                    {lang === 'uz' ? 'Yashirin' : lang === 'ru' ? 'Скрыто' : 'Hidden'}
                  </option>
                </select>
                <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <button
                    onClick={() => setGridView(true)}
                    className={`p-2.5 transition-colors ${gridView ? 'bg-[#ff5a00] text-white' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    onClick={() => setGridView(false)}
                    className={`p-2.5 transition-colors ${!gridView ? 'bg-[#ff5a00] text-white' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <List size={15} />
                  </button>
                </div>
                <OrangeBtn onClick={openNewItem} icon={Plus}>{t(lang, 'addItem')}</OrangeBtn>
              </div>

              {/* Toolbar row 2: category cards */}
              <div className="flex gap-3 overflow-x-auto pb-2 mb-2" style={{ scrollbarWidth: 'none' }}>
                {/* "All" square */}
                {[
                  { id: 'all', label: lang === 'uz' ? 'Hammasi' : lang === 'ru' ? 'Все' : 'All', image_url: null },
                  ...realSortedCats.map(c => ({ id: c.id, label: getCategoryName(c, lang), image_url: c.image_url })),
                ].map(cat => {
                  const active = filterCat === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setFilterCat(cat.id)}
                      className={`min-w-[124px] w-[124px] flex-shrink-0 overflow-hidden rounded-[20px] border-2 text-left transition-all active:scale-[0.98]
                        ${active
                          ? 'border-[#ff5a1f] bg-[#fff4ed] shadow-[0_8px_18px_rgba(255,90,31,0.16)]'
                          : 'border-gray-200 bg-white shadow-sm hover:border-orange-300 hover:shadow-md'
                        }`}
                    >
                      <div className={`aspect-square w-full overflow-hidden ${active ? 'bg-[#FFE8D8]' : 'bg-gray-100'}`}>
                        {cat.id === 'all' ? (
                          <div className="h-full w-full flex items-center justify-center">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${active ? 'bg-[#ff5a1f]/15' : 'bg-white shadow-sm'}`}>
                              <LayoutGrid size={24} className={active ? 'text-[#ff4d00]' : 'text-[#ff8a3d]'} />
                            </div>
                          </div>
                        ) : cat.image_url ? (
                          <img
                            src={cat.image_url}
                            alt={cat.label}
                            className="h-full w-full object-cover object-center"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-orange-50">
                            <UtensilsCrossed size={28} className={active ? 'text-[#ff4d00]' : 'text-orange-300'} />
                          </div>
                        )}
                      </div>

                      <div className="min-h-[58px] px-2.5 py-2.5 text-center flex items-center justify-center">
                        <p className={`line-clamp-2 text-sm font-extrabold leading-tight ${active ? 'text-[#ff4d00]' : 'text-[#1F2937]'}`}>
                          {cat.label}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Hint */}
              {filteredItems.length > 1 && (
                <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                  <GripVertical size={12} />
                  {lang === 'uz' ? 'Tartiblash uchun sudrang' : lang === 'ru' ? 'Перетащите для сортировки' : 'Drag to reorder'}
                </p>
              )}

              {filteredItems.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl py-20 text-center shadow-sm">
                  <UtensilsCrossed size={40} className="mx-auto mb-3 text-gray-200" />
                  {search || filterCat !== 'all' || filterAvail !== 'all' ? (
                    // Filters are active — just tell user to adjust them, no Add button
                    <>
                      <p className="text-gray-500 font-semibold mb-1">
                        {lang === 'uz' ? 'Natija topilmadi' : lang === 'ru' ? 'Ничего не найдено' : 'No results found'}
                      </p>
                      <p className="text-sm text-gray-400">
                        {lang === 'uz' ? 'Filtrni tozalang yoki boshqa qidiruv kiriting' : lang === 'ru' ? 'Попробуйте другой фильтр или запрос' : 'Try adjusting your filters or search'}
                      </p>
                    </>
                  ) : (
                    // Truly empty — no items exist yet
                    <>
                      <p className="text-gray-500 font-semibold mb-1">
                        {lang === 'uz' ? 'Menyu elementlari yo\'q' : lang === 'ru' ? 'Нет позиций меню' : 'No menu items yet'}
                      </p>
                      <p className="text-sm text-gray-400 mb-5">
                        {lang === 'uz' ? 'Birinchi elementni qo\'shing' : lang === 'ru' ? 'Добавьте первую позицию' : 'Add your first item'}
                      </p>
                      <OrangeBtn onClick={openNewItem} icon={Plus}>{t(lang, 'addItem')}</OrangeBtn>
                    </>
                  )}
                </div>
              ) : (() => {
                // Show grouped sections when "All" is selected with no active filters
                const showGrouped = filterCat === 'all' && !search && filterAvail === 'all'

                // Build category sections for grouped view
                const sections = showGrouped
                  ? realSortedCats
                      .map(cat => ({
                        cat,
                        items: filteredItems.filter(i => i.category_id === cat.id),
                      }))
                      .filter(s => s.items.length > 0)
                  : null

                // Uncategorised items (no matching category)
                const uncategorised = showGrouped
                  ? filteredItems.filter(i => !realSortedCats.some(c => c.id === i.category_id))
                  : []

                const DragGhost = () => activeItem ? (
                  <div className="bg-white rounded-2xl border-2 border-[#ff5a00]/40 shadow-2xl opacity-95 w-44 rotate-2">
                    {activeItem.image_url ? (
                      <img src={activeItem.image_url} alt="" className="w-full h-[100px] object-cover rounded-t-2xl" />
                    ) : (
                      <div className="w-full h-[100px] bg-orange-50 rounded-t-2xl flex items-center justify-center">
                        <UtensilsCrossed size={24} className="text-orange-200" />
                      </div>
                    )}
                    <div className="p-2.5">
                      <p className="font-black text-gray-900 text-[12px] truncate">{getItemName(activeItem, lang)}</p>
                      <p className="text-[#ff5a00] font-black text-xs">{formatCurrency(activeItem.price)}</p>
                    </div>
                  </div>
                ) : null

                return (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={e => setActiveId(e.active.id)}
                    onDragEnd={handleItemDragEnd}
                    onDragCancel={() => setActiveId(null)}
                  >
                    <SortableContext
                      items={filteredItems.map(i => i.id)}
                      strategy={gridView ? rectSortingStrategy : verticalListSortingStrategy}
                    >
                      {showGrouped ? (
                        // ── Grouped by category ──────────────────────────────
                        <div className="space-y-8">
                          {sections.map(({ cat, items: catItems }) => (
                            <div key={cat.id}>
                              {/* Section header */}
                              <div className="flex items-center gap-3 mb-3">
                                {cat.image_url && (
                                  <img src={cat.image_url} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                                )}
                                <h3 className="text-base font-black text-gray-800">
                                  {getCategoryName(cat, lang)}
                                </h3>
                                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                  {catItems.length}
                                </span>
                                <div className="flex-1 h-px bg-gray-100" />
                              </div>

                              {gridView ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                  {catItems.map(item => (
                                    <SortableItemCard
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={deleteItem}
                                      categories={realSortedCats}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                  {catItems.map(item => (
                                    <SortableItemRow
                                      key={item.id}
                                      item={item}
                                      lang={lang}
                                      onEdit={openEditItem}
                                      onDelete={deleteItem}
                                      categories={realSortedCats}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Uncategorised items (edge case) */}
                          {uncategorised.length > 0 && (
                            <div>
                              <div className="flex items-center gap-3 mb-3">
                                <h3 className="text-base font-black text-gray-500">
                                  {lang === 'uz' ? 'Kategoriyasiz' : lang === 'ru' ? 'Без категории' : 'Uncategorised'}
                                </h3>
                                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                                  {uncategorised.length}
                                </span>
                                <div className="flex-1 h-px bg-gray-100" />
                              </div>
                              {gridView ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                  {uncategorised.map(item => (
                                    <SortableItemCard key={item.id} item={item} lang={lang} onEdit={openEditItem} onDelete={deleteItem} categories={realSortedCats} />
                                  ))}
                                </div>
                              ) : (
                                <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                                  {uncategorised.map(item => (
                                    <SortableItemRow key={item.id} item={item} lang={lang} onEdit={openEditItem} onDelete={deleteItem} categories={realSortedCats} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        // ── Flat grid (specific category or active filter) ────
                        gridView ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {filteredItems.map(item => (
                              <SortableItemCard key={item.id} item={item} lang={lang} onEdit={openEditItem} onDelete={deleteItem} categories={realSortedCats} />
                            ))}
                          </div>
                        ) : (
                          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                            {filteredItems.map(item => (
                              <SortableItemRow key={item.id} item={item} lang={lang} onEdit={openEditItem} onDelete={deleteItem} categories={realSortedCats} />
                            ))}
                          </div>
                        )
                      )}
                    </SortableContext>

                    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                      <DragGhost />
                    </DragOverlay>
                  </DndContext>
                )
              })()}

              {filteredItems.length > 0 && (
                <p className="text-xs text-gray-400 text-center mt-4">
                  {lang === 'uz' ? `${filteredItems.length} ta element` :
                   lang === 'ru' ? `Итого: ${filteredItems.length} позиций` :
                   `Total ${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''}`}
                </p>
              )}
            </>
          )}

          {/* ══ Categories tab ═══════════════════════════════════════════════ */}
          {tab === 'categories' && (
            <>
              <div className="flex justify-end mb-5">
                <OrangeBtn onClick={openNewCat} icon={Plus}>{t(lang, 'addCategory')}</OrangeBtn>
              </div>

              {realSortedCats.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-2xl py-20 text-center shadow-sm">
                  <FolderOpen size={40} className="mx-auto mb-3 text-gray-200" />
                  <p className="text-gray-500 font-semibold mb-1">
                    {lang === 'uz' ? 'Kategoriyalar yo\'q' : lang === 'ru' ? 'Нет категорий' : 'No categories yet'}
                  </p>
                  <p className="text-sm text-gray-400 mb-5">
                    {lang === 'uz' ? 'Birinchi kategoriyani qo\'shing' :
                     lang === 'ru' ? 'Добавьте первую категорию' : 'Add your first category'}
                  </p>
                  <OrangeBtn onClick={openNewCat} icon={Plus}>{t(lang, 'addCategory')}</OrangeBtn>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
                    <GripVertical size={12} />
                    {lang === 'uz' ? 'Tartiblash uchun sudrang' : lang === 'ru' ? 'Перетащите для сортировки' : 'Drag to reorder'}
                  </p>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={e => setActiveId(e.active.id)}
                    onDragEnd={handleCatDragEnd}
                    onDragCancel={() => setActiveId(null)}
                  >
                    <SortableContext
                      items={realSortedCats.map(c => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                        {/* Header — must use the same CAT_GRID template as the rows */}
                        <div className={`${CAT_GRID} py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wide`}>
                          <span />
                          <span />
                          <span>{lang === 'uz' ? 'Nomi' : lang === 'ru' ? 'Название' : 'Name'}</span>
                          <span>{lang === 'uz' ? 'Holat' : lang === 'ru' ? 'Статус' : 'Status'}</span>
                          <span className="text-center">{lang === 'uz' ? 'Tartib' : lang === 'ru' ? 'Порядок' : 'Sort Order'}</span>
                          <span className="text-right">{lang === 'uz' ? 'Amallar' : lang === 'ru' ? 'Действия' : 'Actions'}</span>
                        </div>

                        {realSortedCats.map((cat, idx) => (
                          <SortableCatRow
                            key={cat.id}
                            cat={cat}
                            lang={lang}
                            itemCount={itemCountByCat[cat.id] || 0}
                            onEdit={openEditCat}
                            onDelete={deleteCat}
                            sortIndex={idx + 1}
                          />
                        ))}

                        {/* Footer */}
                        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
                          {lang === 'uz' ? `Jami ${realSortedCats.length} ta kategoriya` :
                           lang === 'ru' ? `Всего категорий: ${realSortedCats.length}` :
                           `Total ${realSortedCats.length} categor${realSortedCats.length !== 1 ? 'ies' : 'y'}`}
                        </div>
                      </div>
                    </SortableContext>

                    {/* Drag overlay ghost */}
                    <DragOverlay dropAnimation={{ duration: 180, easing: 'ease' }}>
                      {activeCat && (
                        <div className="bg-white border-2 border-[#ff5a00]/40 rounded-2xl shadow-2xl flex items-center gap-4 px-5 py-4 opacity-95">
                          {activeCat.image_url ? (
                            <img src={activeCat.image_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                              <Tag size={18} className="text-orange-300" />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{getCategoryName(activeCat, lang)}</p>
                            <p className="text-xs text-gray-400">{itemCountByCat[activeCat.id] || 0} items</p>
                          </div>
                        </div>
                      )}
                    </DragOverlay>
                  </DndContext>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Item modal ──────────────────────────────────────────────────────── */}
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
            <ImageUploadField label={t(lang, 'imageUrl')} value={form.image_url} onChange={setF('image_url')} />
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

      {/* ── Category modal ──────────────────────────────────────────────────── */}
      {catModal && (
        <Modal
          title={catModal === 'new' ? t(lang, 'addCategory') : (lang === 'uz' ? 'Kategoriyani tahrirlash' : lang === 'ru' ? 'Редактировать категорию' : 'Edit Category')}
          onClose={() => setCatModal(null)}
        >
          <div className="space-y-3">
            <Field label={t(lang, 'nameUz')} value={catForm.name_uz} onChange={setCF('name_uz')} />
            <Field label={t(lang, 'nameRu')} value={catForm.name_ru} onChange={setCF('name_ru')} />
            <Field label={t(lang, 'nameEn')} value={catForm.name_en} onChange={setCF('name_en')} />
            <ImageUploadField label={t(lang, 'imageUrl')} value={catForm.image_url} onChange={setCF('image_url')} />
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
