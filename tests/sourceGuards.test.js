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

test('new signed-up users always start as guest', () => {
  const auth = readSource('src/contexts/AuthContext.jsx')
  const migration = readSource('supabase/024_profiles_force_guest_signup.sql')

  assert.match(auth, /options: \{ data: \{ full_name: fullName, role: 'guest' \} \}/)
  assert.match(migration, /alter column role set default 'guest'/)
  assert.match(migration, /public\.handle_new_user/)
  assert.match(migration, /'guest',\s*\n\s*'active'/)
  assert.doesNotMatch(migration, /raw_user_meta_data->>'role'/)
})

test('AdminUsers can delete profiles without touching historical order names', () => {
  const adminUsers = readSource('src/pages/AdminUsers.jsx')
  const supabase = readSource('src/lib/supabase.js')
  const permissions = readSource('src/lib/permissions.js')
  const migration = readSource('supabase/025_owner_delete_profiles.sql')

  assert.match(adminUsers, /deleteProfile/)
  assert.match(adminUsers, /canDeleteTeamMember/)
  assert.match(adminUsers, /confirmDeleteId/)
  assert.match(adminUsers, /Names already stored on old orders stay preserved/)
  assert.match(supabase, /\.from\('profiles'\)[\s\S]*\.delete\(\)[\s\S]*\.eq\('id', userId\)/)
  assert.match(permissions, /function canDeleteTeamMember/)
  assert.match(permissions, /viewer !== 'owner'/)
  assert.match(permissions, /\['owner', 'stakeholder'\]\.includes\(target\)/)
  assert.match(migration, /on public\.profiles for delete/)
  assert.match(migration, /waiter_name/)
  assert.doesNotMatch(adminUsers, /\.from\('orders'\)\.delete/)
  assert.doesNotMatch(adminUsers, /deleteUser/)
})

test('global AppShell mobile drawer overlays content consistently', () => {
  const shell = readSource('src/components/AppShell.jsx')
  const sidebar = readSource('src/components/UnifiedSidebar.jsx')

  assert.match(shell, /hidden lg:block/)
  assert.match(shell, /lg:hidden fixed inset-0 z-50 flex h-\[100dvh\]/)
  assert.match(shell, /absolute inset-0 bg-black\/40/)
  assert.match(shell, /onClick=\{\(\) => setMobileOpen\(false\)\}/)
  assert.match(shell, /max-w-\[85vw\]/)
  assert.match(sidebar, /max-h-\[100dvh\]/)
  assert.match(sidebar, /w-\[min\(85vw,280px\)\] lg:w-\[220px\]/)
  assert.match(sidebar, /overflow-y-auto/)
})

