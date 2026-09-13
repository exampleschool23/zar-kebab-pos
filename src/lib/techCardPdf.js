import { jsPDF } from 'jspdf'
import fontUrl from 'notosans-fontface/fonts/NotoSans-Regular.ttf?url'
import { calculateTechCardSummary, techCardUnitLabel } from './techCards'
import { techCardOptionName } from './techCardPdfData.js'
import { getItemName } from './i18n'

const present = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
export { buildPdfCards } from './techCardPdfData.js'

async function imageData(url) {
  if (!url || /\.(mp4|webm)(?:[?#]|$)/i.test(url)) return null
  return new Promise(resolve => {
    const img = new Image()
    const timer = setTimeout(() => resolve(null), 8000)
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, 900 / Math.max(img.width, img.height))
        canvas.width = img.width * scale; canvas.height = img.height * scale
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve({ data: canvas.toDataURL('image/jpeg', 0.85), ratio: img.width / img.height })
      } catch { resolve(null) }
    }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}

export async function createTechCardPdf(entries, items, options, l, lang) {
  if (!entries.length) throw new Error('No cards selected')
  const response = await fetch(fontUrl, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('Font could not be loaded')
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const doc = new jsPDF({ compress: true })
  doc.addFileToVFS('NotoSans.ttf', btoa(binary))
  doc.addFont('NotoSans.ttf', 'NotoSans', 'normal')
  doc.setFont('NotoSans')
  const number = value => new Intl.NumberFormat(lang, { maximumFractionDigits: 3 }).format(Number(value))
  const money = value => `${number(value)} UZS`
  let y = 20
  function page() { doc.addPage(); y = 20 }
  function line(text, size = 10, color = '#263238') {
    doc.setFontSize(size); doc.setTextColor(color)
    for (const row of doc.splitTextToSize(String(text), 174)) {
      if (y + size * 0.5 > 277) page()
      doc.text(row, 18, y); y += size * 0.5 + 1
    }
  }
  function section(title) { if (y > 250) page(); y += 5; line(title, 12, '#e65300'); y += 2 }
  let missingImages = 0
  for (const [index, entry] of entries.entries()) {
    const { item, card } = entry
    const img = options.images && item.image_url ? await imageData(item.image_url) : null
    if (options.images && item.image_url && !img) missingImages++
    // Keep the heading with the photo or first details, then flow into free space.
    doc.setFontSize(22)
    const headingHeight = doc.splitTextToSize(entry.name, 174).length * 12 + 19
    const imageHeight = img ? Math.min(174 / img.ratio, 55) + 6 : 0
    if (index) {
      if (y + 14 + headingHeight + imageHeight + 6 > 277) page()
      else {
        y += 5
        doc.setDrawColor('#e5e7eb'); doc.line(18, y, 192, y)
        y += 9
      }
    }
    line(l.title.toUpperCase(), 10, '#e65300'); y += 3
    line(entry.name, 22); line(entry.category || '', 10, '#687078'); y += 4
    if (card?.card_number) line(`№ ${card.card_number}`)
    if (img) {
        const w = Math.min(174, 55 * img.ratio), h = w / img.ratio
        if (y + h > 275) page()
        doc.addImage(img.data, 'JPEG', 18, y, w, h); y += h + 6
    }
    const summary = card ? calculateTechCardSummary(card, items) : null
    if (summary?.outputPerPortion != null) {
      const kg = card.batch_output_unit === 'kg'
      line(`${l.outputPerPortion}: ${number(summary.outputPerPortion * (kg ? 1000 : 1))} ${techCardUnitLabel(kg ? 'g' : card.batch_output_unit, lang)}`)
    }
    if (options.prices && present(entry.price)) line(`${l.salePrice}: ${money(entry.price)}`)
    if (options.cost && present(entry.cost)) line(`${l.savedCost}: ${money(entry.cost)}`)
    if (options.ingredients && card) {
      if (card.ingredients.length) {
        section(l.ingredients)
        line(`${l.portions}: ${number(card.portion_count)}`, 9)
        // The model stores batch quantity, not distinct gross/net weights.
        const header = () => {
          doc.setFillColor('#fff0e5'); doc.rect(18, y - 4, 174, 9, 'F')
          doc.setFontSize(9); doc.setTextColor('#263238')
          doc.text(l.ingredient, 20, y); doc.text(l.quantity, 112, y)
          if (options.cost) doc.text(l.lineCost, 157, y)
          y += 10
        }
        header()
        for (const ingredient of card.ingredients) {
          const rows = doc.splitTextToSize(ingredient.name, 86)
          for (let start = 0; start < rows.length;) {
            if (y > 263) { page(); header() }
            const count = Math.max(1, Math.min(rows.length - start, Math.floor((271 - y) / 5)))
            doc.text(rows.slice(start, start + count), 20, y, { lineHeightFactor: 1.5 })
            if (start === 0) {
              const kg = ingredient.unit === 'kg'
              doc.text(`${number(Number(ingredient.quantity) * (kg ? 1000 : 1))} ${techCardUnitLabel(kg ? 'g' : ingredient.unit, lang)}`, 112, y)
              if (options.cost && present(ingredient.unit_price_uzs)) doc.text(number(Number(ingredient.quantity) * Number(ingredient.unit_price_uzs)), 157, y)
            }
            y += count * 5 + 3; start += count
          }
          doc.setDrawColor('#e5e7eb'); doc.line(18, y - 3, 192, y - 3)
        }
        if (options.cost) line('UZS', 8, '#687078')
      }
      if (summary.components.length) {
        section(l.includedItems)
        for (const component of summary.components) {
          const included = items.find(row => row.id === component.component_menu_item_id)
          if (included) {
            let groups = included.option_groups || []
            if (typeof groups === 'string') { try { groups = JSON.parse(groups) } catch { groups = [] } }
            const chosen = groups.flatMap(g => g.options || []).filter(o => Object.values(component.selected_options || {}).includes(o.id))
            const name = getItemName(included, lang)
            const suffix = chosen.map(o => techCardOptionName(o, lang)).filter(Boolean).join(', ')
            line(`${name}${suffix ? ` (${suffix})` : ''} × ${number(component.quantity)}${options.cost && component.lineCost != null ? ` · ${money(component.lineCost)}` : ''}`)
          }
        }
      }
    }
    if (options.method && card?.preparation_steps) { section(l.method); line(card.preparation_steps) }
    if (card?.notes) { section(l.notes); line(card.notes) }
    if (!card) line(l.unsaved, 10, '#687078')
  }
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor('#687078')
    doc.text(`${p} / ${total}`, 192, 288, { align: 'right' })
  }
  return { doc, missingImages }
}
