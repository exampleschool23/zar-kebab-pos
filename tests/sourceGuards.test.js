import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const srcDir = join(root, 'src')

function readSource(path) {
  return readFileSync(join(root, path), 'utf8')
}

function sourceFiles(dir = srcDir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) return sourceFiles(path)
    return /\.(js|jsx)$/.test(name) ? [path] : []
  })
}

function functionBody(source, functionName) {
  const marker = `function ${functionName}`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `${functionName} should exist`)

  const bodyStartMatch = /\)\s*\{/.exec(source.slice(start))
  assert.ok(bodyStartMatch, `${functionName} should have a body`)

  const braceStart = start + bodyStartMatch.index + bodyStartMatch[0].lastIndexOf('{')
  assert.notEqual(braceStart, -1, `${functionName} should have a body`)

  let depth = 0
  for (let i = braceStart; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(braceStart + 1, i)
    }
  }

  assert.fail(`${functionName} body should close`)
}

test('AdminMenu keeps upload error rendering inside ImageUploadField', () => {
  const source = readSource('src/pages/AdminMenu.jsx')
  const body = functionBody(source, 'ImageUploadField')

  assert.match(body, /\{error && <p[^}]+>\{error\}<\/p>\}/)
})

test('AdminMenu sortable item card does not reference upload error state', () => {
  const source = readSource('src/pages/AdminMenu.jsx')
  const body = functionBody(source, 'SortableItemCard')

  assert.doesNotMatch(body, /\berror\b/)
})

test('AdminMenu has exactly one upload error render', () => {
  const source = readSource('src/pages/AdminMenu.jsx')
  const matches = source.match(/\{error && <p/g) || []

  assert.equal(matches.length, 1)
})

test('App ProfileSync depends on stable profile fields and dispatch', () => {
  const source = readSource('src/App.jsx')
  const body = functionBody(source, 'ProfileSync')

  assert.match(body, /\[profile\?\.id,\s*profile\?\.role,\s*profile\?\.full_name,\s*profile\?\.email,\s*dispatch\]/)
})

test('AppContext exposes a stable dbDispatch callback', () => {
  const source = readSource('src/store/AppContext.jsx')

  assert.match(source, /const dbDispatch = useCallback\(function dbDispatch\(action\)/)
  assert.match(source, /import React, \{[^}]*useCallback[^}]*\} from 'react'/)
})

