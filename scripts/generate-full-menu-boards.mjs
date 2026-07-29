import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'artifacts')
const catalogPath = path.join(outDir, 'zarkebab-full-menu-catalog.json')
const backgroundPath = path.join(outDir, 'zar-kebab-menu-background.png')
const logoPath = path.join(root, 'src/assets/brand/zarkebab_logo.png')
const menuFontPath = path.join(outDir, 'fonts/Neucha-Regular.ttf')
const overlayScriptPath = path.join(root, 'scripts/render-menu-text-overlay.py')
const bundledPython =
  '/Users/hoggish/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const pythonExecutable = fs.existsSync(bundledPython) ? bundledPython : 'python3'

const fontConfigPath = path.join(outDir, 'fonts/full-menu-fontconfig.xml')
const fontCachePath = path.join(outDir, '.fontconfig-cache')
fs.mkdirSync(fontCachePath, { recursive: true })
fs.writeFileSync(
  fontConfigPath,
  `<?xml version="1.0"?>
<fontconfig>
  <dir>${path.dirname(menuFontPath)}</dir>
  <dir>/System/Library/Fonts</dir>
  <dir>/System/Library/Fonts/Supplemental</dir>
  <dir>/Library/Fonts</dir>
  <cachedir>${fontCachePath}</cachedir>
</fontconfig>`,
)
process.env.FONTCONFIG_FILE = fontConfigPath

const { default: sharp } = await import('sharp')

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
const excludedItemIds = new Set([
  'i1780390519015', // Chocolate Caramel Cake, 28,000
  'i1781508355657', // “Childhood” compote, 8,000
])
const categoriesById = new Map(
  catalog.categories.map((category) => [category.id, category]),
)
const itemsByCategory = new Map()
for (const item of catalog.items) {
  if (excludedItemIds.has(item.id)) continue
  const items = itemsByCategory.get(item.category_id) || []
  items.push(item)
  itemsByCategory.set(item.category_id, items)
}
for (const items of itemsByCategory.values()) {
  items.sort(
    (a, b) =>
      Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
      String(a.id).localeCompare(String(b.id)),
  )
}

const screens = [
  {
    slug: 'one-page',
    language: 'bilingual',
    title: 'MENU · МЕНЮ · MENYU',
    columns: [
      ['breakfast', 'kebab', 'first', 'c1780408777665', 'sides'],
      ['c1781337286710', 'salads'],
      ['desserts', 'c1780385299367', 'drinks'],
      ['c1780304119652', 'bread', '__business_lunch__'],
    ],
  },
  {
    slug: 'english-one-page',
    language: 'en',
    title: 'MENU',
    columns: [
      ['breakfast', 'kebab', 'first', 'c1780408777665', 'sides'],
      ['c1781337286710', 'salads'],
      ['desserts', 'c1780385299367', 'drinks'],
      ['c1780304119652', 'bread', '__business_lunch__'],
    ],
  },
  {
    slug: 'russian-one-page',
    language: 'ru',
    title: 'МЕНЮ',
    columns: [
      ['breakfast', 'kebab', 'first', 'c1780408777665', 'sides'],
      ['c1781337286710', 'salads'],
      ['desserts', 'c1780385299367', 'drinks'],
      ['c1780304119652', 'bread', '__business_lunch__'],
    ],
  },
]

const W = 7200
const H = 4200
const outerX = 380
const contentTop = 610
const footerY = 3970
const gap = 110
const colW = (W - outerX * 2 - gap * 3) / 4
const ITEM_FONT_SIZE = 68
const ITEM_LINE_HEIGHT = 74
const ITEM_WRAP_LIMIT = 18
const ITEM_ROW_HEIGHT = 86

const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

const asDataUri = (file, mime) =>
  `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`

const background = asDataUri(backgroundPath, 'image/png')
const logo = asDataUri(logoPath, 'image/png')
const menuFont = asDataUri(menuFontPath, 'font/ttf')

function displayName(item, language) {
  if (language === 'ru') {
    return (
      item.name_ru?.trim() ||
      item.name_uz?.trim() ||
      item.name_en?.trim() ||
      `Позиция ${item.id}`
    )
  }
  return (
    item.name_en?.trim() ||
    item.name_uz?.trim() ||
    item.name_ru?.trim() ||
    `Item ${item.id}`
  )
}

