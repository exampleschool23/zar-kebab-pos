import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { isWaiterMenuCategory, isCustomerMenuCategory, isWaiterMenuItem } from '../src/lib/menuItems.js'

const afterLunch = new Date('2026-09-22T23:00:00')
const lunch = { visible_from_time: '11:00', visible_until_time: '15:00', always_visible_game_club: true }

test('Game Club bypasses only opted-in category schedules for every staff member', () => {
  for (const staff of ['', 'waiter-1', 'waiter-2']) {
    assert.equal(isWaiterMenuCategory(lunch, afterLunch, staff, 'game_club'), true)
    for (const channel of ['dine_in', 'delivery', 'take_away', '']) {
      assert.equal(isWaiterMenuCategory(lunch, afterLunch, staff, channel), false)
    }
  }
  assert.equal(isWaiterMenuCategory({ ...lunch, always_visible_game_club: false }, afterLunch, '', 'game_club'), false)
  assert.equal(isCustomerMenuCategory(lunch, afterLunch), false)
  assert.equal(isWaiterMenuCategory({ ...lunch, waiter_hidden: true }, afterLunch, '', 'game_club'), false)
  assert.equal(isWaiterMenuCategory({ ...lunch, deleted_at: '2026-09-22' }, afterLunch, '', 'game_club'), false)
  assert.equal(isWaiterMenuItem({ available: false }, afterLunch), false)
  assert.equal(isWaiterMenuItem({ available: true, deleted_at: '2026-09-22' }, afterLunch), false)
})

test('schedule selections support every combination of Take Away, Delivery, and Game Club', () => {
  const channels = ['take_away', 'delivery', 'game_club']
  for (let mask = 0; mask < 8; mask += 1) {
    const category = { ...lunch }
    channels.forEach((channel, index) => { category[`always_visible_${channel}`] = !!(mask & (1 << index)) })
    for (const channel of channels) {
      const enabled = category[`always_visible_${channel}`]
      assert.equal(isWaiterMenuCategory(category, afterLunch, 'staff', channel), enabled)
      assert.equal(isWaiterMenuCategory(category, new Date('2026-09-22T12:00:00'), 'staff', channel), true)
      assert.equal(isWaiterMenuCategory({ ...category, waiter_hidden: true }, afterLunch, 'staff', channel), false)
      assert.equal(isWaiterMenuCategory({ ...category, deleted_at: '2026-09-22' }, afterLunch, 'staff', channel), false)
    }
    assert.equal(isWaiterMenuCategory(category, afterLunch, 'staff', 'dine_in'), false)
    assert.equal(isWaiterMenuCategory(category, afterLunch, 'staff', 'unknown'), false)
    assert.equal(isCustomerMenuCategory(category, afterLunch), false)
  }
})

test('migration enables existing localized Business lunch categories and preserves schedules', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create table menu_categories (
      id text primary key, name_en text, name_ru text, name_uz text,
      visible_from_time time default '11:00', visible_until_time time default '15:00'
    );
    insert into menu_categories (id, name_en, name_ru, name_uz) values
      ('en', ' Business lunch ', null, null), ('ru', null, 'Бизнес-ланч', null),
      ('uz', null, null, 'Biznes lanch'), ('other', 'Dinner', null, null);`)
    await db.exec(readFileSync(new URL('../supabase/205_game_club_category_schedule.sql', import.meta.url), 'utf8'))
    const { rows } = await db.query('select id, always_visible_game_club, always_visible_take_away, always_visible_delivery, visible_until_time from menu_categories order by id')
    assert.deepEqual(rows.map(row => [row.id, row.always_visible_game_club]), [['en', true], ['other', false], ['ru', true], ['uz', true]])
    assert.ok(rows.every(row => row.visible_until_time === '15:00:00'))
    assert.ok(rows.every(row => !row.always_visible_take_away && !row.always_visible_delivery))
    await db.exec("update menu_categories set always_visible_take_away = true, always_visible_delivery = true where id = 'en'")
    const selected = (await db.query("select * from menu_categories where id = 'en'")).rows[0]
    for (const channel of ['take_away', 'delivery', 'game_club']) {
      assert.equal(isWaiterMenuCategory(selected, afterLunch, 'staff', channel), true)
    }
    await db.exec("update menu_categories set name_en = 'Renamed' where id = 'en'")
    assert.equal((await db.query("select always_visible_game_club from menu_categories where id = 'en'")).rows[0].always_visible_game_club, true)
  } finally {
    await db.close()
  }
})
