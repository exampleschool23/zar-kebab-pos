import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const outDir = path.join(root, 'artifacts')
const backgroundPath = path.join(outDir, 'zar-kebab-menu-background.png')
const logoPath = path.join(root, 'src/assets/brand/zarkebab_logo.png')
const handFontPath = path.join(outDir, 'fonts/EduVICWANTHand-Regular.ttf')
const cyrillicHandFontPath = path.join(outDir, 'fonts/Caveat-Variable.ttf')
const fontConfigPath = path.join(outDir, 'fonts/menu-fontconfig.xml')
const fontCachePath = path.join(outDir, '.fontconfig-cache')
const textOverlayScriptPath = path.join(root, 'scripts/render-menu-text-overlay.py')
const svgPath = path.join(outDir, 'zar-kebab-menu-board-bilingual-matched.svg')
const pngPath = path.join(outDir, 'zar-kebab-menu-board-bilingual-matched.png')

fs.mkdirSync(fontCachePath, { recursive: true })
fs.writeFileSync(
  fontConfigPath,
  `<?xml version="1.0"?>
<fontconfig>
  <dir>${path.dirname(handFontPath)}</dir>
  <dir>/System/Library/Fonts</dir>
  <dir>/System/Library/Fonts/Supplemental</dir>
  <dir>/Library/Fonts</dir>
  <cachedir>${fontCachePath}</cachedir>
</fontconfig>`,
)
process.env.FONTCONFIG_FILE = fontConfigPath

const { default: sharp } = await import('sharp')

const ruSections = [
  {
    title: 'АКЦИИ',
    accent: true,
    items: [
      ['Cет лайт', '183,000 → 155,000'],
      ['Сет комбо молотий', '255,000 → 220,000'],
    ],
  },
  {
    title: 'ШАШЛЫК',
    items: [
      ['Шашлык из бедра', '24,000'],
      ['Овощной шашлык', '20,000'],
      ['Шашлык из говядины', '35,000'],
      ['Куриные крылышки', '25,000'],
      ['Молотый шашлык', '25,000'],
      ['«Заркебаб» ассорти', '350,000'],
    ],
  },
  {
    title: 'ПЕРВЫЕ БЛЮДА',
    items: [
      ['Чечевичный суп', '30,000'],
      ['Мастава', '30,000'],
      ['Суп', '30,000'],
      ['Пельменный суп', '30,000'],
      ['Суп с фрикадельками', '30,000'],
      ['Окрошка', '35,000'],
      ['Кайнатма шурпа', '30,000'],
    ],
  },
  {
    title: 'ВТОРЫЕ БЛЮДА',
    items: [
      ['Чучвара с фаршем', '45,000'],
      ['Говяжий Кофте', '60,000'],
      ['Шейный казан-кебаб', '195,000'],
      ['Казан кебаб', '85,000'],
      ['Тайское мясо', '95,000'],
      ['Медальоны под сливочным соусом', '65,000'],
      ['Бефстроганов', '45,000'],
      ['Бифштекс', '42,000'],
      ['Силтама', '80,000'],
      ['Долма', '45,000'],
    ],
  },
  {
    title: 'САЛАТЫ',
    items: [
      ['Салат Цезарь', '40,000'],
      ['Свежий салат', '21,000'],
      ['Ачичук', '20,000'],
      ['Мужской каприз', '45,000'],
      ['Греческий салат', '50,000'],
      ['Хрустящий баклажан', '55,000'],
      ['Айран с овощами', '20,000'],
    ],
  },
  {
    title: 'ХЛЕБ',
    items: [['Хлеб', '5,000']],
  },
  {
    title: 'СЕТЫ',
    items: [
      ['Cет лайт', '155,000'],
      ['Сет комбо молотий', '220,000'],
      ['Zor set', '59,000'],
    ],
  },
  {
    title: 'ЧАЙ',
    items: [
      ['Чёрный чай', '8,000'],
      ['Малиновый чай', '25,000'],
      ['Чай с лимоном', '15,000'],
      ['Имбирный чай', '25,000'],
      ['Фруктовый чай', '25,000'],
      ['Зелёный чай', '8,000'],
    ],
  },
  {
    title: 'ГАЗИРОВАННЫЕ НАПИТКИ',
    items: [
      ['Кока-Кола', '20,000'],
      ['Пепси', '20,000'],
      ['Фанта', '20,000'],
      ['Бланк Блю', '30,000'],
      ['Боржоми', '29,000'],
      ['Фанта', '16,000'],
      ['Adrenaline', '27,000'],
      ['Red Bull', '32,000'],
      ['Hydrolife', '8,000'],
      ['Sprite', '23,000'],
    ],
  },
  {
    title: 'НАПИТКИ',
    items: [
      ['Компот «Болалик»', '20,000'],
      ['Вико', '30,000'],
      ['Блисс', '23,000'],
      ['Компот «Болалик»', '8,000'],
      ['Айран', '10,000'],
    ],
  },
  {
    title: 'ГАРНИРЫ',
    items: [
      ['Картофель фри', '20,000'],
      ['Ris', '15,000'],
    ],
  },
  {
    title: 'ДЕСЕРТЫ',
    items: [['Торт «Спартак»', '28,000']],
  },
  {
    title: 'КОФЕ',
    items: [
      ['Капучино', '25,000'],
      ['Латте', '25,000'],
      ['Американо', '25,000'],
      ['Эспрессо', '21,000'],
    ],
  },
]

