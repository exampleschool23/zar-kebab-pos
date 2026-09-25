import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = path => readFileSync(path, 'utf8')
test('all application date inputs use custom calendars instead of browser pickers', () => {
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`
      if (entry.isDirectory()) visit(path)
      else if (path.endsWith('.jsx')) assert.doesNotMatch(read(path), /type\s*=\s*["'](?:date|month|datetime-local)["']|\.showPicker\(/, path)
    }
  }
  visit('src')
  const chart = read('src/components/WeeklyIncomeChart.jsx')
  assert.match(chart, /<CalendarPicker mode="month"/)
  assert.match(chart, /min=\{monthOptions\[monthOptions.length - 1\]\} max=\{monthOptions\[0\]\}/)
})
test('shared date calendar preserves boundaries and escapes clipping in forms', () => {
  const picker = read('src/components/CalendarPicker.jsx')
  const calendar = read('src/components/DateRangePicker.jsx')
  assert.match(picker, /createPortal/)
  assert.match(picker, /document.body/)
  assert.match(picker, /next < min/)
  assert.match(picker, /next > max/)
  assert.match(calendar, /disabled=\{!day.inMonth \|\| Boolean\(min && day.date < min\) \|\| Boolean\(max && day.date > max\)\}/)
  assert.match(picker, /open && !disabled/)
  assert.match(picker, /event.key === 'Escape'/)
  assert.match(picker, /trigger.current\?\.focus\(\)/)
  assert.match(picker, /<TimePicker24/)
})
