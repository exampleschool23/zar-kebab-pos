import test from 'node:test'
import assert from 'node:assert/strict'

import { getMenuCategoryScrollTarget } from '../src/lib/menuCategoryScroll.js'

test('collapsed sticky category bar scrolls the selected section above its occupied height', () => {
  const base = {
    sectionTop: 900,
    rootTop: 80,
    scrollTop: 500,
    scrollOffset: 84,
  }

  const expandedTarget = getMenuCategoryScrollTarget({
    ...base,
    stickyBarOffset: 0,
  })
  const collapsedTarget = getMenuCategoryScrollTarget({
    ...base,
    stickyBarOffset: 56,
  })

  assert.equal(collapsedTarget, expandedTarget + 56)
})

test('category scroll target never becomes negative', () => {
  assert.equal(getMenuCategoryScrollTarget({
    sectionTop: 20,
    rootTop: 80,
    scrollTop: 0,
    scrollOffset: 84,
    stickyBarOffset: 0,
  }), 0)
})
