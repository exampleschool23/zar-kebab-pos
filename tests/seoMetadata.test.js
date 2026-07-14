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
  assert.match(html, /<title>Zar Kebab — ресторан узбекской кухни<\/title>/)
  assert.match(html, /name="description"/)
  assert.match(html, /Меню · Акции · Кейтеринг · Контакты/)
  assert.match(html, /\+998 90 509-55-45/)
  assert.doesNotMatch(html, /<title>[^<]*POS[^<]*<\/title>/)
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
  assert.match(html, /"@type": "Restaurant"/)
  assert.match(html, /"logo": "https:\/\/www\.zarkebab\.uz\/brand\/zarkebab-logo\.png"/)
})

test('search crawlers receive real robots and sitemap files', () => {
  assert.match(robots, /User-agent: \*/)
  assert.match(robots, /Allow: \//)
  assert.match(robots, /Sitemap: https:\/\/www\.zarkebab\.uz\/sitemap\.xml/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/menu<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/www\.zarkebab\.uz\/catering<\/loc>/)
})