function wrapName(name, limit = ITEM_WRAP_LIMIT) {
  const words = String(name).trim().split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && candidate.length > limit) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['—']
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString('en-US')
}

function categoryTitle(category, language = 'bilingual') {
  const ru = category?.name_ru?.trim() || category?.name_uz?.trim() || 'БЕЗ КАТЕГОРИИ'
  const en = category?.name_en?.trim() || category?.name_uz?.trim() || 'UNCATEGORIZED'
  if (language === 'ru') return ru.toUpperCase()
  if (language === 'en') return en.toUpperCase()
  return `${ru.toUpperCase()} / ${en.toUpperCase()}`
}

function addTextRuns(runs, lines, x, y, color) {
  lines.forEach((line, lineIndex) => {
    runs.push({
      x,
      y: y + lineIndex * ITEM_LINE_HEIGHT,
      text: line,
      color,
      fontPath: menuFontPath,
      fontSize: ITEM_FONT_SIZE,
    })
  })
}

function renderCategory(categoryId, x, y, width, runs, language = 'bilingual') {
  const category = categoriesById.get(categoryId)
  const items = itemsByCategory.get(categoryId) || []
  if (!category || items.length === 0) return { block: '', y }

  const title = categoryTitle(category, language)
  const titleSize = title.length > 42 ? 43 : title.length > 30 ? 50 : 58
  const englishX = x + width * 0.455
  const priceX = x + width
  let block = `
    <g>
      <text x="${x}" y="${y}" class="section-title" font-size="${titleSize}">${esc(title)}</text>
      <line x1="${x}" y1="${y + 18}" x2="${x + width}" y2="${y + 18}"
            stroke="#17324D" stroke-width="4" opacity="0.85"/>
    </g>`

  y += 86
  for (const item of items) {
    const singleLanguage = language === 'ru' || language === 'en'
    const ruLines = singleLanguage
      ? language === 'ru'
        ? wrapName(displayName(item, 'ru'), 34)
        : []
      : wrapName(displayName(item, 'ru'))
    const enLines = singleLanguage
      ? language === 'en'
        ? wrapName(displayName(item, 'en'), 34)
        : []
      : wrapName(displayName(item, 'en'))
    const lineCount = Math.max(ruLines.length, enLines.length)
    const rowBottom = y + (lineCount - 1) * ITEM_LINE_HEIGHT + 25
    const priceY = y + (lineCount - 1) * (ITEM_LINE_HEIGHT / 2)

    if (language === 'ru') {
      addTextRuns(runs, ruLines, x, y, '#202C33')
    } else if (language === 'en') {
      addTextRuns(runs, enLines, x, y, '#285046')
    } else {
      addTextRuns(runs, ruLines, x, y, '#202C33')
      addTextRuns(runs, enLines, englishX, y, '#285046')
    }

    block += `
      <g>
        ${ruLines.length ? `<text x="${x}" y="${y}" class="item-name item-ru" font-size="${ITEM_FONT_SIZE}">
          ${ruLines.map((line, lineIndex) => `<tspan x="${x}" dy="${lineIndex === 0 ? 0 : ITEM_LINE_HEIGHT}">${esc(line)}</tspan>`).join('')}
        </text>` : ''}
        ${enLines.length ? `<text x="${singleLanguage ? x : englishX}" y="${y}" class="item-name item-en" font-size="${ITEM_FONT_SIZE}">
          ${enLines.map((line, lineIndex) => `<tspan x="${singleLanguage ? x : englishX}" dy="${lineIndex === 0 ? 0 : ITEM_LINE_HEIGHT}">${esc(line)}</tspan>`).join('')}
        </text>` : ''}
        <text x="${priceX}" y="${priceY}" text-anchor="end" class="item-price">${formatPrice(item.price)}</text>
        <line x1="${x}" y1="${rowBottom}" x2="${x + width}" y2="${rowBottom}"
              stroke="#B7A98A" stroke-width="2" stroke-dasharray="4 10" opacity="0.45"/>
      </g>`

    y += ITEM_ROW_HEIGHT + (lineCount - 1) * ITEM_LINE_HEIGHT
  }

  return { block, y: y + 48 }
}

