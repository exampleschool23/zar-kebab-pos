import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8')
const sitemap = fs.readFileSync(path.join(root, 'public/sitemap.xml'), 'utf8')

test('public site metadata describes the restaurant instead of the POS', () => {
  assert.match(html, /<html lang="ru">/)
  assert.match(html, /<title>Zar Kebab — Uzbek, Uyghur &amp; Turkish restaurant<\/title>/)
  assert.match(html, /name="description"/)
  assert.match(html, /Reservation · About us · Menu · Promotions · Vacancy · Contacts\. Order type\./)
  assert.match(html, /\+998905095545\. Every day from 08:00 to 01:00\./)
  assert.doesNotMatch(html, /<title>[^<]*POS[^<]*<\/title>/)
  assert.match(html, /<h1>Zar Kebab — Uzbek, Uyghur &amp; Turkish restaurant in Tashkent<\/h1>/)
  assert.match(html, /href="\/menu">Меню<\/a>/)
})

test('public site metadata uses the Zar Kebab logo and canonical domain', () => {
  assert.match(html, /rel="icon"[^>]+\/brand\/zarkebab-logo\.png/)
  assert.match(html, /rel="icon"[^>]+sizes="512x512"/)
  assert.match(html, /rel="apple-touch-icon"[^>]+\/brand\/zarkebab-logo\.png/)
  assert.match(html, /rel="canonical" href="https:\/\/www\.zarkebab\.uz\/"/)
  assert.match(html, /property="og:title"/)
  assert.match(html, /property="og:description"/)
  assert.match(html, /property="og:image"/)
  assert.match(html, /type="application\/ld\+json"/)
  assert.match(html, /"@type": "WebSite"/)
  assert.match(html, /"alternateName": "ZarKebab"/)
  assert.match(html, /"@type": "Restaurant"/)
  assert.match(html, /"servesCuisine": \["Uzbek", "Uyghur", "Turkish", "Kebab"\]/)
  assert.match(html, /"@type": "PostalAddress"/)
  assert.match(html, /"streetAddress": "Matbuotchilar ko‘chasi, 17"/)
  assert.match(html, /"addressLocality": "Tashkent"/)
  assert.match(html, /"addressCountry": "UZ"/)
  assert.match(html, /"acceptsReservations": true/)
  assert.match(html, /"@type": "OpeningHoursSpecification"/)
  assert.match(html, /"opens": "08:00"/)
  assert.match(html, /"closes": "01:00"/)
  assert.match(html, /"logo": "https:\/\/www\.zarkebab\.uz\/brand\/zarkebab-logo\.png"/)
})

test('public menu reinforces homepage search signals and hides controls from snippets', () => {
  const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
  const menu = fs.readFileSync(path.join(root, 'src/pages/PublicMenu.jsx'), 'utf8')

  assert.match(app, /<Route path="\/" element={<PublicMenu \/>} \/>/)
  assert.match(menu, /document\.title = seo\.title/)
  assert.match(menu, /<h1[^>]*>{seo\.heading}<\/h1>/)
  assert.match(menu, /<div data-nosnippet="">\s*<header ref=\{headerRef\}/)
  assert.match(menu, /<div data-nosnippet="">\s*<MenuCategoryScroller/)
  assert.match(menu, /PUBLIC_CONTACTS\.location\.href/)
  assert.match(menu, /https:\/\/yandex\.com\/maps\/org\/zarkebab\/34684464035\//)
})

test('search crawlers receive real robots and sitemap files', () => {
  assert.match(robots, /User-agent: \*/)
  assert.match(robots, /Allow: \//)
  assert.match(robots, /Sitemap: https:\/\/www\.zarkebab\.uz\/sitemap\.xml/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/menu<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/catering<\/loc>/)
})
