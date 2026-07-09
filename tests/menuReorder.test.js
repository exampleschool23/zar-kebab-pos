import test from 'node:test'
import assert from 'node:assert/strict'

import { menuReducer } from '../src/store/menuReducer.js'

test('category drag reorder inserts and shifts rows instead of swapping endpoints', () => {
  const state = {
    categories: [
      { id: 'sets-1', sort_order: 8 },
      { id: 'coffee', sort_order: 9 },
      { id: 'tea', sort_order: 10 },
    ],
    menuItems: [],
  }

  const next = menuReducer(state, {
    type: 'REORDER_CATEGORY',
    payload: {
      updates: [
        { id: 'coffee', sort_order: 8 },
        { id: 'tea', sort_order: 9 },
        { id: 'sets-1', sort_order: 10 },
      ],
    },
  })

  assert.deepEqual(
    next.categories
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(category => category.id),
    ['coffee', 'tea', 'sets-1']
  )
})

test('menu item drag reorder can shift only the visible dragged range', () => {
  const state = {
    categories: [],
    menuItems: [
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 2 },
      { id: 'c', sort_order: 3 },
      { id: 'hidden-slot', sort_order: 4 },
    ],
  }

  const next = menuReducer(state, {
    type: 'REORDER_MENU_ITEM',
    payload: {
      updates: [
        { id: 'b', sort_order: 1 },
        { id: 'c', sort_order: 2 },
        { id: 'a', sort_order: 3 },
      ],
    },
  })

  assert.deepEqual(
    next.menuItems
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(item => item.id),
    ['b', 'c', 'a', 'hidden-slot']
  )
})
