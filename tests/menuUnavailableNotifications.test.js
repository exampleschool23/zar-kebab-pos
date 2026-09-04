import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildDailyUnavailableMenuTeamMessage,
  buildMenuArchivedTeamMessage,
  buildMenuAvailableTeamMessage,
  buildMenuCreatedTeamMessage,
  buildMenuUnavailableTeamMessage,
} from '../api/telegram/_lib/menuAvailabilityMessages.js'
import { runDbHealthChecks } from '../src/lib/dbHealth.js'

const migration = readFileSync(
  new URL('../supabase/142_menu_unavailable_team_notifications.sql', import.meta.url),
  'utf8'
)
const dailyMigration = readFileSync(
  new URL('../supabase/143_daily_unavailable_menu_team_notifications.sql', import.meta.url),
  'utf8'
)
const dailyCategoryMigration = readFileSync(
  new URL('../supabase/145_daily_unavailable_menu_categories.sql', import.meta.url),
  'utf8'
)
const availableMigration = readFileSync(
  new URL('../supabase/146_menu_available_team_notifications.sql', import.meta.url),
  'utf8'
)
const catalogMigration = readFileSync(
  new URL('../supabase/168_menu_catalog_team_notifications.sql', import.meta.url),
  'utf8'
)
const endpoint = readFileSync(
  new URL('../api/telegram/employee-notification.js', import.meta.url),
  'utf8'
)
const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8')
const notifications = readFileSync(
  new URL('../src/lib/telegramNotifications.js', import.meta.url),
  'utf8'
)
const cliHealth = readFileSync(
  new URL('../scripts/check-db-health.js', import.meta.url),
  'utf8'
)
const dailyCron = readFileSync(
  new URL('../api/telegram/daily-salary.js', import.meta.url),
  'utf8'
)
const vercelConfig = JSON.parse(readFileSync(
  new URL('../vercel.json', import.meta.url),
  'utf8'
))

function makeHealthClient({ missingTable = '' } = {}) {
  return {
    from(name) {
      return {
        select() {
          return {
            limit() {
              return Promise.resolve(name === missingTable
                ? { error: { message: `relation "${name}" does not exist` } }
                : { data: [], error: null })
            },
          }
        },
      }
    },
    rpc() {
      return Promise.resolve({ error: { message: 'validation error' } })
    },
  }
}

test('unavailable product Team message is Russian and identifies product and actor', () => {
  const message = buildMenuUnavailableTeamMessage({
    menu_item_name: 'Шашлык <Особый>',
    actor_name: 'Анна & Али',
  })

  assert.match(message, /Стало недоступно:<\/b> Шашлык &lt;Особый&gt;/)
  assert.match(message, /👤 Анна &amp; Али/)
  assert.equal(message.split('\n').length, 2)
  assert.doesNotMatch(message, /Unavailable|Made by|Product:/)
})

test('available product Team message is Russian and identifies product and actor', () => {
  const message = buildMenuAvailableTeamMessage({
    menu_item_name: 'Шашлык <Особый>',
    actor_name: 'Анна & Али',
  })

  assert.match(message, /Снова доступно:<\/b> Шашлык &lt;Особый&gt;/)
  assert.match(message, /👤 Анна &amp; Али/)
  assert.equal(message.split('\n').length, 2)
  assert.doesNotMatch(message, /Available|Made by|Product:/)
})

test('created and archived product Team messages are Russian and identify the actor', () => {
  const event = {
    menu_item_name: 'Шашлык <Особый>',
    actor_name: 'Анна & Али',
  }
  const created = buildMenuCreatedTeamMessage(event)
  const archived = buildMenuArchivedTeamMessage(event)

  assert.match(created, /Добавлено новое блюдо/)
  assert.match(created, /Добавил\(а\):<\/b> Анна &amp; Али/)
  assert.match(archived, /Блюдо удалено из меню/)
  assert.match(archived, /Удалил\(а\):<\/b> Анна &amp; Али/)
  assert.match(created, /Шашлык &lt;Особый&gt;/)
  assert.match(archived, /Шашлык &lt;Особый&gt;/)
})