test('realtime subscription uses unique channel names', () => {
  const source = readSource('src/lib/db.js')

  assert.match(source, /\.channel\(`pos-realtime-\$\{Date\.now\(\)\}-/)
  assert.doesNotMatch(source, /\.channel\('pos-realtime'\)/)
})

test('source does not use console.log debugging', () => {
  const offenders = sourceFiles()
    .filter(file => /console\.log\(/.test(readFileSync(file, 'utf8')))
    .map(file => file.slice(root.length))

  assert.deepEqual(offenders, [])
})

test('source does not use blocking alert dialogs', () => {
  const offenders = sourceFiles()
    .filter(file => /(?:window\.)?alert\(/.test(readFileSync(file, 'utf8')))
    .map(file => file.slice(root.length))

  assert.deepEqual(offenders, [])
})

test('CartPanel exposes in-flight send state from its parent', () => {
  const source = readSource('src/components/CartPanel.jsx')
  const body = functionBody(source, 'CartPanel')

  assert.match(source, /function CartPanel\(\{[\s\S]*isSending = false[\s\S]*onSendingChange[\s\S]*\}\)/)
  assert.match(body, /onSendingChange\?\.\(true\)/)
  assert.match(body, /onSendingChange\?\.\(false\)/)
  assert.doesNotMatch(body, /const \[isSending,\s*setIsSending\]/)
})

test('WaiterOrder locks menu mutations while order send is pending', () => {
  const source = readSource('src/pages/WaiterOrder.jsx')

  assert.match(source, /const \[isSendingOrder,\s*setSendingOrder\]/)
  assert.match(functionBody(source, 'handleAdd'), /if \(isSendingOrder\) return/)
  assert.match(functionBody(source, 'handleIncrement'), /if \(isSendingOrder\) return/)
  assert.match(functionBody(source, 'handleDecrement'), /if \(isSendingOrder\) return/)
})

test('orders reducer clears only the sent cart snapshot after kitchen submit', () => {
  const source = readSource('src/store/ordersReducer.js')

  assert.match(source, /removeSentCartItems\(state\.cart,\s*cartItems\)/)
  assert.doesNotMatch(source, /orders: nextOrders,\s*cart: \[\]/)
})

test('AppContext delegates state changes to domain reducers', () => {
  const source = readSource('src/store/AppContext.jsx')

  assert.match(source, /const domainReducers = \[/)
  assert.match(source, /settingsReducer/)
  assert.match(source, /appMetaReducer/)
  assert.match(source, /tablesReducer/)
  assert.match(source, /menuReducer/)
  assert.match(source, /cartReducer/)
  assert.match(source, /ordersReducer/)
  assert.doesNotMatch(functionBody(source, 'reducer'), /switch \(action\.type\)/)
})

test('kitchen submit RPC migration protects paid orders from late item inserts', () => {
  const source = readSource('supabase/018_submit_order_to_kitchen_rpc.sql')

  assert.match(source, /payment_status <> 'paid'/)
  assert.match(source, /raise exception 'order % is already paid or unavailable'/)
})

test('WaiterTables keeps urgent status sections before available tables', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /const SECTION_ORDER = \['ready', 'preparing', 'waiting_kitchen', 'needs_bill', 'reserved', 'occupied', 'available'\]/)
  assert.match(source, /SECTION_ORDER\s*\n\s*\.map\(status =>/)
})

test('WaiterTables keeps filter chips in requested status order', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /const FILTER_ORDER = \['all', 'available', 'reserved', 'waiting_kitchen', 'preparing', 'ready', 'needs_bill', 'occupied'\]/)
})

test('WaiterTables uses responsive section grids instead of one flat table grid', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4/)
  assert.match(source, /sections\.map\(\(\{ status, items \}\)/)
})

test('CashierTables groups bills by cashier urgency', () => {
  const source = readSource('src/pages/CashierTables.jsx')

  assert.match(source, /key: 'needs_bill'[\s\S]*key: 'active'[\s\S]*key: 'take_away'/)
  assert.match(source, /function PaidTodaySummary/)
  assert.match(source, /showPaidToday/)
  assert.doesNotMatch(source, /filteredBills\.map\(order =>/)
})

test('WaiterTables hides disabled tables and links admins to management', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /\.filter\(table => table\.is_active !== false\)/)
  assert.match(source, /canManageTables/)
  assert.match(source, /navigate\('\/admin\/tables'\)/)
})

test('WaiterTables lets occupied tables request the bill from the card action', () => {
  const source = readSource('src/pages/WaiterTables.jsx')

  assert.match(source, /status === 'occupied'\) return \{ label: tr\(lang, 'requestBill'\)/)
  assert.match(functionBody(source, 'handleCardAction'), /if \(status === 'occupied'\) \{[\s\S]*MARK_TABLE_NEEDS_BILL/)
})

test('AdminTables protects table history and manages zones', () => {
  const source = readSource('src/pages/AdminTables.jsx')

  assert.match(source, /This table has order history\. You can disable it instead\./)
  assert.match(source, /Do not delete a table while it has active orders\./)
  assert.match(source, /ADD_TABLE_ZONE/)
  assert.match(source, /zone_id/)
  assert.match(source, /is_active/)
})

test('CashierBill uses loyalty wallet controls instead of percent card discounts', () => {
  const source = readSource('src/pages/CashierBill.jsx')
  const payMethodsBlock = source.slice(source.indexOf('const PAY_METHODS = ['), source.indexOf('function payLabel'))

  assert.match(source, /Loyalty Card/)
  assert.match(source, /Cashback balance/)
  assert.match(source, /Loyalty amount to use/)
  assert.match(source, /loyalty_used_amount/)
  assert.match(source, /cashback_earned/)
  assert.match(source, /getMaxLoyaltyRedeemAmount/)
  assert.match(source, /function fillMaxLoyaltyRedeem\(\)/)
  assert.match(source, /setLoyaltyRedeemAmount\(String\(maxLoyaltyRedeemAmount\)\)/)
  assert.match(source, /Tap balance to use max available/)
  assert.match(source, /No loyalty balance available to use/)
  assert.doesNotMatch(source, /LOYALTY_PRESETS/)
  assert.doesNotMatch(source, /setLoyaltyPct/)
  assert.doesNotMatch(source, /loyalty_discount_pct/)
  assert.doesNotMatch(source, /Custom %/)
  assert.doesNotMatch(source, /lbl\.cashbackEarned/)
  assert.doesNotMatch(payMethodsBlock, /loyalty_card/)
  assert.doesNotMatch(payMethodsBlock, /Лояльность/)
})

test('CashierBill keeps cashback preview visually after payable totals', () => {
  const source = readSource('src/pages/CashierBill.jsx')
  const mainSummary = source.slice(source.indexOf('Items footer: subtotal strip'), source.indexOf('{/* Loyalty card */}'))
  const paymentSummary = source.slice(source.indexOf('{/* Payment Summary */}'), source.indexOf('{/* Split Payment */}'))
  const loyaltyCard = source.slice(source.indexOf('{/* Loyalty card */}'), source.indexOf('{/* ══ RIGHT: payment panel'))

  assert.ok(mainSummary.indexOf('lbl.totalAmt') < mainSummary.indexOf('lbl.cashbackToBeEarned'))
  assert.ok(paymentSummary.indexOf('lbl.totalAmt') < paymentSummary.indexOf('lbl.cashbackToBeEarned'))
  assert.ok(loyaltyCard.indexOf('lbl.loyalty') < loyaltyCard.indexOf('lbl.cashbackToBeEarned'))
  assert.match(source, /Cashback to be earned/)
  assert.doesNotMatch(source, /Cashback earned/)
})

test('CashierBill keeps counter items in main content above loyalty and out of payment sidebar', () => {
  const source = readSource('src/pages/CashierBill.jsx')
  const orderDetailsEnd = source.indexOf('{/* Counter Items */}')
  const counterStart = source.indexOf('{/* Counter Items */}')
  const loyaltyStart = source.indexOf('{/* Loyalty card */}')
  const paymentPanelStart = source.indexOf('{/* ══ RIGHT: payment panel')
  const splitStart = source.indexOf('{/* Split Payment */}')
  const quickAmountStart = source.indexOf('{lbl.quickAmt}', splitStart)
  const splitPayment = source.slice(splitStart, quickAmountStart)

  assert.ok(orderDetailsEnd > source.indexOf('Items footer: subtotal strip'))
  assert.ok(counterStart < loyaltyStart)
  assert.ok(loyaltyStart < paymentPanelStart)
  assert.match(source, /Add quick cashier items to this bill/)
  assert.match(source, /grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3/)
  assert.doesNotMatch(splitPayment, /quickItems\.length > 0/)
  assert.doesNotMatch(splitPayment, /lbl\.counterItems/)
})

test('loyalty cashback wallet migration and admin route are wired', () => {
  const migration = readSource('supabase/022_loyalty_cashback_wallet.sql')
  const app = readSource('src/App.jsx')
  const admin = readSource('src/pages/AdminLoyalty.jsx')
  const loyalty = readSource('src/lib/loyalty.js')
  const db = readSource('src/lib/db.js')

  assert.match(migration, /create table if not exists public\.loyalty_cards/)
  assert.match(migration, /create table if not exists public\.loyalty_transactions/)
  assert.match(migration, /cashback_type/)
  assert.match(migration, /cashback_percent_used/)
  assert.match(migration, /card_type_at_transaction/)
  assert.match(migration, /owner_create_loyalty_cards/)
  assert.match(migration, /owner_cashier_update_loyalty_cards/)
  assert.match(migration, /owner_cashier_insert_loyalty_transactions/)
  assert.doesNotMatch(migration, /staff_all_loyalty_cards on public\.loyalty_cards\s+for all/)
  assert.match(migration, /loyalty_used_amount/)
  assert.match(migration, /cashback_earned/)
  assert.match(app, /\/admin\/loyalty/)
  assert.match(app, /\/admin\/discount-cards/)
  assert.match(admin, /Manual balance adjustment/)
  assert.match(admin, /Balance transaction history/)
  assert.match(admin, /canCreateLoyaltyCard/)
  assert.match(admin, /canAdjustLoyaltyBalance/)
  assert.match(admin, /canDeactivateLoyaltyCard/)
  assert.match(admin, /isMissingLoyaltySchemaColumn/)
  assert.match(admin, /setSupportsCashbackType\(false\)/)
  assert.match(db, /legacyTransactions/)
  assert.match(loyalty, /bronze: \{ label: 'Bronze', percent: 3 \}/)
  assert.match(loyalty, /black: \{ label: 'Black', percent: 15 \}/)
})

test('table management migration and health check include required columns', () => {
  const migration = readSource('supabase/019_table_management.sql')
  const health = readSource('scripts/check-db-health.js')

  assert.match(migration, /create table if not exists public\.table_zones/)
  assert.match(migration, /add column if not exists zone_id/)
  assert.match(migration, /add column if not exists capacity/)
  assert.match(migration, /add column if not exists is_active/)
  assert.match(health, /restaurant_tables', 'id, name, status, zone_id, zone_name, capacity, sort_order, is_active, reserved_for_name, reserved_for_phone, reserved_at, reserved_until, reservation_notes, created_at, updated_at'/)
  assert.match(health, /table_zones', 'id, name, sort_order, is_active, created_at, updated_at'/)
})

test('table reservation migration and UI are wired', () => {
  const migration = readSource('supabase/020_table_reservations.sql')
  const adminTables = readSource('src/pages/AdminTables.jsx')
  const waiterTables = readSource('src/pages/WaiterTables.jsx')

  assert.match(migration, /status in \('available', 'reserved', 'occupied', 'needs_bill'\)/)
  assert.match(migration, /reserved_for_name/)
  assert.match(migration, /reserved_for_phone/)
  assert.match(migration, /reserved_at/)
  assert.match(adminTables, /Guest name is required for reservations/)
  assert.match(waiterTables, /getWaiterTableStatus/)
  assert.match(waiterTables, /seatReserved/)
})

test('AdminTables localizes visible management labels', () => {
  const source = readSource('src/pages/AdminTables.jsx')

  assert.match(source, /const L = \{/)
  assert.match(source, /title: 'Tables'/)
  assert.match(source, /title: 'Столы'/)
  assert.match(source, /title: 'Stollar'/)
  assert.match(source, /<AppShell title=\{l\.title\}>/)
  assert.match(source, /label=\{l\.tableName\}/)
  assert.match(source, /label=\{l\.zoneSection\}/)
  assert.match(source, /label=\{l\.capacity\}/)
  assert.doesNotMatch(source, />Add table</)
  assert.doesNotMatch(source, />Zones</)
})
