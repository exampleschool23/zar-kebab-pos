import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('Tech Cards is lazy-routed behind its own page access and appears in the drawer', () => {
  const app = source('src/App.jsx')
  const sidebar = source('src/components/UnifiedSidebar.jsx')

  assert.match(app, /const TechCards = lazy\(\(\) => import\('\.\/pages\/TechCards'\)\)/)
  assert.match(app, /path="\/admin\/tech-cards"[\s\S]{0,120}page="tech_cards"><TechCards/)
  assert.match(app, /path="\/admin\/tech-cards\/:menuItemId"[\s\S]{0,120}page="tech_cards"><TechCards/)
  assert.match(sidebar, /key: 'tech_cards',[\s\S]{0,180}path: '\/admin\/tech-cards'/)
  assert.doesNotMatch(sidebar, /key: 'tech_cards',[\s\S]{0,120}accessKey: 'menu'/)
  assert.match(sidebar, /pathname\.startsWith\('\/admin\/tech-cards'\)\) return 'tech_cards'/)
})

test('Tech Cards appears as an independent Team page-access option', () => {
  const permissions = source('src/lib/permissions.js')
  const users = source('src/pages/AdminUsers.jsx')

  assert.match(permissions, /key: 'tech_cards',\s*kind: 'page'/)
  assert.match(permissions, /labels: \{ uz: 'Texnologik kartalar', ru: 'Техкарты', en: 'Tech Cards' \}/)
  assert.match(users, /FEATURE_DEFINITIONS\.filter\(feature => feature\.kind === 'page'\)/)
})

test('separate Tech Cards access is enforced by the profile constraint and recipe RLS', () => {
  const migration = source('supabase/140_tech_card_feature_access.sql')

  assert.match(migration, /profiles_feature_access_valid/)
  assert.match(migration, /'bazaar', 'tech_cards', 'team'/)
  assert.match(migration, /menu_item_tech_cards for select[\s\S]{0,120}current_staff_can_access\('tech_cards'\)/)
  assert.match(migration, /menu_item_tech_card_ingredients for select[\s\S]{0,120}current_staff_can_access\('tech_cards'\)/)
  assert.match(migration, /current_staff_can_access\('tech_cards'\)[\s\S]{0,100}current_staff_can_write\('menu'\)/)
  assert.match(migration, /array\['dashboard', 'menu', 'expenses', 'tech_cards'\]/)
})

test('Tech card migration protects recipe prices and saves a whole recipe atomically', () => {
  const migration = source('supabase/139_menu_item_tech_cards.sql')

  assert.match(migration, /create table if not exists public\.menu_item_tech_cards/)
  assert.match(migration, /create table if not exists public\.menu_item_tech_card_ingredients/)
  assert.match(migration, /revoke all on table public\.menu_item_tech_cards from public, anon, authenticated/)
  assert.match(migration, /current_staff_can_write\('menu'\)/)
  assert.match(migration, /create or replace function public\.save_menu_item_tech_card\(payload jsonb\)/)
  assert.match(migration, /delete from public\.menu_item_tech_card_ingredients[\s\S]*insert into public\.menu_item_tech_card_ingredients/)
  assert.doesNotMatch(migration, /update public\.menu_item_costs|insert into public\.menu_item_costs/)
})

test('set composition is structured, cycle-safe, and snapshotted onto new order items', () => {
  const migration = source('supabase/149_tech_card_menu_item_components.sql')
  const page = source('src/pages/TechCards.jsx')

  assert.match(migration, /create table if not exists public\.menu_item_tech_card_components/)
  assert.match(migration, /component_menu_item_id text not null references public\.menu_items\(id\)/)
  assert.match(migration, /current_staff_can_access\('tech_cards'\)[\s\S]{0,120}current_staff_can_write\('menu'\)/)
  assert.match(migration, /reject_recursive_tech_card_component/)
  assert.match(migration, /add column if not exists tech_card_component_snapshot jsonb not null default '\[\]'::jsonb/)
  assert.match(migration, /create trigger order_items_snapshot_tech_card_components/)
  assert.match(migration, /'quantity', component\.quantity/)
  assert.match(migration, /delete from public\.menu_item_tech_card_components[\s\S]*insert into public\.menu_item_tech_card_components/)
  assert.doesNotMatch(migration, /update public\.menu_item_costs|insert into public\.menu_item_costs/)
  assert.match(page, /supabase\.from\('menu_item_tech_card_components'\)/)
  assert.match(page, /createBlankTechCardComponent/)
  assert.match(page, /l\.includedItems/)
  assert.match(page, /<MenuItemPicker/)
  assert.match(page, /calculateTechCardSummary\(form, activeItems\)/)
  assert.doesNotMatch(page, /<select[\s\S]{0,300}component\.component_menu_item_id/)
})

test('Tech Card included-item picker is searchable and grouped by menu category', () => {
  const picker = source('src/components/MenuItemPicker.jsx')

  assert.match(picker, /Meal or category/)
  assert.match(picker, /getCategoryName/)
  assert.match(picker, /visibleSections/)
  assert.match(picker, /MenuMedia/)
  assert.match(picker, /getMenuItemOptionGroups\(item, lang, \{ includeUnavailable: true \}\)/)
  assert.match(picker, /group-hover:grid-rows-\[1fr\]/)
  assert.match(picker, /group-focus-visible:grid-rows-\[1fr\]/)
  assert.match(picker, /document\.addEventListener\('pointerdown'/)
})

test('included-item controls stay top-aligned when the real-cost line is visible', () => {
  const page = source('src/pages/TechCards.jsx')

  assert.match(page, /sm:grid-cols-\[minmax\(220px,1fr\)_130px_40px\] sm:items-start/)
  assert.match(page, /aria-label="Remove included menu item"[\s\S]{0,240}sm:mt-\[22px\]/)
  assert.match(page, /l\.savedCost[\s\S]{0,260}componentSummary\.lineCost/)
})

test('menu product editor links directly to its tech card', () => {
  const adminMenu = source('src/pages/AdminMenu.jsx')
  assert.match(adminMenu, /navigate\(`\/admin\/tech-cards\/\$\{encodeURIComponent\(form\.id\)\}`\)/)
})

test('database health requires the tech-card schema and atomic save RPC', () => {
  const health = source('src/lib/dbHealth.js')
  const cli = source('scripts/check-db-health.js')

  assert.match(health, /name: 'menu_item_tech_cards'/)
  assert.match(health, /name: 'menu_item_tech_card_ingredients'/)
  assert.match(health, /name: 'menu_item_tech_card_components'/)
  assert.match(health, /tech_card_component_snapshot/)
  assert.match(health, /checkRpc\(dbClient, 'save_menu_item_tech_card'\)/)
  assert.match(cli, /checkTable\('menu_item_tech_cards'/)
  assert.match(cli, /checkTable\('menu_item_tech_card_components'/)
  assert.match(cli, /tech_card_component_snapshot/)
  assert.match(cli, /save_menu_item_tech_card\(payload\)/)
})
