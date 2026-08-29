import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RepoNavigator } from '../mcp/repo-navigator.js'
import { serverInstructions, toolDefinition } from '../mcp/tool-definition.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const navigator = new RepoNavigator(root)

const cases = [
  {
    task: 'atomic cashier settlement', markerQuery: 'settle_orders_payment',
    expected: { path: 'supabase/083_atomic_order_payment_settlement.sql', kind: 'sql-function', label: 'settle_orders_payment' },
    needles: ['pg_advisory_xact_lock', 'for update'],
    baseline: ['src/lib/db.js', 'src/lib/analytics.js', 'src/pages/CashierBill.jsx', 'supabase/083_atomic_order_payment_settlement.sql', 'tests/atomicPaymentSettlement.test.js'],
  },
  {
    task: 'paid order range loading', markerQuery: 'loadPaidOrdersForRange',
    expected: { path: 'src/lib/orderHistory.js', kind: 'function', label: 'loadPaidOrdersForRange' },
    needles: ['queryPaidOrderPages', 'paid_at'],
    baseline: ['src/lib/orderHistory.js', 'src/pages/AccountingHistory.jsx', 'src/pages/Expenses.jsx', 'tests/orderHistory.test.js'],
  },
  {
    task: 'large menu editor', markerQuery: 'AdminMenu',
    expected: { path: 'src/pages/AdminMenu.jsx', kind: 'function', label: 'AdminMenu' },
    needles: ['export default function AdminMenu'],
    baseline: ['src/pages/AdminMenu.jsx', 'src/store/menuReducer.js', 'src/lib/menuItems.js', 'tests/menuItems.test.js'],
  },
  {
    task: 'sent cart snapshot removal', markerQuery: 'removeSentCartItems',
    expected: { path: 'src/lib/analytics.js', kind: 'function', label: 'removeSentCartItems' },
    needles: ['remainingByKey', 'sentQty'],
    baseline: ['src/pages/WaiterOrder.jsx', 'src/components/CartPanel.jsx', 'src/store/AppContext.jsx', 'src/store/ordersReducer.js', 'src/lib/analytics.js', 'src/lib/db.js'],
  },
  {
    task: 'stable profile synchronization', markerQuery: 'ProfileSync',
    expected: { path: 'src/App.jsx', kind: 'function', label: 'ProfileSync' },
    needles: ["type: 'LOGIN'", 'profile?.id'],
    baseline: ['tests/sourceGuards.architecture.test.js', 'src/App.jsx', 'src/store/AppContext.jsx'],
  },
  {
    task: 'salary liability without advance netting', markerQuery: 'getTotalSalaryDue',
    expected: { path: 'src/lib/expenses.js', kind: 'function', label: 'getTotalSalaryDue' },
    needles: ['getSalaryDue', 'reduce'],
    baseline: ['src/lib/expenses.js', 'src/pages/Salaries.jsx', 'tests/expenses.test.js', 'tests/salaryAccrual.test.js'],
  },
  {
    task: 'variant tech card payload', markerQuery: 'buildTechCardPayload',
    expected: { path: 'src/lib/techCards.js', kind: 'function', label: 'buildTechCardPayload' },
    needles: ['variant_option_id', 'selected_options'],
    baseline: ['src/lib/techCards.js', 'src/pages/TechCards.jsx', 'supabase/156_variant_tech_cards.sql', 'tests/techCards.test.js'],
  },
  {
    task: 'daily bazaar idempotent retry', markerQuery: 'getBazaarSubmissionAttempt',
    expected: { path: 'src/lib/bazaar.js', kind: 'function', label: 'getBazaarSubmissionAttempt' },
    needles: ['fingerprint', 'requestKey'],
    baseline: ['src/lib/bazaar.js', 'src/pages/DailyBazaar.jsx', 'tests/bazaar.test.js', 'tests/bazaarMigration.test.js'],
  },
  {
    task: 'historical order profit', markerQuery: 'getOrderNetProfit',
    expected: { path: 'src/lib/profit.js', kind: 'function', label: 'getOrderNetProfit' },
    needles: ['getOrderRevenueTotal', 'getOrderCostTotal'],
    baseline: ['src/lib/profit.js', 'src/pages/Reports.jsx', 'tests/profit.test.js', 'tests/financialHistorySnapshots.test.js'],
  },
  {
    task: 'guest mode pin verification', markerQuery: 'verifyGuestModePin',
    expected: { path: 'src/lib/guestMode.js', kind: 'function', label: 'verifyGuestModePin' },
    needles: ['derivePinDigest', 'mismatch'],
    baseline: ['src/lib/guestMode.js', 'src/components/GuestModeUI.jsx', 'tests/guestMode.test.js', 'tests/guestAutoSubmit.test.js'],
  },
  {
    task: 'telegram order status notification', markerQuery: 'notifyTelegramOrderStatus',
    expected: { path: 'src/lib/telegramNotifications.js', kind: 'function', label: 'notifyTelegramOrderStatus' },
    needles: ['/api/telegram/order-status', 'NOTIFIABLE_STATUSES'],
    baseline: ['src/lib/telegramNotifications.js', 'api/telegram/order-status.js', 'tests/telegramOrderStatus.test.js'],
  },
  {
    task: 'daily salary cron', markerQuery: 'handler',
    expected: { path: 'api/telegram/daily-salary.js', kind: 'function', label: 'handler' },
    needles: ['requireCronSecret', 'loadKpiCatchUpDates'],
    baseline: ['api/telegram/daily-salary.js', 'api/telegram/_lib/salaryMessages.js', 'tests/dailyKpiBonuses.test.js', 'tests/dailySalaryWatchdog.test.js'],
  },
]

