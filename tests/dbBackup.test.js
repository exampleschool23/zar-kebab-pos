import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const pathOf = relative => new URL(`../${relative}`, import.meta.url).pathname
const read = relative => readFileSync(pathOf(relative), 'utf8')

test('backup scripts are valid bash', () => {
  for (const script of ['scripts/db-backup.sh', 'scripts/db-restore.sh']) {
    const result = spawnSync('bash', ['-n', pathOf(script)])
    assert.equal(result.status, 0, result.stderr.toString())
  }
})

test('backup fails fast without configuration instead of dumping nothing', () => {
  const result = spawnSync('bash', [pathOf('scripts/db-backup.sh')], { env: { PATH: process.env.PATH } })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr.toString(), /Missing required variable/)
})

test('backups are encrypted and the workflow passes secrets only through env', () => {
  const script = read('scripts/db-backup.sh')
  const flow = read('.github/workflows/db-backup.yml')
  assert.match(script, /age -r/)
  assert.doesNotMatch(script, /pg_dump[^\n]*>\s*[^"$]/)
  assert.match(script, /--schema=public --schema=auth/)
  assert.match(script, /"\$\{PG_DUMP:-pg_dump\}"/)
  assert.match(flow, /PG_DUMP: \/usr\/lib\/postgresql\/17\/bin\/pg_dump/)
  assert.match(flow, /cron:/)
  assert.match(flow, /workflow_dispatch/)
  assert.match(flow, /if: failure\(\)/)
  assert.doesNotMatch(flow, /run:[^\n]*\$\{\{\s*secrets\./)
})

test('restore requires an identity file and both arguments', () => {
  const restore = pathOf('scripts/db-restore.sh')
  assert.notEqual(spawnSync('bash', [restore], { env: { PATH: process.env.PATH } }).status, 0)
  const result = spawnSync('bash', [restore, 'a', 'b'], { env: { PATH: process.env.PATH } })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr.toString(), /AGE_IDENTITY_FILE/)
})
