import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const agentDocsDir = path.join(root, 'docs', 'agent')

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8')
}

test('root agent guide stays lean and routes every focused guide exactly once', async () => {
  const guide = await read('AGENTS.md')
  const docNames = (await fs.readdir(agentDocsDir))
    .filter(name => name.endsWith('.md') && name !== 'legacy-context.md')
    .sort()
  const routedNames = [...guide.matchAll(/`docs\/agent\/([^`]+\.md)`/g)]
    .map(match => match[1])
    .filter(name => name !== 'legacy-context.md')
    .sort()

  assert.ok(guide.length <= 5_000, `AGENTS.md is ${guide.length} characters`)
  assert.deepEqual(routedNames, docNames)
  assert.match(guide, /known, use `rg`/)
  assert.match(guide, /unfamiliar feature, use `repo_nav`/)
  assert.match(guide, /update the corresponding `docs\/agent\/` guide and `mcp\/project-map\.json` in the same change/)
})

test('focused agent guides stay bounded and expose task entry points', async () => {
  const docNames = (await fs.readdir(agentDocsDir))
    .filter(name => name.endsWith('.md') && name !== 'legacy-context.md')

  for (const name of docNames) {
    const contents = await read(`docs/agent/${name}`)
    assert.ok(contents.length <= 6_500, `${name} is ${contents.length} characters`)
    assert.match(contents, /^## Entry points$/m, name)
  }
})

test('exact project paths named by agent guides exist', async () => {
  const guideNames = ['AGENTS.md', ...(await fs.readdir(agentDocsDir))
    .filter(name => name.endsWith('.md') && name !== 'legacy-context.md')
    .map(name => `docs/agent/${name}`)]

  for (const guideName of guideNames) {
    const contents = await read(guideName)
    const projectPaths = [...contents.matchAll(/`((?:src|api|tests|mcp|scripts|supabase)\/[^`]+)`/g)]
      .map(match => match[1])
      .filter(relativePath => !relativePath.includes('*'))
    for (const relativePath of projectPaths) {
      const stat = await fs.stat(path.join(root, relativePath))
      assert.ok(stat.isFile() || stat.isDirectory(), `${guideName}: ${relativePath}`)
    }
  }
})

test('database guide names the newest migration family', async () => {
  const migrationNames = (await fs.readdir(path.join(root, 'supabase')))
    .filter(name => /^\d{3}_.+\.sql$/.test(name))
  const latest = Math.max(...migrationNames.map(name => Number(name.slice(0, 3))))
  const guide = await read('docs/agent/database-testing.md')

  assert.match(guide, new RegExp(`\\b${latest}\\b`))
})

test('Tech Card guide preserves base and variant recipe identity', async () => {
  const guide = await read('docs/agent/menu-tech-cards.md')
  const migration = await read('supabase/156_variant_tech_cards.sql')

  assert.match(migration, /primary key \(menu_item_id, variant_option_id\)/)
  assert.match(guide, /one protected base recipe and one recipe per eligible variant/i)
  assert.match(guide, /variant_option_id/)
  assert.match(guide, /variant_costs/)
})

test('source guards remain domain-split and navigable', async () => {
  const testNames = await fs.readdir(path.join(root, 'tests'))
  const sourceGuardNames = testNames.filter(name => /^sourceGuards\..+\.test\.js$/.test(name)).sort()

  assert.equal(testNames.includes('sourceGuards.test.js'), false)
  assert.deepEqual(sourceGuardNames, [
    'sourceGuards.accounting-reporting.test.js',
    'sourceGuards.architecture.test.js',
    'sourceGuards.menu.test.js',
    'sourceGuards.ordering.test.js',
    'sourceGuards.payments-reporting.test.js',
    'sourceGuards.public-menu.test.js',
  ])
  for (const name of sourceGuardNames) {
    const contents = await read(`tests/${name}`)
    const lineCount = contents.split(/\r?\n/).length
    assert.ok(lineCount <= 1_000, `${name} has ${lineCount} lines`)
    assert.match(contents, /from '\.\/helpers\/sourceGuard\.js'/)
  }
})
