import test from 'node:test'
import assert from 'node:assert/strict'

import { getItemDesc, getItemName } from '../src/lib/i18n.js'
import {
  firstMenuItemText,
  trimMenuItemTextFields,
  trimMenuItemTextValue,
} from '../src/lib/menuItemText.js'

test('menu item text trims only leading and trailing whitespace', () => {
  assert.equal(trimMenuItemTextValue('  Chicken thigh kebab  '), 'Chicken thigh kebab')
  assert.equal(
    trimMenuItemTextValue('\n  First line\nSecond line  \n'),
    'First line\nSecond line',
  )
})

test('menu item title and description fields are normalized without mutating other fields', () => {
  const input = {
    name_uz: '  Shashlik  ',
    name_ru: '\tШашлык\t',
    description_en: '\n Tender and juicy. \n',
    price: 24_000,
  }

  assert.deepEqual(trimMenuItemTextFields(input), {
    name_uz: 'Shashlik',
    name_ru: 'Шашлык',
    description_en: 'Tender and juicy.',
    price: 24_000,
  })
  assert.equal(input.name_uz, '  Shashlik  ')
})

test('localized menu text ignores whitespace-only values and returns trimmed fallbacks', () => {
  const item = {
    name_ru: '   ',
    name_en: '  Chicken Kebab  ',
    name_uz: ' Tovuq kabob ',
    description_ru: '\n\t',
    description_en: '\n Cooked over charcoal. \n',
  }

  assert.equal(firstMenuItemText('  ', '\n Value \t'), 'Value')
  assert.equal(getItemName(item, 'ru'), 'Chicken Kebab')
  assert.equal(getItemDesc(item, 'ru'), 'Cooked over charcoal.')
})