const enSections = [
  {
    title: 'DEALS',
    accent: true,
    items: [
      ['Light Set', '183,000 → 155,000'],
      ['Minced Kebab Combo', '255,000 → 220,000'],
    ],
  },
  {
    title: 'SHASHLIK',
    items: [
      ['Chicken Thigh Shashlik', '24,000'],
      ['Vegetable Shashlik', '20,000'],
      ['Beef Shashlik', '35,000'],
      ['Chicken Wings', '25,000'],
      ['Minced Meat Shashlik', '25,000'],
      ['“Zarkebab” Assortment', '350,000'],
    ],
  },
  {
    title: 'FIRST COURSES',
    items: [
      ['Lentil Soup', '30,000'],
      ['Mastava', '30,000'],
      ['Meatball Soup', '30,000'],
      ['Pelmeni Soup', '30,000'],
      ['Meatball Soup', '30,000'],
      ['Okroshka', '35,000'],
      ['Boiled Beef Soup', '30,000'],
    ],
  },
  {
    title: 'MAIN DISHES',
    items: [
      ['Dumplings', '45,000'],
      ['Beef Kofta', '60,000'],
      ['Lamb Neck Kebab', '195,000'],
      ['Kazan Kebab', '85,000'],
      ['Thai Beef', '95,000'],
      ['Beef Medallions in Cream Sauce', '65,000'],
      ['Beef Stroganoff', '45,000'],
      ['Beefsteak', '42,000'],
      ['Siltama', '80,000'],
      ['Dolma', '45,000'],
    ],
  },
  {
    title: 'SALADS',
    items: [
      ['Caesar Salad', '40,000'],
      ['Fresh Salad', '21,000'],
      ['Achichuk Salad', '20,000'],
      ['Mujskoy Kapriz Salad', '45,000'],
      ['Greek Salad', '50,000'],
      ['Crispy Eggplant Salad', '55,000'],
      ['Vegetable Ayran', '20,000'],
    ],
  },
  {
    title: 'BREAD',
    items: [['Bread', '5,000']],
  },
  {
    title: 'DINNER SETS',
    items: [
      ['Light Set', '155,000'],
      ['Minced Kebab Combo', '220,000'],
      ['Zor Set', '59,000'],
    ],
  },
  {
    title: 'TEA',
    items: [
      ['Black Tea', '8,000'],
      ['Raspberry Tea', '25,000'],
      ['Lemon Tea', '15,000'],
      ['Ginger Tea', '25,000'],
      ['Fruit Tea', '25,000'],
      ['Green Tea', '8,000'],
    ],
  },
  {
    title: 'CARBONATED DRINKS',
    items: [
      ['Coca-Cola', '20,000'],
      ['Pepsi', '20,000'],
      ['Fanta', '20,000'],
      ['Blanc Bleu', '30,000'],
      ['Borjomi', '29,000'],
      ['Fanta', '16,000'],
      ['Adrenaline', '27,000'],
      ['Red Bull', '32,000'],
      ['Hydrolife', '8,000'],
      ['Sprite', '23,000'],
    ],
  },
  {
    title: 'DRINKS',
    items: [
      ['“Childhood” Compote', '20,000'],
      ['Viko', '30,000'],
      ['Bliss', '23,000'],
      ['“Childhood” Compote', '8,000'],
      ['Ayran', '10,000'],
    ],
  },
  {
    title: 'SIDES',
    items: [
      ['French Fries', '20,000'],
      ['Rice', '15,000'],
    ],
  },
  {
    title: 'DESSERTS',
    items: [['“Spartak” Cake', '28,000']],
  },
  {
    title: 'COFFEE',
    items: [
      ['Cappuccino', '25,000'],
      ['Latte', '25,000'],
      ['Americano', '25,000'],
      ['Espresso', '21,000'],
    ],
  },
]

