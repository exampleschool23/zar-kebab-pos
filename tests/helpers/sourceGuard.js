import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const root = new URL('../..', import.meta.url).pathname
const srcDir = join(root, 'src')

export function readSource(path) {
  return readFileSync(join(root, path), 'utf8')
}

export function sourceFiles(dir = srcDir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) return sourceFiles(path)
    return /\.(js|jsx)$/.test(name) ? [path] : []
  })
}

export function functionBody(source, functionName) {
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