function estimateTokens(characters) {
  return Math.ceil(characters / 4)
}

async function readFiles(filePaths) {
  return Promise.all(filePaths.map(async (filePath) => ({ filePath, content: await fs.readFile(path.join(root, filePath), 'utf8') })))
}

const guide = await navigator.run({ op: 'guide' })
const persistentChars = JSON.stringify(toolDefinition).length + serverInstructions.length + JSON.stringify(guide).length
let totalBroad = 0
let totalTargeted = 0
let totalNavigation = persistentChars
const rows = []

for (const benchmark of cases) {
  const baselineFiles = await readFiles(benchmark.baseline)
  const broadChars = baselineFiles.reduce((sum, file) => sum + file.content.length, 0)
  const targetedSearch = baselineFiles.flatMap(({ filePath, content }) => content.split(/\r?\n/)
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes(benchmark.markerQuery))
    .map(({ line, index }) => `${filePath}:${index + 1}:${line}`)).join('\n')

  const found = await navigator.run({ op: 'find', q: benchmark.task, limit: 12, max_chars: 4_000 })
  const sourceRow = found.rows.find((row) => row[1] === benchmark.expected.kind && row[2] === benchmark.expected.path && row[4] === benchmark.expected.label)
  let sourceChars = 0
  let sourceText = ''
  let readCalls = 0
  let cursor = null
  if (sourceRow) {
    do {
      const source = await navigator.run(cursor
        ? { op: 'read', cursor, max_chars: 6_000 }
        : { op: 'read', id: sourceRow[0], max_chars: 6_000 })
      const serialized = JSON.stringify(source)
      sourceChars += serialized.length
      sourceText += `\n${source.chunks[0][3]}`
      cursor = source.next
      readCalls += 1
    } while (cursor && readCalls < 8 && !benchmark.needles.every((needle) => sourceText.includes(needle)))
  }

  const markersFound = Boolean(sourceRow) && benchmark.needles.every((needle) => sourceText.includes(needle))
  const navigationChars = JSON.stringify(found).length + sourceChars
  const targetedChars = targetedSearch.length + sourceText.length
  const broadSavedPercent = Math.round((1 - navigationChars / broadChars) * 100)
  const targetedDeltaPercent = targetedChars === 0 ? 0 : Math.round((navigationChars / targetedChars - 1) * 100)

  totalBroad += broadChars
  totalTargeted += targetedChars
  totalNavigation += navigationChars
  rows.push({ task: benchmark.task, markersFound, readCalls, broadChars, navigationChars, broadSavedPercent, targetedDeltaPercent })
}

const allMarkersFound = rows.every((row) => row.markersFound)
const broadSavedPercent = Math.round((1 - totalNavigation / totalBroad) * 100)
const targetedDeltaPercent = Math.round((totalNavigation / totalTargeted - 1) * 100)
console.table(rows)
console.log(JSON.stringify({
  allMarkersFound,
  characterProxy: {
    persistentChars,
    broadWholeFileChars: totalBroad,
    targetedSearchAndSourceChars: totalTargeted,
    navigationChars: totalNavigation,
    broadSavedPercent,
    targetedDeltaPercent,
  },
  estimatedTokensAtFourCharsPerToken: {
    broad: estimateTokens(totalBroad),
    targeted: estimateTokens(totalTargeted),
    navigation: estimateTokens(totalNavigation),
  },
}))

if (!allMarkersFound || broadSavedPercent < 70) {
  console.error('Navigator failed implementation-marker recall or the 70% broad-context reduction target.')
  process.exitCode = 1
}
