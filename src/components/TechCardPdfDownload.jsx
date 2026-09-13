import React, { useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { getCategoryName, getItemName } from '../lib/i18n'
import { getMenuItemOptionGroups } from './MenuProductCards'

const words = {
  en: ['Download PDF', 'Food images', 'Selling prices', 'Cost price', 'Ingredients / composition', 'Cooking method', 'Cancel', 'Select all', 'Clear', 'dishes', 'Preparing PDF…', 'Could not create the PDF. Please retry.', 'Some images could not be loaded and were omitted.', 'Exports saved recipes, including variants. Missing fields are omitted.'],
  ru: ['Скачать PDF', 'Фото блюд', 'Цены продажи', 'Себестоимость', 'Ингредиенты / состав', 'Технология приготовления', 'Отмена', 'Выбрать все', 'Сбросить', 'блюд', 'Подготовка PDF…', 'Не удалось создать PDF. Попробуйте ещё раз.', 'Некоторые фото недоступны и пропущены.', 'Экспорт сохранённых рецептов, включая варианты. Отсутствующие данные пропускаются.'],
  uz: ['PDF yuklab olish', 'Taom rasmlari', 'Sotuv narxlari', 'Tannarx', 'Masalliqlar / tarkib', 'Tayyorlash usuli', 'Bekor qilish', 'Barchasini tanlash', 'Tozalash', 'taom', 'PDF tayyorlanmoqda…', 'PDF yaratilmadi. Qayta urinib ko‘ring.', 'Ayrim rasmlar yuklanmadi va o‘tkazib yuborildi.', 'Saqlangan retseptlar va variantlar eksport qilinadi. Mavjud bo‘lmagan ma’lumotlar kiritilmaydi.'],
}
export default function TechCardPdfDownload({ items, cards, categories, allItems, lang, labels: l }) {
  const dialog = useRef(null)
  const [selected, setSelected] = useState([])
  const [options, setOptions] = useState({ images: true, prices: true, cost: true, ingredients: true, method: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [warning, setWarning] = useState(false)
  const w = words[lang] || words.en
  const groups = categories.map(c => ({ id: c.id, name: getCategoryName(c, lang), count: items.filter(i => i.category_id === c.id).length })).filter(c => c.count)
  const other = items.filter(i => !categories.some(c => c.id === i.category_id)).length
  if (other) groups.push({ id: '__other', name: l.otherCategory, count: other })
  const count = groups.filter(c => selected.includes(c.id)).reduce((n, c) => n + c.count, 0)
  async function download() {
    if (busy || !count) return
    setBusy(true); setError(false); setWarning(false)
    try {
      const { buildPdfCards, createTechCardPdf } = await import('../lib/techCardPdf')
      const entries = buildPdfCards(items, cards, categories, selected, lang,
        { item: getItemName, category: c => c ? getCategoryName(c, lang) : l.otherCategory },
        item => getMenuItemOptionGroups(item, lang, { includeUnavailable: true }).flatMap(g => g.options))
      const { doc, missingImages } = await createTechCardPdf(entries, allItems, options, l, lang)
      doc.save(`tech-cards-${new Date().toISOString().slice(0, 10)}.pdf`)
      if (missingImages) setWarning(true)
      else dialog.current.close()
    } catch { setError(true) }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" disabled={!items.length} onClick={() => { setSelected(groups.map(c => c.id)); setError(false); setWarning(false); dialog.current.showModal() }} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-[#ff5a00] px-3 py-2 text-sm font-bold sm:px-4 text-white shadow-sm disabled:opacity-50"><Download size={19} />{w[0]}</button>
    <dialog ref={dialog} aria-labelledby="pdf-title" onCancel={event => { if (busy) event.preventDefault() }} className="w-[calc(100%-2rem)] max-w-lg rounded-2xl p-0 shadow-xl backdrop:bg-black/40">
      <div className="max-h-[85vh] overflow-y-auto p-6">
        <h2 id="pdf-title" className="text-xl font-black">{w[0]}</h2>
        <p className="my-3 text-sm text-gray-500">{w[13]}</p>
        <fieldset disabled={busy}>
          <legend className="font-bold">{l.categories}</legend>
          <div className="my-2 flex gap-4 text-sm text-orange-600"><button type="button" onClick={() => setSelected(groups.map(c => c.id))}>{w[7]}</button><button type="button" onClick={() => setSelected([])}>{w[8]}</button></div>
          <div className="max-h-52 overflow-y-auto rounded-xl border p-3">{groups.map(c => <label key={c.id} className="flex items-center gap-3 py-2"><input type="checkbox" checked={selected.includes(c.id)} onChange={e => setSelected(current => e.target.checked ? [...current, c.id] : current.filter(id => id !== c.id))} className="accent-orange-600" /><span className="flex-1">{c.name}</span><span className="text-sm text-gray-500">{c.count} {w[9]}</span></label>)}</div>
          <div className="my-4 grid gap-2">{Object.keys(options).map((key, i) => <label key={key} className="flex items-center gap-3"><input type="checkbox" className="accent-orange-600" checked={options[key]} onChange={e => setOptions(current => ({ ...current, [key]: e.target.checked }))} />{w[i + 1]}</label>)}</div>
        </fieldset>
        <p className="text-sm font-bold">{count} {w[9]}</p>
        {error && <p role="alert" className="mt-3 text-red-600">{w[11]}</p>}
        {warning && <p role="status" className="mt-3 text-amber-700">{w[12]}</p>}
        <div className="mt-5 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => dialog.current.close()} className="rounded-xl border px-4 py-3">{w[6]}</button><button type="button" disabled={busy || !count} onClick={download} className="flex items-center gap-2 rounded-xl bg-[#ff5a00] px-4 py-3 font-bold text-white disabled:opacity-50">{busy && <Loader2 size={18} className="animate-spin" />}{busy ? w[10] : w[0]}</button></div>
      </div>
    </dialog>
  </>
}
