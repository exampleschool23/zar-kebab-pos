import { jsPDF } from 'jspdf'
import fontUrl from 'notosans-fontface/fonts/NotoSans-Regular.ttf?url'
import { bazaarCategoryLabel, bazaarUnitLabel } from './bazaar.js'
import { formatCurrency } from './formatCurrency.js'

export async function createIngredientsPdf(ingredients, labels, lang, filters) {
  const response = await fetch(fontUrl, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('Font could not be loaded')
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  const doc = new jsPDF({ compress: true })
  doc.addFileToVFS('NotoSans.ttf', btoa(binary))
  doc.addFont('NotoSans.ttf', 'NotoSans', 'normal')
  doc.setFont('NotoSans')
  doc.setProperties({ title: `Zar Kebab - ${labels.title}` })
  const columns = [12, 77, 115, 138, 178]
  const widths = [65, 38, 23, 40, 20]
  const lineHeight = 4.5
  const bottom = 280
  let y = 0
  function header() {
    doc.setFontSize(18)
    doc.setTextColor('#1F2937')
    doc.text(`Zar Kebab - ${labels.title}`, 12, 18)
    doc.setFontSize(9)
    const context = doc.splitTextToSize(`${filters.status} | ${ingredients.length}${filters.query ? ` | ${filters.query}` : ''}`, 186)
    // Limit the repeated filter caption; ingredient names remain fully expanded.
    doc.text(context.slice(0, 2), 12, 26)
    y = 26 + Math.min(context.length, 2) * lineHeight + 4
    const headings = [labels.name, labels.category, labels.unit, `${labels.normalPrice} (UZS)`, labels.status]
      .map((value, i) => doc.splitTextToSize(value, widths[i] - 4))
    const height = Math.max(...headings.map(lines => lines.length)) * lineHeight + 5
    doc.setFillColor('#FFF0E5')
    doc.rect(12, y - 4, 186, height, 'F')
    headings.forEach((lines, i) => doc.text(lines, columns[i] + 2, y, { lineHeightFactor: lineHeight / (9 * 0.352778) }))
    y += height + 2
  }
  header()
  for (const ingredient of ingredients) {
    const cells = [ingredient.product_name, bazaarCategoryLabel(ingredient.category, lang), bazaarUnitLabel(ingredient.unit, lang), formatCurrency(ingredient.normal_unit_price).replace(/ UZS$/, ''), ingredient.is_active ? labels.active : labels.archived]
      .map((value, i) => doc.splitTextToSize(String(value), widths[i] - 4))
    const lines = Math.max(...cells.map(cell => cell.length))
    if (y + lines * lineHeight + 4 > bottom) { doc.addPage(); header() }
    // Split exceptionally long rows safely across pages, repeating column headings.
    for (let start = 0; start < lines;) {
      const count = Math.max(1, Math.min(lines - start, Math.floor((bottom - y - 4) / lineHeight)))
      cells.forEach((cell, i) => {
        const slice = cell.slice(start, start + count)
        if (slice.length) doc.text(slice, columns[i] + 2, y, { lineHeightFactor: lineHeight / (9 * 0.352778) })
      })
      y += count * lineHeight + 4
      start += count
      if (start < lines) { doc.addPage(); header() }
    }
    doc.setDrawColor('#E5E7EB')
    doc.line(12, y - 4, 198, y - 4)
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor('#6B7280')
    doc.text(`${page} / ${pages}`, 198, 290, { align: 'right' })
  }
  return doc
}
