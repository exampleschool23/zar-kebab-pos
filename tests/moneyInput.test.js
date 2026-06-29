import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatMoneyInput,
  normalizeMoneyInput,
  numberFromMoneyInput,
} from '../src/lib/moneyInput.js'

test('money input normalizes typed and pasted price text to digits', () => {
  assert.equal(normalizeMoneyInput('10 000'), '10000')
  assert.equal(normalizeMoneyInput('12,500 UZS'), '12500')
  assert.equal(normalizeMoneyInput('0008000'), '8000')
  assert.equal(normalizeMoneyInput(''), '')
})

test('money input formats UZS prices with grouped thousands', () => {
  assert.equal(formatMoneyInput('8000'), '8 000')
  assert.equal(formatMoneyInput('10000'), '10 000')
  assert.equal(formatMoneyInput('136850'), '136 850')
  assert.equal(formatMoneyInput(''), '')
})

test('money input converts formatted values to numbers for saving', () => {
  assert.equal(numberFromMoneyInput('10 000'), 10000)
  assert.equal(numberFromMoneyInput('136 850'), 136850)
  assert.equal(numberFromMoneyInput(''), 0)
})
