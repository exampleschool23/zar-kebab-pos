import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Daily Bazaar route is lazy-loaded and feature-protected', () => {
  const app = readSource('src/App.jsx')

  assert.match(app, /const DailyBazaar = lazy\(\(\) => import\('\.\/pages\/DailyBazaar'\)\)/)
  assert.match(
    app,
    /<Route path="\/admin\/bazaar" element=\{\s*<LazyProtectedRoute page="bazaar"><DailyBazaar \/><\/LazyProtectedRoute>\s*\} \/>/,
  )
})

test('Daily Bazaar appears in the sidebar and becomes active on its route', () => {
  const sidebar = readSource('src/components/UnifiedSidebar.jsx')

  assert.match(sidebar, /import \{[\s\S]*?ShoppingBasket[\s\S]*?\} from 'lucide-react'/)
  assert.match(
    sidebar,
    /key: 'bazaar',[\s\S]{0,120}icon: ShoppingBasket,[\s\S]{0,240}path: '\/admin\/bazaar'/,
  )
  assert.match(sidebar, /pathname\.startsWith\('\/admin\/bazaar'\)\)\s+return 'bazaar'/)
})

test('Daily Bazaar is a page feature with a default route fallback', () => {
  const permissions = readSource('src/lib/permissions.js')

  assert.match(permissions, /key: 'bazaar',\s*kind: 'page'/)
  assert.match(
    permissions,
    /if \(canViewPage\(profile, 'bazaar'\)\) return '\/admin\/bazaar'/,
  )
})

test('Accounting links to Daily Bazaar and prevents duplicate manual bazaar expenses', () => {
  const expensesPage = readSource('src/pages/Expenses.jsx')
  const expensesLib = readSource('src/lib/expenses.js')

  assert.match(expensesPage, /onClick=\{\(\) => navigate\('\/admin\/bazaar'\)\}/)
  assert.match(
    expensesLib,
    /MANUAL_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES\.filter\(category => \([\s\S]{0,240}category\.key !== 'products_bazaar'/,
  )
})

test('Daily Bazaar entry uses active employees, cash/card entry methods, and durable product suggestions', () => {
  const page = readSource('src/pages/DailyBazaar.jsx')

  assert.match(page, /from\('profiles'\)[\s\S]{0,180}\.eq\('status', 'active'\)/)
  assert.match(page, /value=\{form\.buyer_profile_id \|\| ''\}/)
  assert.match(page, /BAZAAR_ENTRY_PAYMENT_METHODS\.map/)
  assert.match(page, /BAZAAR_ENTRY_CATEGORIES\.map/)
  assert.match(page, /from\('bazaar_product_catalog'\)/)
  assert.match(page, /\.eq\('status', 'active'\)[\s\S]{0,100}\.neq\('role', 'guest'\)/)
  assert.match(page, /withWriteTimeout\([\s\S]{0,180}save_bazaar_purchase/)
  assert.match(page, /<fieldset disabled=\{saving\} className="contents">/)
  assert.match(page, /signal => supabase\.rpc\('save_bazaar_purchase',[\s\S]{0,120}\.abortSignal\(signal\)/)
  assert.match(page, /loadedRangeRef\.current !== requestedRange\) setPurchases\(\[\]\)/)
  assert.doesNotMatch(page, /md:grid-cols-2 xl:grid-cols-\[minmax\(180px,1\.5fr\)/)
  assert.doesNotMatch(page, /<Field label=\{l\.supplier\}/)
  assert.doesNotMatch(page, /<Field label=\{l\.market\}/)
  assert.doesNotMatch(page, /receipt_reference|l\.reference|l\.receipt/)
})

test('Daily Bazaar dates display through shared formatters and the entry keeps a native date control', () => {
  const page = readSource('src/pages/DailyBazaar.jsx')

  assert.match(page, /function FormattedDateInput/)
  assert.match(page, /formatLongDate\(value, lang, value\)/)
  assert.match(page, /<FormattedDateInput value=\{form\.purchase_date\}/)
  assert.match(page, /function DateRangePicker/)
  assert.match(page, /formatLongDate\(dateFrom, lang, dateFrom\)/)
  assert.match(page, /formatLongDate\(dateTo, lang, dateTo\)/)
})

test('Daily Bazaar history defaults to today and shows only structured entries in a compact paginated ledger', () => {
  const page = readSource('src/pages/DailyBazaar.jsx')

  assert.match(page, /getBazaarRange\('today'\)/)
  assert.match(page, /useState\('today'\)/)
  assert.match(page, /purchases\.filter\(purchase => purchase\.entry_source === 'daily_bazaar'\)/)
  assert.match(page, /const HISTORY_PAGE_SIZE = 10/)
  assert.match(page, /historyRows\.slice\(start, start \+ HISTORY_PAGE_SIZE\)/)
  assert.match(page, /<th[^>]*>\{l\.productName\}<\/th>/)
  assert.match(page, /<th[^>]*>\{l\.quantity\}<\/th>/)
  assert.match(page, /<th[^>]*>\{l\.itemPrice\}<\/th>/)
  assert.match(page, /<th[^>]*>\{l\.category\}<\/th>/)
  assert.match(page, /<th[^>]*>\{l\.addedBy\}<\/th>/)
  assert.match(page, /purchase\.created_by_name \|\| '—'/)
  assert.match(page, /formatCurrency\(item\.line_total\)/)
  assert.match(page, /data-bazaar-purchase-summary="true"/)
  assert.doesNotMatch(page, /<td colSpan=\{5\}/)
  assert.match(page, /colSpan=\{columnCount\} className="h-3 border-y/)
  assert.doesNotMatch(page, /rowSpan=\{rowSpan\}/)
  assert.match(page, /pageCount > 1/)
  assert.doesNotMatch(page, /function PurchaseCard/)
})

test('Accounting shows one daily Bazaar total and manages its details in Daily Bazaar', () => {
  const accounting = readSource('src/pages/AccountingHistory.jsx')
  const accountingLib = readSource('src/lib/accounting.js')

  assert.match(accounting, /collapseDailyBazaarExpenseRows\(rows\)/)
  assert.match(accounting, /row\.is_bazaar_daily_total/)
  assert.match(accounting, /navigate\('\/admin\/bazaar'\)/)
  assert.match(accountingLib, /export function collapseDailyBazaarExpenseRows/)
  assert.match(accountingLib, /id: `bazaar-day:\$\{date\}`/)
  assert.match(accountingLib, /payment_method: paymentMethods\.length === 1 \? paymentMethods\[0\] : 'mixed'/)
})
