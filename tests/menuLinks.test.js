import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findMenuItemByLinkKey,
  getMenuItemLinkKey,
  getMenuItemPublicPath,
  getMenuItemPublicUrl,
} from '../src/lib/menuLinks.js'

test('public menu item links prefer immutable external ids and resolve by external id or row id', () => {
  const item = { id: 'internal-1', external_id: 'zkb_abc123', name_en: 'Lula kebab' }
  const fallbackItem = { id: 'internal-2', name_en: 'Soup' }
  const items = [item, fallbackItem]

  assert.equal(getMenuItemLinkKey(item), 'zkb_abc123')
  assert.equal(getMenuItemPublicPath(item), '/menu/item/zkb_abc123')
  assert.equal(getMenuItemPublicPath(fallbackItem), '/menu/item/internal-2')
  assert.equal(getMenuItemPublicPath(item, '/premium-menu'), '/premium-menu/item/zkb_abc123')
  assert.equal(getMenuItemPublicUrl(item, 'https://zar-kebab-pos.vercel.app'), 'https://zar-kebab-pos.vercel.app/menu/item/zkb_abc123')
  assert.equal(getMenuItemPublicUrl(item, 'https://zar-kebab-pos.vercel.app', '/premium-menu'), 'https://zar-kebab-pos.vercel.app/premium-menu/item/zkb_abc123')
  assert.equal(findMenuItemByLinkKey(items, 'zkb_abc123'), item)
  assert.equal(findMenuItemByLinkKey(items, 'internal-2'), fallbackItem)
  assert.equal(findMenuItemByLinkKey(items, 'missing'), null)
})
