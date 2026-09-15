import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EMPLOYEE_JOB_FUNCTIONS, employeeJobFunctionLabel } from '../src/lib/employeeJobFunctions.js'

test('job functions match database values and have labels in all supported languages', () => {
  const migration = readFileSync(new URL('../supabase/194_employee_job_function.sql', import.meta.url), 'utf8')
  assert.equal(EMPLOYEE_JOB_FUNCTIONS.length, 7)
  assert.equal(new Set(EMPLOYEE_JOB_FUNCTIONS.map(job => job.value)).size, 7)
  for (const job of EMPLOYEE_JOB_FUNCTIONS) {
    assert.ok(migration.includes("'" + job.value + "'"))
    for (const lang of ['en', 'ru', 'uz']) assert.ok(employeeJobFunctionLabel(job.value, lang))
  }
  assert.equal(employeeJobFunctionLabel(null), '')
  assert.equal(employeeJobFunctionLabel('owner'), '')
  assert.equal(employeeJobFunctionLabel('cook', 'unknown'), 'Cook')
})