const pairedSections = ruSections.map((ruSection, sectionIndex) => {
  const enSection = enSections[sectionIndex]
  return {
    titleRu: ruSection.title,
    titleEn: enSection.title,
    accent: ruSection.accent,
    items: ruSection.items.map(([ru, price], itemIndex) => ({
      ru,
      en: enSection.items[itemIndex][0],
      price,
    })),
  }
})

const columns = [
  pairedSections.slice(0, 3),
  pairedSections.slice(3, 5),
  [
    pairedSections.find((section) => section.titleRu === 'ХЛЕБ'),
    pairedSections.find((section) => section.titleRu === 'СЕТЫ'),
    pairedSections.find((section) => section.titleRu === 'ЧАЙ'),
    pairedSections.find((section) => section.titleRu === 'ГАРНИРЫ'),
  ],
  [
    pairedSections.find((section) => section.titleRu === 'ГАЗИРОВАННЫЕ НАПИТКИ'),
    pairedSections.find((section) => section.titleRu === 'НАПИТКИ'),
    pairedSections.find((section) => section.titleRu === 'ДЕСЕРТЫ'),
    pairedSections.find((section) => section.titleRu === 'КОФЕ'),
  ],
]

const W = 7200
const H = 4200
const outerX = 380
const contentTop = 770
const footerY = 3940
const gap = 110
const colW = (W - outerX * 2 - gap * 3) / 4

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
const handFont = asDataUri(handFontPath, 'font/ttf')
const cyrillicHandFont = asDataUri(cyrillicHandFontPath, 'font/ttf')

const ITEM_FONT_SIZE = 64
const ITEM_LINE_HEIGHT = 72
const ITEM_WRAP_LIMIT = 17
const itemTextRuns = []

function wrapItemName(name) {
  if (name.length <= ITEM_WRAP_LIMIT) return [name]

  const words = name.split(/\s+/)
  let firstLine = ''
  let secondLine = ''

  for (const word of words) {
    const candidate = firstLine ? `${firstLine} ${word}` : word
    if (!secondLine && candidate.length <= ITEM_WRAP_LIMIT) {
      firstLine = candidate
    } else {
      secondLine = secondLine ? `${secondLine} ${word}` : word
    }
  }

  return secondLine ? [firstLine, secondLine] : [name]
}

function renderSection(section, x, y, width) {
  const headingColor = section.accent ? '#A2272D' : '#17324D'
  const heading = `${section.titleRu} / ${section.titleEn}`
  const headingSize = heading.length > 42 ? 45 : heading.length > 31 ? 52 : 60
  const englishX = x + width * 0.455
  const priceX = x + width
  let block = `
    <g>
      <text x="${x}" y="${y}" class="section-title" font-size="${headingSize}" fill="${headingColor}">${esc(heading)}</text>
      <line x1="${x}" y1="${y + 18}" x2="${x + width}" y2="${y + 18}" stroke="${headingColor}" stroke-width="4" opacity="0.85"/>
    </g>`

  y += 88
  for (const item of section.items) {
    const isPromo = section.accent
    const ruLines = wrapItemName(item.ru)
    const enLines = wrapItemName(item.en)
    const lineCount = Math.max(ruLines.length, enLines.length)
    const rowBottom = y + (lineCount - 1) * ITEM_LINE_HEIGHT + 24
    const priceY = y + (lineCount - 1) * (ITEM_LINE_HEIGHT / 2)
    ruLines.forEach((line, lineIndex) => {
      itemTextRuns.push({
        x,
        y: y + lineIndex * ITEM_LINE_HEIGHT,
        text: line,
        color: '#202C33',
        fontPath: cyrillicHandFontPath,
      })
    })
    enLines.forEach((line, lineIndex) => {
      itemTextRuns.push({
        x: englishX,
        y: y + lineIndex * ITEM_LINE_HEIGHT,
        text: line,
        color: '#285046',
        fontPath: handFontPath,
      })
    })
    block += `
      <g>
        <text x="${x}" y="${y}" class="item-name item-ru" font-size="${ITEM_FONT_SIZE}">
          ${ruLines.map((line, lineIndex) => `<tspan x="${x}" dy="${lineIndex === 0 ? 0 : ITEM_LINE_HEIGHT}">${esc(line)}</tspan>`).join('')}
        </text>
        <text x="${englishX}" y="${y}" class="item-name item-en" font-size="${ITEM_FONT_SIZE}">
          ${enLines.map((line, lineIndex) => `<tspan x="${englishX}" dy="${lineIndex === 0 ? 0 : ITEM_LINE_HEIGHT}">${esc(line)}</tspan>`).join('')}
        </text>
        <text x="${priceX}" y="${priceY}" text-anchor="end"
              class="${isPromo ? 'promo-price' : 'item-price'}">${esc(item.price)}</text>
        <line x1="${x}" y1="${rowBottom}" x2="${x + width}" y2="${rowBottom}"
              stroke="#B7A98A" stroke-width="2" stroke-dasharray="4 10" opacity="0.45"/>
      </g>`
    y += 108 + (lineCount - 1) * ITEM_LINE_HEIGHT
  }
  return { block, y: y + 50 }
}