test('daily unavailable-product snapshot is Russian and lists the current state', () => {
  const message = buildDailyUnavailableMenuTeamMessage([
    {
      category_id: 'grill',
      category_name_ru: 'Мангал & гриль',
      name_ru: 'Шашлык <Особый>',
    },
    {
      category_id: 'grill',
      category_name_ru: 'Мангал & гриль',
      name_ru: '',
      name_uz: 'Лагмон & манти',
    },
    {
      category_id: 'desserts',
      category_name_ru: 'Десерты',
      name_ru: 'Медовик',
    },
  ], '2026-08-26')

  assert.match(message, /Недоступные блюда/)
  assert.match(message, /На 26 августа 2026, 08:00/)
  assert.match(message, /📂 <b>Мангал &amp; гриль<\/b>/)
  assert.match(message, /1\. Шашлык &lt;Особый&gt;/)
  assert.match(message, /2\. Лагмон &amp; манти/)
  assert.match(message, /📂 <b>Десерты<\/b>/)
  assert.match(message, /3\. Медовик/)
  assert.match(message, /Всего:<\/b> 3/)
})

test('daily unavailable-product snapshot confirms an empty current state', () => {
  const message = buildDailyUnavailableMenuTeamMessage([], '2026-08-26')

  assert.match(message, /Недоступные блюда/)
  assert.match(message, /Все блюда доступны/)
  assert.doesNotMatch(message, /Всего:/)
})

test('unavailable product event snapshots Russian name and authenticated staff only on the transition', () => {
  assert.match(migration, /menu_item_unavailable_notification_deliveries/)
  assert.match(migration, /changed_by uuid := auth\.uid\(\)/)
  assert.match(migration, /new\.name_ru[\s\S]*new\.name_uz[\s\S]*new\.name_en/)
  assert.match(migration, /profile\.full_name[\s\S]*profile\.email/)
  assert.match(migration, /after update of available on public\.menu_items/i)
  assert.match(migration, /old\.available is distinct from false and new\.available is false/i)
  assert.doesNotMatch(migration, /after insert on public\.menu_items/i)
})

test('availability event migration queues both transition directions without replaying history', () => {
  assert.match(availableMigration, /add column if not exists availability_event text not null default 'unavailable'/i)
  assert.match(availableMigration, /availability_event in \('unavailable', 'available'\)/i)
  assert.match(availableMigration, /after update of available on public\.menu_items/i)
  assert.match(availableMigration, /old\.available is distinct from new\.available/i)
  assert.match(availableMigration, /case when new\.available is false then 'unavailable' else 'available' end/i)
  assert.doesNotMatch(availableMigration, /insert into public\.menu_item_unavailable_notification_deliveries[\s\S]+select[\s\S]+from public\.menu_items/i)
})

test('catalog event migration queues authenticated creates and archives without edit noise', () => {
  assert.match(catalogMigration, /availability_event in \('unavailable', 'available', 'created', 'archived'\)/i)
  assert.match(catalogMigration, /if tg_op = 'INSERT'/i)
  assert.match(catalogMigration, /event_name := 'created'/i)
  assert.match(catalogMigration, /old\.deleted_at is null and new\.deleted_at is not null/i)
  assert.match(catalogMigration, /event_name := 'archived'/i)
  assert.match(catalogMigration, /new\.deleted_at is null[\s\S]*old\.available is distinct from new\.available/i)
  assert.match(catalogMigration, /after insert or update of available, deleted_at on public\.menu_items/i)
  assert.match(catalogMigration, /changed_by uuid := auth\.uid\(\)/i)
  assert.doesNotMatch(catalogMigration, /insert into public\.menu_item_unavailable_notification_deliveries[\s\S]+select[\s\S]+from public\.menu_items/i)
})

test('Admin Menu and kitchen unavailability writes trigger the shared authenticated endpoint', () => {
  assert.match(db, /notifyTelegramMenuAvailable/)
  assert.match(db, /notifyTelegramMenuCreated/)
  assert.match(db, /notifyTelegramMenuArchived/)
  assert.match(db, /notifyTelegramMenuUnavailable/)
  assert.match(db, /notifyTelegramOrderStatus/)
  assert.match(db, /markMenuUnavailable[\s\S]*update\(\{ available: false \}\)[\s\S]*notifyTelegramMenuUnavailable\(menuItemId\)/)
  assert.match(db, /case 'UPDATE_MENU_ITEM':[\s\S]*normalizedFields\.available === false[\s\S]*notifyTelegramMenuUnavailable\(id\)/)
  assert.match(db, /case 'UPDATE_MENU_ITEM':[\s\S]*normalizedFields\.available === true[\s\S]*notifyTelegramMenuAvailable\(id\)/)
  assert.match(db, /case 'ADD_MENU_ITEM':[\s\S]*notifyTelegramMenuCreated\(normalizedFields\.id\)/)
  assert.match(db, /case 'DELETE_MENU_ITEM':[\s\S]*notifyTelegramMenuArchived\(action\.payload\)/)
  assert.match(notifications, /'menu_unavailable'/)
  assert.match(notifications, /'menu_available'/)
  assert.match(notifications, /'menu_created'/)
  assert.match(notifications, /'menu_archived'/)
  assert.match(notifications, /menuItemId/)
  assert.equal((notifications.match(/\/api\/telegram\/employee-notification/g) || []).length, 1)
  assert.match(endpoint, /requireMenuWriteAccess/)
  assert.match(endpoint, /notifyMenuUnavailable\(supabase, user, menuItemId\)/)
  assert.match(endpoint, /notifyMenuAvailable\(supabase, user, menuItemId\)/)
  assert.match(endpoint, /notifyMenuCreated\(supabase, user, menuItemId\)/)
  assert.match(endpoint, /notifyMenuArchived\(supabase, user, menuItemId\)/)
  assert.match(endpoint, /\.eq\('availability_event', availabilityEvent\)/)
  assert.match(endpoint, /buildMenuAvailableTeamMessage/)
  assert.match(endpoint, /buildMenuCreatedTeamMessage/)
  assert.match(endpoint, /buildMenuArchivedTeamMessage/)
  assert.match(endpoint, /buildMenuUnavailableTeamMessage/)
  assert.match(endpoint, /loadSalaryTeamTarget\(supabase\)/)
  assert.match(endpoint, /\.eq\('actor_id', user\.id\)/)
  assert.match(endpoint, /PENDING_DELIVERY_RETRY_MS/)
})

