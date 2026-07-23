import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MENU_PRODUCT_MEDIA_ACCEPT,
  getMenuItemMediaUrls,
  getMenuItemPrimaryMediaUrl,
  isMenuVideoMimeType,
  isMenuVideoUrl,
  normalizeMenuMediaUrls,
} from '../src/lib/menuMedia.js'

test('menu media detects supported MP4 and WebM URLs with query strings', () => {
  assert.equal(isMenuVideoUrl('https://cdn.example.com/menu/kebab.mp4'), true)
  assert.equal(isMenuVideoUrl('https://cdn.example.com/menu/kebab.WEBM?v=2#clip'), true)
  assert.equal(isMenuVideoUrl('https://cdn.example.com/menu/kebab.gif'), false)
  assert.equal(isMenuVideoUrl('https://cdn.example.com/menu/kebab.jpg'), false)
})

test('menu product media accepts animated images and browser-safe video formats', () => {
  assert.equal(isMenuVideoMimeType('video/mp4'), true)
  assert.equal(isMenuVideoMimeType('VIDEO/WEBM'), true)
  assert.equal(isMenuVideoMimeType('video/quicktime'), false)
  assert.match(MENU_PRODUCT_MEDIA_ACCEPT, /image\/gif/)
  assert.match(MENU_PRODUCT_MEDIA_ACCEPT, /video\/mp4/)
  assert.match(MENU_PRODUCT_MEDIA_ACCEPT, /video\/webm/)
})

test('menu item galleries keep the cover first and remove duplicate URLs', () => {
  const item = {
    image_url: 'https://cdn.example.com/cover.jpg',
    media_urls: [
      'https://cdn.example.com/second.gif',
      'https://cdn.example.com/cover.jpg',
      'https://cdn.example.com/cooking.mp4',
    ],
  }

  assert.deepEqual(getMenuItemMediaUrls(item), [
    'https://cdn.example.com/cover.jpg',
    'https://cdn.example.com/second.gif',
    'https://cdn.example.com/cooking.mp4',
  ])
  assert.equal(getMenuItemPrimaryMediaUrl(item), 'https://cdn.example.com/cover.jpg')
  assert.deepEqual(normalizeMenuMediaUrls([' one.jpg ', '', 'one.jpg', 'two.webp']), ['one.jpg', 'two.webp'])
})