let content = ''
columns.forEach((column, index) => {
  const x = outerX + index * (colW + gap)
  let y = contentTop
  if (index > 0) {
    content += `<line x1="${x - gap / 2}" y1="${contentTop - 73}" x2="${x - gap / 2}" y2="${footerY - 84}"
      stroke="#17324D" stroke-width="2.5" opacity="0.2"/>`
  }
  content += `
    <text x="${x}" y="${contentTop - 100}" class="guide-label">РУССКИЙ</text>
    <text x="${x + colW * 0.455}" y="${contentTop - 100}" class="guide-label guide-en">ENGLISH</text>
    <text x="${x + colW}" y="${contentTop - 100}" text-anchor="end" class="guide-label">UZS</text>`
  for (const section of column) {
    const rendered = renderSection(section, x, y, colW)
    content += rendered.block
    y = rendered.y
  }
})

const bottomRussian = 'С огня — к вашему столу'
const bottomEnglish = 'Fresh from the fire · Made with heart'
const bottomRussianY = footerY - 192
const bottomEnglishY = footerY - 112

itemTextRuns.push(
  {
    x: W / 2,
    y: bottomRussianY,
    text: bottomRussian,
    color: '#17324D',
    fontPath: cyrillicHandFontPath,
    fontSize: 72,
    anchor: 'ms',
  },
  {
    x: W / 2,
    y: bottomEnglishY,
    text: bottomEnglish,
    color: '#8A6930',
    fontPath: handFontPath,
    fontSize: 62,
    anchor: 'ms',
  },
)

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Zar Kebab bilingual Russian and English menu board</title>
  <desc>Every menu row pairs Russian on the left with matching English on the right, using current categories and prices from zarkebab.uz.</desc>
  <defs>
    <filter id="logo-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#17324D" flood-opacity="0.22"/>
    </filter>
    <style>
      @font-face {
        font-family: "Edu VIC WA NT Hand";
        src: url("${handFont}") format("truetype");
        font-style: normal;
        font-weight: 400;
      }
      @font-face {
        font-family: "Caveat";
        src: url("${cyrillicHandFont}") format("truetype");
        font-style: normal;
        font-weight: 400;
      }
      .section-title {
        font-family: "Arial", "Helvetica Neue", sans-serif;
        font-weight: 800;
        letter-spacing: 2.5px;
      }
      .item-name {
        font-family: "Edu VIC WA NT Hand", cursive;
        fill: #202C33;
        font-weight: 400;
      }
      .item-ru {
        font-family: "Caveat", cursive;
      }
      .item-en {
        fill: #285046;
      }
      .item-price {
        font-family: "Arial", "Helvetica Neue", sans-serif;
        fill: #17324D;
        font-size: 48px;
        font-weight: 700;
      }
      .promo-price {
        font-family: "Arial", "Helvetica Neue", sans-serif;
        fill: #A2272D;
        font-size: 38px;
        font-weight: 800;
      }
      .guide-label {
        font-family: "Arial", "Helvetica Neue", sans-serif;
        fill: #8A6930;
        font-size: 25px;
        font-weight: 800;
        letter-spacing: 4px;
      }
      .guide-en {
        fill: #285046;
      }
    </style>
  </defs>

  <image href="${background}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>
  <image href="${logo}" x="${W / 2 - 205}" y="45" width="410" height="410" filter="url(#logo-shadow)"/>
  <text x="${W / 2}" y="510" text-anchor="middle"
        font-family="Arial, Helvetica Neue, sans-serif" font-size="70" font-weight="900"
        fill="#17324D" letter-spacing="16">МЕНЮ • MENU</text>
  <text x="${W / 2}" y="575" text-anchor="middle"
        font-family="Arial, Helvetica Neue, sans-serif" font-size="27" font-weight="700"
        fill="#8A6930" letter-spacing="6">УЗБЕКСКАЯ • УЙГУРСКАЯ • ТУРЕЦКАЯ  /  UZBEK • UYGHUR • TURKISH</text>

  ${content}

  <g>
    <line x1="${W / 2 - 1180}" y1="${bottomRussianY - 25}" x2="${W / 2 - 520}" y2="${bottomRussianY - 25}"
          stroke="#B58A32" stroke-width="3" opacity="0.72"/>
    <path d="M ${W / 2 - 465} ${bottomRussianY - 25} l 18 -18 l 18 18 l -18 18 z"
          fill="#B58A32" opacity="0.85"/>
    <path d="M ${W / 2 + 465} ${bottomRussianY - 25} l 18 -18 l 18 18 l -18 18 z"
          fill="#B58A32" opacity="0.85"/>
    <line x1="${W / 2 + 520}" y1="${bottomRussianY - 25}" x2="${W / 2 + 1180}" y2="${bottomRussianY - 25}"
          stroke="#B58A32" stroke-width="3" opacity="0.72"/>
    <text x="${W / 2}" y="${bottomRussianY}" text-anchor="middle"
          class="item-name item-ru" font-size="72">${esc(bottomRussian)}</text>
    <text x="${W / 2}" y="${bottomEnglishY}" text-anchor="middle"
          class="item-name item-en" font-size="62">${esc(bottomEnglish)}</text>
  </g>

  <line x1="${outerX}" y1="${footerY - 36}" x2="${W - outerX}" y2="${footerY - 36}"
        stroke="#17324D" stroke-width="3" opacity="0.58"/>
  <text x="820" y="${footerY + 27}" font-family="Arial, Helvetica Neue, sans-serif"
        font-size="34" font-weight="700" fill="#17324D">Матбуотчилар, 17 · Ташкент</text>
  <text x="${W / 2}" y="${footerY + 27}" text-anchor="middle"
        font-family="Arial, Helvetica Neue, sans-serif" font-size="34" font-weight="700"
        fill="#17324D">+998 90 509-55-45 · zarkebab.uz</text>
  <text x="${W - 820}" y="${footerY + 27}" text-anchor="end"
        font-family="Arial, Helvetica Neue, sans-serif" font-size="34" font-weight="700"
        fill="#17324D">Open daily · Ежедневно 08:00–01:00</text>
  <text x="${W / 2}" y="${footerY + 96}" text-anchor="middle"
        font-family="Arial, Helvetica Neue, sans-serif" font-size="27" font-weight="600"
        fill="#6B6458">Цены указаны в UZS · Prices are in UZS · 28 July 2026</text>
</svg>`

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(svgPath, svg)

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zar-menu-font-'))
const textRunsPath = path.join(tempDir, 'text-runs.json')
const overlayPath = path.join(tempDir, 'text-overlay.png')
const bundledPython =
  '/Users/hoggish/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
const pythonExecutable = fs.existsSync(bundledPython) ? bundledPython : 'python3'

try {
  fs.writeFileSync(
    textRunsPath,
    JSON.stringify({
      width: W,
      height: H,
      fontSize: ITEM_FONT_SIZE,
      runs: itemTextRuns,
    }),
  )

  const overlayResult = spawnSync(
    pythonExecutable,
    [textOverlayScriptPath, textRunsPath, overlayPath],
    { encoding: 'utf8' },
  )
  if (overlayResult.status !== 0) {
    throw new Error(
      `Menu font overlay failed: ${overlayResult.stderr || overlayResult.stdout}`,
    )
  }

  const rasterSvg = svg.replace('</style>', '.item-name { opacity: 0; }</style>')
  await sharp(Buffer.from(rasterSvg), { limitInputPixels: false })
    .composite([{ input: overlayPath }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(pngPath)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log(JSON.stringify({ svgPath, pngPath }, null, 2))
