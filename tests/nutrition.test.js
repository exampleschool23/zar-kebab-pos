import test from 'node:test'
import assert from 'node:assert/strict'
import { gramsLabel, millilitresLabel } from '../src/lib/nutrition.js'

test('serving size labels format grams kilograms millilitres and litres', () => {
  assert.equal(gramsLabel({ grams: 250 }, 'en'), '250 g')
  assert.equal(gramsLabel({ grams: 1520 }, 'en'), '1.52 kg')
  assert.equal(gramsLabel({ grams: 1000 }, 'en'), '1 kg')
  assert.equal(gramsLabel({ grams: 0 }, 'en'), '')
  assert.equal(millilitresLabel({ millilitres: 500 }, 'en'), '500 ml')
  assert.equal(millilitresLabel({ millilitres: 1520 }, 'en'), '1.52 L')
  assert.equal(millilitresLabel({ millilitres: 1000 }, 'en'), '1 L')
  assert.equal(millilitresLabel({ litres: 0.5 }, 'en'), '500 ml')
})
