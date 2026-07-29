import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=')
        const key = line.slice(0, separator).trim()
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '')
        return [key, value]
      }),
  )
}

const env = {
  ...loadEnvFile(path.join(root, '.env')),
  ...loadEnvFile(path.join(root, '.env.local')),
  ...process.env,
}

const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to include hidden menu records.',
  )
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const [categoriesResult, itemsResult] = await Promise.all([
  supabase
    .from('menu_categories')
    .select('id,name_uz,name_ru,name_en,sort_order,hidden,waiter_hidden')
    .order('sort_order')
    .order('id'),
  supabase
    .from('menu_items')
    .select(
      'id,category_id,name_uz,name_ru,name_en,description_uz,description_ru,description_en,price,old_price,image_url,media_urls,available,cashier_only,public_hidden,waiter_hidden,sort_order,deleted_at',
    )
    .is('deleted_at', null)
    .order('sort_order')
    .order('id'),
])

if (categoriesResult.error) throw categoriesResult.error
if (itemsResult.error) throw itemsResult.error

const categoriesById = new Map(
  categoriesResult.data.map((category) => [category.id, category]),
)
const items = itemsResult.data.map((item) => {
  const category = categoriesById.get(item.category_id)
  return {
    ...item,
    category_uz: category?.name_uz || '',
    category_ru: category?.name_ru || '',
    category_en: category?.name_en || '',
  }
})

const outputPath = path.join(
  root,
  'artifacts',
  'zarkebab-full-menu-catalog.json',
)
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      refreshed_at: new Date().toISOString(),
      categories: categoriesResult.data,
      items,
    },
    null,
    2,
  )}\n`,
)

console.log(
  JSON.stringify({
    outputPath,
    categories: categoriesResult.data.length,
    items: items.length,
    latestCategories: categoriesResult.data.slice(-5).map((category) => ({
      id: category.id,
      name_ru: category.name_ru,
      name_en: category.name_en,
      sort_order: category.sort_order,
    })),
  }),
)