test('realtime subscription uses unique channel names', () => {
  const source = readSource('src/lib/db.js')

  assert.match(source, /\.channel\(`pos-realtime-\$\{Date\.now\(\)\}-/)
  assert.doesNotMatch(source, /\.channel\('pos-realtime'\)/)
})

test('AppContext recovers Supabase after browser idle or resume', () => {
  const appContext = readSource('src/store/AppContext.jsx')
  const db = readSource('src/lib/db.js')

  assert.match(db, /function isRecoverableIdleError/)
  assert.match(db, /function refreshSupabaseSession/)
  assert.match(db, /onConnectionIssue\(status\)/)
  assert.match(appContext, /writeWithIdleRecovery/)
  assert.match(appContext, /WRITE_BEFORE_LOCAL_ACTIONS/)
  assert.match(appContext, /'CONFIRM_ORDER_DELIVERED'/)
  assert.match(appContext, /'MARK_TABLE_NEEDS_BILL'/)
  assert.match(appContext, /isRecoverableIdleError\(error\)/)
  assert.match(appContext, /refreshSupabaseSession\(\)/)
  assert.match(appContext, /function scheduleIdleRecovery/)
  assert.match(appContext, /Reconnecting\.\.\./)
  assert.match(appContext, /Back online\./)
  assert.match(appContext, /tone: 'success'/)
  assert.match(appContext, /function handleResume/)
  assert.match(appContext, /window\.addEventListener\('online', handleResume\)/)
  assert.match(appContext, /window\.addEventListener\('focus', handleResume\)/)
  assert.match(appContext, /document\.addEventListener\('visibilitychange', handleResume\)/)
  assert.match(appContext, /connectRealtime\(\)/)
  assert.match(appContext, /unsubscribe\(\)/)
})

test('PublicMenu is read-only for QR customers', () => {
  const publicMenu = readSource('src/pages/PublicMenu.jsx')
  const productCards = readSource('src/components/MenuProductCards.jsx')

  assert.doesNotMatch(publicMenu, /useNavigate/)
  assert.doesNotMatch(publicMenu, /useAuth/)
  assert.doesNotMatch(publicMenu, /LogIn/)
  assert.doesNotMatch(publicMenu, /\/login/)
  assert.match(publicMenu, /readOnly/)
  assert.match(productCards, /readOnly = false/)
  assert.match(productCards, /const inCart = !readOnly && qty > 0/)
  assert.match(productCards, /\{readOnly \? null : inCart \?/)
  assert.match(productCards, /!\s*readOnly && \(/)
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

test('WaiterTables ready-card total uses shared payment math instead of stale stored totals', () => {
  const source = readSource('src/pages/WaiterTables.jsx')
  const getKitchenCounts = functionBody(source, 'getKitchenCounts')

  assert.match(source, /import \{ getOrderTotal \} from '\.\.\/lib\/analytics'/)
  assert.match(getKitchenCounts, /total: active\.reduce\(\(s, o\) => s \+ getOrderTotal\(o\), 0\)/)
  assert.doesNotMatch(getKitchenCounts, /Number\(o\.total\)/)
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
  const db = readSource('src/lib/db.js')

  assert.match(source, /function isCashierVisibleBill/)
  assert.match(source, /function isCashierReadyTakeAway/)
  assert.match(source, /return order\.status === 'needs_bill'/)
  assert.match(source, /billableItems\.every\(item => \['ready', 'served'\]/)
  assert.match(source, /const raw = state\.orders\.filter\(isCashierVisibleBill\)/)
  assert.match(source, /key: 'needs_bill'[\s\S]*key: 'take_away'/)
  assert.doesNotMatch(source, /key: 'active'/)
  assert.match(source, /function PaidTodaySummary/)
  assert.match(source, /showPaidToday/)
  assert.doesNotMatch(source, /filteredBills\.map\(order =>/)
  assert.match(db, /function assertUpdatedRows/)
  assert.match(db, /case 'CONFIRM_ORDER_DELIVERED':[\s\S]*if \(ordersError\) throw ordersError[\s\S]*assertUpdatedRows\(deliveredOrders[\s\S]*if \(itemsError\) throw itemsError[\s\S]*assertUpdatedRows\(servedItems/)
  // Bug fix (Jun 2026): uses neq('payment_status','paid') + null fallback so legacy orders are never skipped
  assert.match(db, /case 'MARK_TABLE_NEEDS_BILL':[\s\S]*\.neq\('payment_status', 'paid'\)[\s\S]*\.is\('payment_status', null\)[\s\S]*updateRestaurantTableStatus\(tableId, \{ status: 'needs_bill' \}/)
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

test('Kitchen can cancel unavailable items without billing them', () => {
  const kitchen = readSource('src/pages/Kitchen.jsx')
  const analytics = readSource('src/lib/analytics.js')
  const cashierBill = readSource('src/pages/CashierBill.jsx')
  const ordersReducer = readSource('src/store/ordersReducer.js')
  const db = readSource('src/lib/db.js')
  const waiterTables = readSource('src/pages/WaiterTables.jsx')
  const migration = readSource('supabase/023_order_item_cancel_status.sql')

  assert.match(kitchen, /handleMark\('cancelled', \{ reason \}\)/)
  assert.match(kitchen, /unavailableLabel\(lang\)/)
  assert.match(kitchen, /cancelReason/)
  assert.doesNotMatch(kitchen, /markMenuUnavailable/)
  assert.doesNotMatch(kitchen, /Also mark unavailable in menu/)
  assert.doesNotMatch(kitchen, /Menyuda ham mavjud emas qilish/)
  assert.doesNotMatch(kitchen, /Также скрыть из меню/)
  assert.match(kitchen, /XCircle/)
  assert.match(kitchen, /!\['served', 'cancelled'\]\.includes\(i\.status\)/)
  assert.match(analytics, /function isCancelledOrderItem/)
  assert.match(analytics, /billableItems = sourceItems\.filter\(item => !isCancelledOrderItem\(item\)\)/)
  assert.match(analytics, /if \(isCancelledOrderItem\(item\)\) return/)
  assert.match(cashierBill, /billableItems = allItems\.filter\(item => !isCancelledOrderItem\(item\)\)/)
  assert.match(cashierBill, /getGroupedOrderItems\(billableItems\)/)
  assert.match(ordersReducer, /status === 'cancelled'[\s\S]*o\.items\.filter\(i => !matchesItem\(i\)\)/)
  assert.match(ordersReducer, /flatMap\(o =>/)
  assert.match(ordersReducer, /shouldRemove/)
  assert.match(ordersReducer, /getOrderPaymentSummary\(nextOrder, nextItems/)
  assert.match(db, /status === 'cancelled'[\s\S]*\.from\('order_items'\)\.delete\(\)/)
  assert.match(db, /order_item_cancellations/)
  assert.match(db, /paymentFields\.total <= 0/)
  assert.match(db, /payment_status: 'cancelled'/)
  assert.match(waiterTables, /\.filter\(i => i\.status !== 'cancelled'\)/)
  assert.match(migration, /drop constraint if exists order_items_status_check/)
  assert.match(migration, /'cancelled'/)
})

test('completed order details do not show kitchen-cancelled items', () => {
  const reports = readSource('src/pages/Reports.jsx')

  assert.match(reports, /isCancelledOrderItem/)
  assert.match(reports, /\(fetchedItems \|\| getOrderItems\(order\)\)\.filter\(item => !isCancelledOrderItem\(item\)\)/)
  assert.match(reports, /Ordered Items'} \(\{items\.length\}\)/)
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
  assert.match(source, /clampMoneyInput/)
  assert.match(source, /getMaxPaymentAmount/)
  assert.match(source, /getLoyaltyCardCashbackPercent\(loyaltyCard\)/)
  assert.match(source, /getLoyaltyCardCashbackType\(loyaltyCard\)/)
  assert.match(source, /function fillMaxLoyaltyRedeem\(\)/)
  assert.match(source, /setLoyaltyRedeemAmount\(String\(clampMoneyInput\(maxLoyaltyRedeemAmount, maxLoyaltyRedeemAmount\)\)\)/)
  assert.match(source, /inputMode="numeric"/)
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

test('active cashback calculation uses card type resolver instead of hardcoded default percent', () => {
  const analytics = readSource('src/lib/analytics.js')
  const loyalty = readSource('src/lib/loyalty.js')
  const db = readSource('src/lib/db.js')
  const cashier = readSource('src/pages/CashierBill.jsx')
  const reducer = readSource('src/store/ordersReducer.js')

  assert.match(loyalty, /getLoyaltyCardCashbackType/)
  assert.match(loyalty, /cashbackType/)
  assert.match(db, /getLoyaltyCardCashbackType/)
  assert.match(db, /rollbackLoyaltyWalletSettlement/)
  assert.match(db, /\.eq\('balance', balance\)/)
  assert.match(db, /amount: -row\.loyaltyUsedAmount/)
  assert.match(db, /isLegacyPositiveTransactionAmountConstraint/)
  assert.match(db, /toLegacyPositiveTransactionAmounts/)
  assert.match(cashier, /getLoyaltyCardCashbackPercent/)
  assert.match(reducer, /getLoyaltyCardCashbackPercent/)
  assert.doesNotMatch(analytics, /calculateLoyaltyCashback\(order, items = getOrderItems\(order\), cashbackPercent = 5\)/)
  assert.doesNotMatch(analytics, /fallbackPct = 5/)
  assert.doesNotMatch(cashier, /state\.settings\?\.cashbackPercent/)
  assert.doesNotMatch(db, /state\.settings\?\.cashbackPercent/)
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
  assert.match(migration, /prevent_loyalty_card_type_change/)
  assert.match(migration, /Cashback type cannot be changed after card registration/)
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
  assert.match(admin, /formatUzPhoneNumberInput/)
  assert.match(admin, /cardFormRequired/)
  assert.match(admin, /replace\(\/\\D\/g, ''\)\.slice\(0, 8\)/)
  assert.match(admin, /Register loyalty card/)
  assert.doesNotMatch(admin, /function updateCashbackType/)
  assert.match(db, /legacyTransactions/)
  assert.match(loyalty, /bronze: \{ label: 'Bronze', percent: 3 \}/)
  assert.match(loyalty, /black: \{ label: 'Black', percent: 15 \}/)
})

test('AdminLoyalty selected card uses compact profile and detailed transaction layout', () => {
  const admin = readSource('src/pages/AdminLoyalty.jsx')

  assert.match(admin, /CARD_PAGE_SIZE = 20/)
  assert.match(admin, /CARD_SELECT_COLUMNS/)
  assert.match(admin, /TRANSACTION_SELECT_COLUMNS/)
  assert.match(admin, /\.range\(from, to\)/)
  assert.match(admin, /setTimeout\(\(\) => \{[\s\S]*searchCards\(query, \{ reset: true \}\)[\s\S]*250/)
  assert.match(admin, /cardSearchRequestRef/)
  assert.match(admin, /hasMoreCards/)
  assert.match(admin, /l\.loadMore/)
  assert.doesNotMatch(admin, /\.select\('\*'\)/)
  assert.match(admin, /Customer Loyalty Profile/)
  assert.match(admin, /No customer name/)
  assert.match(admin, /No phone number/)
  assert.match(admin, /<AppShell title=\{selected \? l\.detailsTitle : l\.title\}>/)
  assert.match(admin, /selected \? 'hidden lg:block' : ''/)
  assert.match(admin, /selected \? '' : 'hidden lg:block'/)
  assert.match(admin, /setSelected\(null\)/)
  assert.match(admin, /ChevronRight/)
  assert.match(admin, /xl:grid-cols-\[minmax\(320px,430px\)_minmax\(0,1fr\)\]/)
  assert.match(admin, /selectedName\(selected\)/)
  assert.match(admin, /selectedPhone\(selected\)/)
  assert.match(admin, /l\.cardNo/)
  assert.match(admin, /l\.balance/)
  assert.match(admin, /l\.ownerActions/)
  assert.match(admin, /l\.adjustmentHelper/)
  assert.match(admin, /l\.ownerAdjustOnly/)
  assert.match(admin, /l\.ownerTypeOnly/)
  assert.match(admin, /updateCustomerProfile/)
  assert.match(admin, /l\.saveCustomer/)
  assert.match(admin, /transactionAmount\(tx\)/)
  assert.match(admin, /transactionCardType\(tx\)/)
  assert.match(admin, /tx\.balance_before/)
  assert.match(admin, /tx\.balance_after/)
  assert.match(admin, /l\.noTransactions/)
  assert.match(admin, /disabled=\{!canAdjust\}/)
  assert.match(admin, /disabled=\{selected\.is_active === false \|\| !canDeactivate\}/)
  const createSection = admin.slice(admin.indexOf('<h2 className="mb-3 text-sm font-black text-[#1F2937]">{l.createTitle}</h2>'), admin.indexOf('<div className="mt-5">'))
  assert.match(createSection, /form\.card_number/)
  assert.match(createSection, /form\.phone_number/)
  assert.match(createSection, /form\.cashback_type/)
  assert.doesNotMatch(createSection, /form\.customer_name/)
  const cashbackSection = admin.slice(admin.indexOf('<p className="text-xs font-black uppercase tracking-widest text-[#9CA3AF]">{l.cashbackType}</p>'))
  assert.doesNotMatch(cashbackSection, /<select value=\{selected\.cashback_type/)
})

test('AdminAudit localizes money audit labels statuses and payment methods', () => {
  const audit = readSource('src/pages/AdminAudit.jsx')

  assert.match(audit, /function paymentMethodLabel/)
  assert.match(audit, /function statusLabel/)
  assert.match(audit, /fmtDate\(value, lang = 'ru'\)/)
  assert.match(audit, /before: 'Oldin'/)
  assert.match(audit, /before: 'Было'/)
  assert.match(audit, /before: 'Before'/)
  assert.match(audit, /cash: \{ uz: 'Naqd', ru: 'Наличные', en: 'Cash' \}/)
  assert.match(audit, /paid: \{ uz: 'To‘landi', ru: 'Оплачен', en: 'Paid' \}/)
  assert.match(audit, /statusLabel\(status, lang\)/)
  assert.match(audit, /paymentMethodLabel\(row\.old_payment_method, lang\)/)
  assert.match(audit, /beforeLabel=\{l\.before\}/)
})

test('AdminSettings does not expose obsolete cashback percent setting', () => {
  const settings = readSource('src/pages/AdminSettings.jsx')
  const reducerDefaults = readSource('src/store/reducerHelpers.js')
  const db = readSource('src/lib/db.js')

  assert.doesNotMatch(settings, /Cashback Percent/)
  assert.doesNotMatch(settings, /cashbackPercent/)
  assert.doesNotMatch(reducerDefaults, /cashbackPercent/)
  assert.doesNotMatch(db, /settings\.cashbackPercent/)
  assert.doesNotMatch(db, /cashback_percent:\s*Number\.isFinite\(Number\(settings\.cashbackPercent\)\)/)
})

test('AdminSettings does not expose receipt footer editing', () => {
  const settings = readSource('src/pages/AdminSettings.jsx')

  assert.doesNotMatch(settings, /Receipt Footer/)
  assert.doesNotMatch(settings, /receiptFooterL/)
  assert.doesNotMatch(settings, /setReceiptFooter/)
  assert.doesNotMatch(settings, /payload: \{ restaurantName, serviceRate, receiptFooter, autoPrint \}/)
})

test('cashier payment waits for database success and supports legacy loyalty transaction constraints', () => {
  const cashier = readSource('src/pages/CashierBill.jsx')
  const appContext = readSource('src/store/AppContext.jsx')
  const db = readSource('src/lib/db.js')

  assert.match(cashier, /const \[isProcessingPayment, setProcessingPayment\]/)
  assert.match(cashier, /async function handlePaid\(\)/)
  assert.match(cashier, /const result = await dispatch\(\{/)
  assert.match(cashier, /if \(result\?\.error\) return/)
  assert.match(cashier, /navigate\('\/cashier\/tables'\)/)
  assert.match(cashier, /processingPay/)
  assert.match(cashier, /hasLoyaltyCardEntry/)
  assert.match(cashier, /loyalty_card_number: loyaltyCard\?\.card_number \|\| null/)
  assert.match(appContext, /WRITE_BEFORE_LOCAL_ACTIONS\.has\(enriched\.type\)/)
  assert.match(appContext, /'MARK_ORDER_PAID'/)
  assert.match(db, /mergeOrderItemsByIdentity/)
  assert.match(db, /case 'MARK_ORDER_PAID':[\s\S]*updateRestaurantTableStatus\([\s\S]*status: 'available'[\s\S]*\.update\(updateFields\)[\s\S]*\.select\('id'\)[\s\S]*assertUpdatedRows\(paidRows/)
  assert.match(db, /isLegacyPositiveTransactionAmountConstraint\(transactionError\)/)
  assert.match(db, /insert\(toLegacyPositiveTransactionAmounts\(transactions\)\)/)
  assert.match(db, /insert\(toLegacyPositiveTransactionAmounts\(legacyTransactions\)\)/)
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

test('starter cafe menu expansion seeds polished categories and items', () => {
  const migration = readSource('supabase/030_starter_cafe_menu_expansion.sql')
  const repairMigration = readSource('supabase/031_fix_starter_menu_image_urls.sql')

  for (const category of ['combos', 'sides', 'desserts']) {
    assert.match(migration, new RegExp(`'${category}'`))
  }

  for (const item of [
    'zk_mixed_grill',
    'zk_family_grill_set',
    'zk_takeaway_box',
    'zk_shorva',
    'zk_plov',
    'zk_qurutob',
    'zk_fries',
    'zk_ayran',
    'zk_baklava',
  ]) {
    assert.match(migration, new RegExp(`'${item}'`))
  }

  assert.match(migration, /on conflict \(id\) do nothing/)
  assert.doesNotMatch(migration, /source\.unsplash\.com/)
  assert.doesNotMatch(repairMigration, /source\.unsplash\.com/)
  assert.match(repairMigration, /update public\.menu_categories/)
  assert.match(repairMigration, /update public\.menu_items/)
  assert.match(repairMigration, /'combos'/)
  assert.match(repairMigration, /'zk_mixed_grill'/)
})

test('menu items support and display nutrition values', () => {
  const schema = readSource('supabase/003_pos_schema.sql')
  const migration = readSource('supabase/032_menu_item_kcal.sql')
  const gramsMigration = readSource('supabase/033_menu_item_grams.sql')
  const millilitresMigration = readSource('supabase/034_menu_item_millilitres.sql')
  const dbHealth = readSource('src/lib/dbHealth.js')
  const adminMenu = readSource('src/pages/AdminMenu.jsx')
  const categoryScroller = readSource('src/components/MenuCategoryScroller.jsx')
  const productCards = readSource('src/components/MenuProductCards.jsx')
  const cartPanel = readSource('src/components/CartPanel.jsx')
  const kitchen = readSource('src/pages/Kitchen.jsx')
  const cashierBill = readSource('src/pages/CashierBill.jsx')
  const reports = readSource('src/pages/Reports.jsx')
  const telegramMiniApp = readSource('src/pages/TelegramMiniApp.jsx')
  const nutrition = readSource('src/lib/nutrition.js')

  assert.match(schema, /kcal\s+integer\s+not null default 0/)
  assert.match(schema, /grams\s+integer\s+not null default 0/)
  assert.match(schema, /millilitres\s+integer\s+not null default 0/)
  assert.match(migration, /add column if not exists kcal integer not null default 0/)
  assert.match(migration, /menu_items_kcal_nonnegative/)
  assert.match(migration, /'zk_mixed_grill', 1650/)
  assert.match(gramsMigration, /add column if not exists grams integer not null default 0/)
  assert.match(gramsMigration, /menu_items_grams_nonnegative/)
  assert.match(gramsMigration, /'zk_mixed_grill', 900/)
  assert.match(millilitresMigration, /add column if not exists millilitres integer not null default 0/)
  assert.match(millilitresMigration, /menu_items_millilitres_nonnegative/)
  assert.match(millilitresMigration, /'m12', 500/)
  assert.match(schema, /'m1'[\s\S]*?80000, 450, 0, 980/)
  assert.match(migration, /'zk_family_grill_set', 3200/)
  assert.match(gramsMigration, /'zk_family_grill_set', 1900/)
  assert.match(dbHealth, /'kcal'/)
  assert.match(dbHealth, /'grams'/)
  assert.match(dbHealth, /'millilitres'/)
  assert.match(nutrition, /function gramsLabel/)
  assert.match(nutrition, /function millilitresLabel/)
  assert.match(nutrition, /millilitres >= 1000/)
  assert.match(adminMenu, /setF\('kcal'\)/)
  assert.match(adminMenu, /setF\('grams'\)/)
  assert.match(adminMenu, /setF\('millilitres'\)/)
  assert.match(adminMenu, /Math\.max\(0, Math\.round\(Number\(form\.kcal\) \|\| 0\)\)/)
  assert.match(adminMenu, /Math\.max\(0, Math\.round\(Number\(form\.grams\) \|\| 0\)\)/)
  assert.match(adminMenu, /Math\.max\(0, Math\.round\(Number\(form\.millilitres\) \|\| 0\)\)/)
  assert.match(categoryScroller, /text-sm font-black tabular-nums/)
  for (const source of [adminMenu, productCards, cartPanel, kitchen, cashierBill, reports, telegramMiniApp]) {
    assert.match(source, /kcalLabel/)
    assert.match(source, /gramsLabel/)
    assert.match(source, /millilitresLabel/)
  }
})