test('database health requires unavailable-product delivery tracking', async () => {
  const result = await runDbHealthChecks(makeHealthClient({
    missingTable: 'menu_item_unavailable_notification_deliveries',
  }))
  const failed = result.failed.find(check => (
    check.name === 'menu_item_unavailable_notification_deliveries'
  ))

  assert.equal(result.ok, false)
  assert.match(failed.hint, /142_menu_unavailable_team_notifications/)
  assert.match(failed.hint, /146_menu_available_team_notifications/)
  assert.match(failed.hint, /168_menu_catalog_team_notifications/)
  assert.match(cliHealth, /checkTable\('menu_item_unavailable_notification_deliveries'/)
})

test('08:00 Tashkent cron sends one duplicate-safe active unavailable-product snapshot', () => {
  const unavailableCron = vercelConfig.crons.find(cron => (
    cron.path === '/api/telegram/daily-salary?task=unavailable-products'
  ))

  assert.equal(unavailableCron?.schedule, '0 3 * * *')
  assert.match(dailyCron, /cronTask = getCronTask\(req\)/)
  assert.match(dailyCron, /cronTask === 'unavailable-products'/)
  assert.match(dailyCron, /const businessDate = getTashkentDate\(now\)/)
  assert.match(dailyCron, /sendDailyUnavailableMenuNotification\(supabase, businessDate\)/)
  assert.match(dailyCron, /\.from\('menu_items'\)[\s\S]*?\.eq\('available', false\)[\s\S]*?\.is\('deleted_at', null\)/)
  assert.match(dailyCron, /\.from\('menu_categories'\)[\s\S]*?\.is\('deleted_at', null\)/)
  assert.match(dailyCron, /\.select\('id, name_ru, name_uz, name_en, sort_order'\)/)
  assert.match(dailyCron, /\.eq\('target_key', 'team_events'\)/)
  assert.match(dailyCron, /daily_unavailable_menu_notification_deliveries/)
  assert.match(dailyCron, /item_categories: items\.map\(getRussianMenuCategoryName\)/)
  assert.match(dailyCron, /buildDailyUnavailableMenuTeamMessage\(items, businessDate\)/)
  assert.match(dailyMigration, /business_date\s+date primary key/)
  assert.match(dailyMigration, /item_ids\s+jsonb/)
  assert.match(dailyMigration, /item_names\s+jsonb/)
  assert.match(dailyMigration, /target_key\s+text not null default 'team_events'/)
  assert.match(dailyCategoryMigration, /add column if not exists item_categories jsonb/i)
  assert.match(dailyCategoryMigration, /jsonb_typeof\(item_categories\) = 'array'/i)
})

test('database health requires daily unavailable-menu snapshots', async () => {
  const result = await runDbHealthChecks(makeHealthClient({
    missingTable: 'daily_unavailable_menu_notification_deliveries',
  }))
  const failed = result.failed.find(check => (
    check.name === 'daily_unavailable_menu_notification_deliveries'
  ))

  assert.equal(result.ok, false)
  assert.match(failed.hint, /143_daily_unavailable_menu_team_notifications/)
  assert.match(failed.hint, /145_daily_unavailable_menu_categories/)
  assert.match(cliHealth, /checkTable\('daily_unavailable_menu_notification_deliveries'/)
})