function renderBusinessLunch(x, y, width, runs, language = 'bilingual') {
  const title =
    language === 'ru'
      ? 'БИЗНЕС-ЛАНЧ'
      : language === 'en'
        ? 'BUSINESS LUNCH'
        : 'БИЗНЕС-ЛАНЧ / BUSINESS LUNCH'
  const titleSize = 50
  const boxTop = y + 42
  const boxHeight = 500
  const leftX = x + 52
  const dividerX = x + width * 0.39
  const detailsX = dividerX + 52

  const addPromoRun = ({
    text,
    runX,
    runY,
    fontSize,
    color = '#202C33',
  }) => {
    runs.push({
      x: runX,
      y: runY,
      text,
      color,
      fontPath: menuFontPath,
      fontSize,
    })
  }

  addPromoRun({
    text:
      language === 'ru'
        ? 'АКЦИЯ'
        : language === 'en'
          ? 'SPECIAL'
          : 'АКЦИЯ · SPECIAL',
    runX: leftX,
    runY: boxTop + 105,
    fontSize: 70,
    color: '#9C2931',
  })
  addPromoRun({
    text: '60,000 UZS',
    runX: leftX,
    runY: boxTop + 205,
    fontSize: 55,
    color: '#39444A',
  })
  addPromoRun({
    text: '45,000 UZS',
    runX: leftX,
    runY: boxTop + 340,
    fontSize: 82,
    color: '#9C2931',
  })

  const inclusions =
    language === 'ru'
      ? [
          '+ Первое блюдо',
          '+ Салат',
          '+ Горячее блюдо',
          '+ Компот',
          '+ Хлеб',
        ]
      : language === 'en'
        ? ['+ First course', '+ Salad', '+ Hot dish', '+ Compote', '+ Bread']
        : [
            '+ Первое блюдо / First course',
            '+ Салат / Salad',
            '+ Горячее блюдо / Hot dish',
            '+ Компот / Compote',
            '+ Хлеб / Bread',
          ]
  inclusions.forEach((line, index) => {
    addPromoRun({
      text: line,
      runX: detailsX,
      runY: boxTop + 92 + index * 76,
      fontSize: 51,
    })
  })

  return {
    block: `
      <g>
        <text x="${x}" y="${y}" class="section-title" font-size="${titleSize}">${title}</text>
        <line x1="${x}" y1="${y + 18}" x2="${x + width}" y2="${y + 18}"
              stroke="#17324D" stroke-width="4" opacity="0.85"/>
        <rect x="${x + width - 370}" y="${y - 58}" width="370" height="62" rx="31"
              fill="#17324D" stroke="#B58A32" stroke-width="3"/>
        <text x="${x + width - 185}" y="${y - 15}" text-anchor="middle"
              font-family="Arial, Helvetica Neue, sans-serif" font-size="31" font-weight="800"
              fill="#FBF3DE" letter-spacing="2">11:00–14:00</text>
        <rect x="${x}" y="${boxTop}" width="${width}" height="${boxHeight}" rx="8"
              fill="#F8EFD9" fill-opacity="0.5" stroke="#17324D" stroke-width="3"/>
        <line x1="${dividerX}" y1="${boxTop + 34}" x2="${dividerX}" y2="${boxTop + boxHeight - 34}"
              stroke="#17324D" stroke-width="2.5" opacity="0.4"/>
        <text x="${leftX}" y="${boxTop + 105}" class="item-name" font-size="70">${esc(
          language === 'ru'
            ? 'АКЦИЯ'
            : language === 'en'
              ? 'SPECIAL'
              : 'АКЦИЯ · SPECIAL',
        )}</text>
        <text x="${leftX}" y="${boxTop + 205}" class="item-name" font-size="55">60,000 UZS</text>
        <line x1="${leftX - 4}" y1="${boxTop + 183}" x2="${leftX + 285}" y2="${boxTop + 183}"
              stroke="#9C2931" stroke-width="8"/>
        <text x="${leftX}" y="${boxTop + 340}" class="item-name" font-size="82">45,000 UZS</text>
        ${inclusions
          .map(
            (line, index) =>
              `<text x="${detailsX}" y="${boxTop + 92 + index * 76}" class="item-name" font-size="51">${esc(line)}</text>`,
          )
          .join('')}
      </g>`,
    y: boxTop + boxHeight + 54,
  }
}

