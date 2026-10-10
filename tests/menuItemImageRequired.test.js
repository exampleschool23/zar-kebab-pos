import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { hasMenuItemImage } from '../src/lib/menuMedia.js'
import { writeErrorReason } from '../src/lib/writeErrorMessage.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('new menu items need at least one still image', () => {
  assert.equal(hasMenuItemImage([]), false)
  assert.equal(hasMenuItemImage(['', '  ']), false)
  assert.equal(hasMenuItemImage(['https://cdn.example/clip.mp4']), false)
  assert.equal(hasMenuItemImage(['https://cdn.example/clip.webm', 'https://cdn.example/plov.webp']), true)
  assert.equal(hasMenuItemImage(['https://cdn.example/plov.gif']), true)
  assert.equal(writeErrorReason(new Error('menu_item_image_required')), 'image')
})

test('admin menu and the create write path both enforce the product image', () => {
  const page = read('src/pages/AdminMenu.jsx')
  const db = read('src/lib/db.js')
  assert.match(page, /const hasRequiredNewItemImage = itemModal !== 'new' \|\| hasMenuItemImage\(form\.media_urls\)/)
  assert.match(page, /&& hasRequiredNewItemImage\n/)
  assert.equal((page.match(/required=\{itemModal === 'new'\}\n/g) || []).length, 2)
  assert.match(db, /if \(!hasMenuItemImage\(\[fields\.image_url, \.\.\.\(fields\.media_urls \|\| \[\]\)\]\)\) \{\n\s*throw new Error\('menu_item_image_required'\)/)
})

test('database rejects new menu items without a cover image but keeps legacy rows editable', async t => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`create table menu_items(id text primary key, name_uz text, image_url text);
    insert into menu_items values ('legacy', 'Old', null);`)
  await db.exec(read('migrations/222_require_menu_item_image.sql'))

  await assert.rejects(db.query(`insert into menu_items values ('a', 'A', '')`), /menu_item_image_required/)
  await assert.rejects(db.query(`insert into menu_items values ('b', 'B', null)`), /menu_item_image_required/)
  await db.query(`insert into menu_items values ('c', 'C', 'https://cdn.example/c.webp')`)
  await db.query(`update menu_items set name_uz = 'Still old' where id = 'legacy'`)
  const { rows } = await db.query(`select id from menu_items order by id`)
  assert.deepEqual(rows.map(row => row.id), ['c', 'legacy'])
})