async function renderScreen(screen, screenIndex) {
  let content = ''
  const runs = []
  const columnBottoms = []

  screen.columns.forEach((categoryIds, columnIndex) => {
    const x = outerX + columnIndex * (colW + gap)
    let y = contentTop
    if (columnIndex > 0) {
      content += `<line x1="${x - gap / 2}" y1="${contentTop - 73}" x2="${x - gap / 2}" y2="${footerY - 245}"
        stroke="#17324D" stroke-width="2.5" opacity="0.2"/>`
    }
    for (const categoryId of categoryIds) {
      const rendered =
        categoryId === '__business_lunch__'
          ? renderBusinessLunch(
              x,
              Math.max(y, 2920),
              colW,
              runs,
              screen.language,
            )
          : renderCategory(categoryId, x, y, colW, runs, screen.language)
      content += rendered.block
      y = rendered.y
    }
    columnBottoms.push(y)
  })

  const headerSubtitle =
    screen.language === 'ru'
      ? 'ТРАДИЦИОННАЯ УЗБЕКСКАЯ И ЕВРОПЕЙСКАЯ КУХНЯ'
      : 'TRADITIONAL UZBEK & EUROPEAN CUISINE'
  const floorLabel =
    screen.language === 'ru'
      ? '2-ЭТАЖ →'
      : screen.language === 'en'
        ? '2nd FLOOR →'
        : '2-ЭТАЖ · 2nd FLOOR →'
  const footerAddress =
    screen.language === 'en'
      ? '17 Matbuotchilar St · Tashkent'
      : 'Матбуотчилар, 17 · Ташкент'
  const footerHours =
    screen.language === 'ru'
      ? 'Ежедневно 08:00–01:00'
      : screen.language === 'en'
        ? 'Open daily 08:00–01:00'
        : 'Ежедневно · Open daily 08:00–01:00'

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Zar Kebab bilingual main menu — ${esc(screen.title)}</title>
  <desc>Main menu including active, hidden, and unavailable products from the retained categories.</desc>
  <defs>
    <filter id="logo-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#17324D" flood-opacity="0.22"/>
    </filter>
    <pattern id="header-diamonds" x="0" y="0" width="150" height="150" patternUnits="userSpaceOnUse">
      <path d="M 75 10 L 140 75 L 75 140 L 10 75 Z
               M 75 34 L 116 75 L 75 116 L 34 75 Z"
            fill="none" stroke="#6D8AAA" stroke-width="2" opacity="0.08"/>
    </pattern>
    <style>
      @font-face {
        font-family: "Neucha";
        src: url("${menuFont}") format("truetype");
        font-style: normal;
        font-weight: 400;
      }
      .section-title {
        font-family: "Arial", "Helvetica Neue", sans-serif;
        fill: #17324D;
        font-weight: 800;
        letter-spacing: 2px;
      }
      .item-name {
        font-family: "Neucha", cursive;
        fill: #202C33;
        font-weight: 400;
      }
      .item-en { fill: #285046; }
      .item-price {
        font-family: "Arial", "Helvetica Neue", sans-serif;
        fill: #17324D;
        font-size: 46px;
        font-weight: 700;
      }
    </style>
  </defs>

  <image href="${background}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>
  <g filter="url(#logo-shadow)">
    <rect x="30" y="28" width="${W - 60}" height="435" fill="#0D2C52"/>
    <rect x="30" y="28" width="${W - 60}" height="435" fill="url(#header-diamonds)"/>
    <line x1="92" y1="42" x2="${W - 92}" y2="42"
          stroke="#D5A12B" stroke-width="5"/>
    <line x1="92" y1="449" x2="${W - 92}" y2="449"
          stroke="#D5A12B" stroke-width="5"/>
    <line x1="150" y1="463" x2="${W - 150}" y2="463"
          stroke="#FBF3DE" stroke-width="3" opacity="0.88"/>
  </g>

  <g fill="none" stroke="#D5A12B" stroke-linecap="square" stroke-linejoin="miter">
    <path d="M 76 62 H 330 V 92 H 155 V 265 H 122 V 126 H 76 Z"
          stroke-width="12"/>
    <path d="M 76 92 L 165 181 L 76 270" stroke-width="10"/>
    <path d="M 108 92 L 197 181 L 108 270" stroke="#FBF3DE" stroke-width="7"/>
    <path d="M 165 100 L 246 181 L 165 262 L 84 181 Z" stroke-width="11"/>
    <path d="M 165 126 L 220 181 L 165 236 L 110 181 Z"
          stroke="#FBF3DE" stroke-width="6"/>
    <path d="M 125 306 H 270 V 340 H 178 V 420 H 140" stroke-width="11"/>
    <path d="M 232 292 l 18 -18 l 18 18 l -18 18 z" stroke-width="7"/>
    <path d="M 298 337 l 14 -14 l 14 14 l -14 14 z" stroke-width="6"/>

    <g transform="translate(${W} 0) scale(-1 1)">
      <path d="M 76 62 H 330 V 92 H 155 V 265 H 122 V 126 H 76 Z"
            stroke-width="12"/>
      <path d="M 76 92 L 165 181 L 76 270" stroke-width="10"/>
      <path d="M 108 92 L 197 181 L 108 270" stroke="#FBF3DE" stroke-width="7"/>
      <path d="M 165 100 L 246 181 L 165 262 L 84 181 Z" stroke-width="11"/>
      <path d="M 165 126 L 220 181 L 165 236 L 110 181 Z"
            stroke="#FBF3DE" stroke-width="6"/>
      <path d="M 125 306 H 270 V 340 H 178 V 420 H 140" stroke-width="11"/>
      <path d="M 232 292 l 18 -18 l 18 18 l -18 18 z" stroke-width="7"/>
      <path d="M 298 337 l 14 -14 l 14 14 l -14 14 z" stroke-width="6"/>
    </g>
  </g>

  <image href="${logo}" x="1060" y="-52" width="650" height="650" filter="url(#logo-shadow)"/>
  <text x="4360" y="192" text-anchor="middle"
        font-family="Georgia, Times New Roman, serif"
        font-size="${screen.language === 'bilingual' ? 104 : 132}" font-weight="700"
        fill="#FBF3DE" letter-spacing="${screen.language === 'bilingual' ? 9 : 13}"
        filter="url(#logo-shadow)">${esc(screen.title)}</text>
  <g fill="#D5A12B">
    <path d="M 2815 263 l 17 -17 l 17 17 l -17 17 z"/>
    <path d="M 5890 263 l 17 -17 l 17 17 l -17 17 z"/>
  </g>
  <line x1="2890" y1="263" x2="5832" y2="263"
        stroke="#D5A12B" stroke-width="5" opacity="0.95"/>
  <text x="4360" y="352" text-anchor="middle"
        font-family="Arial, Helvetica Neue, sans-serif"
        font-size="${screen.language === 'bilingual' ? 37 : 42}" font-weight="700"
        fill="#F0B62C" letter-spacing="${screen.language === 'ru' ? 5 : 9}">${esc(headerSubtitle)}</text>
  <g fill="none" stroke="#D5A12B" stroke-width="4" opacity="0.95">
    <path d="M 4025 406 H 4225 C 4265 406 4278 370 4304 370
             C 4330 370 4342 406 4360 406
             C 4378 406 4390 370 4416 370
             C 4442 370 4455 406 4495 406 H 4695"/>
    <path d="M 4360 370 l 27 36 l -27 36 l -27 -36 z"/>
    <circle cx="3978" cy="406" r="7" fill="#D5A12B" stroke="none"/>
    <circle cx="4742" cy="406" r="7" fill="#D5A12B" stroke="none"/>
  </g>

  ${content}

  <g>
    <line x1="${W - 3050}" y1="${footerY - 178}" x2="${W - 2460}" y2="${footerY - 178}"
          stroke="#B58A32" stroke-width="3" opacity="0.72"/>
    <path d="M ${W - 2400} ${footerY - 178} l 16 -16 l 16 16 l -16 16 z" fill="#B58A32"/>
    <text x="${W - 520}" y="${footerY - 140}" text-anchor="end"
          font-family="Arial, Helvetica Neue, sans-serif" font-size="116" font-weight="900"
          fill="#17324D" letter-spacing="7">${esc(floorLabel)}</text>
  </g>

  <line x1="${outerX}" y1="${footerY - 72}" x2="${W - outerX}" y2="${footerY - 72}"
        stroke="#17324D" stroke-width="3" opacity="0.58"/>
  <text x="820" y="${footerY - 10}" font-family="Arial, Helvetica Neue, sans-serif"
        font-size="32" font-weight="700" fill="#17324D">${esc(footerAddress)}</text>
  <text x="${W / 2}" y="${footerY - 10}" text-anchor="middle"
        font-family="Arial, Helvetica Neue, sans-serif" font-size="32" font-weight="700"
        fill="#17324D">+998 90 509-55-45 · zarkebab.uz</text>
  <text x="${W - 820}" y="${footerY - 10}" text-anchor="end"
        font-family="Arial, Helvetica Neue, sans-serif" font-size="32" font-weight="700"
        fill="#17324D">${esc(footerHours)}</text>
</svg>`

  const svgPath = path.join(outDir, `zar-kebab-full-menu-${screen.slug}.svg`)
  const pngPath = path.join(outDir, `zar-kebab-full-menu-${screen.slug}.png`)
  fs.writeFileSync(svgPath, svg)

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zar-full-menu-'))
  const textRunsPath = path.join(tempDir, 'text-runs.json')
  const overlayPath = path.join(tempDir, 'text-overlay.png')
  try {
    fs.writeFileSync(
      textRunsPath,
      JSON.stringify({
        width: W,
        height: H,
        fontSize: ITEM_FONT_SIZE,
        runs,
      }),
    )
    const overlayResult = spawnSync(
      pythonExecutable,
      [overlayScriptPath, textRunsPath, overlayPath],
      { encoding: 'utf8' },
    )
    if (overlayResult.status !== 0) {
      throw new Error(
        `Menu font overlay failed: ${overlayResult.stderr || overlayResult.stdout}`,
      )
    }

    const rasterSvg = svg.replace(
      '</style>',
      '.item-name { opacity: 0; }</style>',
    )
    await sharp(Buffer.from(rasterSvg), { limitInputPixels: false })
      .composite([{ input: overlayPath }])
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(pngPath)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  return {
    svgPath,
    pngPath,
    itemCount: screen.columns
      .flat()
      .reduce(
        (total, categoryId) =>
          total +
          (categoryId === '__business_lunch__'
            ? 0
            : itemsByCategory.get(categoryId)?.length || 0),
        0,
      ),
    maxColumnBottom: Math.max(...columnBottoms),
  }
}

const renderedScreens = []
for (let screenIndex = 0; screenIndex < screens.length; screenIndex += 1) {
  renderedScreens.push(await renderScreen(screens[screenIndex], screenIndex))
}

const previewWidth = 3600
const previewScreenHeight = 2100
const previewPaths = await Promise.all(
  renderedScreens.map(async (screen, index) => {
    const slug = screens[index].slug
    const previewPath = path.join(
      outDir,
      slug === 'one-page'
        ? 'zar-kebab-menu-one-page-preview.png'
        : `zar-kebab-menu-${slug}-preview.png`,
    )
    await sharp(screen.pngPath)
      .resize(previewWidth, previewScreenHeight, { fit: 'fill' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(previewPath)
    return previewPath
  }),
)

console.log(
  JSON.stringify(
    {
      catalogItems: catalog.items.length,
      catalogCategories: catalog.categories.length,
      includedItems: renderedScreens.reduce(
        (total, screen) => total + screen.itemCount,
        0,
      ),
      screens: renderedScreens,
      previewPaths,
    },
    null,
    2,
  ),
)
