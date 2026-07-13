import { createHash } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'

const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs',
  '.sql', '.toml', '.ts', '.tsx', '.yaml', '.yml',
])

const EXCLUDED_DIRS = new Set([
  '.git', '.next', '.turbo', '.vercel', 'coverage', 'dist', 'migration-reports',
  'node_modules', 'playwright-report', 'test-results',
])

const ALLOWED_DOT_DIRS = new Set(['.github'])
const SECRET_NAME = /(^|\/)(?:\.env(?:\.|$)|(?:(?:auth|token|credentials?|service[-_]?account|api[-_]?key|secrets?)(?:[-_.][^/]*)?|client[-_]?secret(?:[-_.][^/]*)?|firebase[-_]?adminsdk(?:[-_.][^/]*)?|serviceaccountkey)\.(?:json|toml|ya?ml|txt)$|.*(?:private[-_]?key).*)/i
const KEY_EXTENSION = /\.(?:key|p12|pfx|pem)$/i
const MAX_QUERY_CHARS = 512
const MAX_QUERY_TOKENS = 16
const MAX_MATCHES = 5_000
const CURSOR_TOKEN_LENGTH = 16
const CURSOR_CACHE_LIMIT = 512
const MAX_BLOCK_SCAN_LINES = 5_000
const KIND_SCORE = new Map([
  ['sql-function', 55], ['function', 50], ['class', 45], ['action', 42],
  ['route', 40], ['symbol', 35], ['sql-table', 35], ['sql-trigger', 30],
  ['sql-policy', 30], ['test', 18], ['file', 16], ['rpc', 10], ['table', 8],
  ['heading', 4], ['import', -5],
])
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 50
const HARD_MAX_CHARS = 16_000
const DEFAULT_BUDGETS = {
  guide: 2_500,
  map: 4_000,
  find: 4_000,
  outline: 4_000,
  read: 6_000,
  refs: 4_000,
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value)
  return Number.isFinite(number)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(number)))
    : fallback
}

function normalizeRelative(value = '') {
  return String(value).replaceAll('\\', '/').replace(/^\.\//, '')
}

function shortId(kind, filePath, start, label, revision) {
  const hash = createHash('sha256')
    .update(`${revision}\0${kind}\0${filePath}\0${start}\0${label}`)
    .digest()
    .subarray(0, 16)
    .toString('base64url')
  return `${kind[0] || 'x'}${hash}`
}

function compactLine(value, maximum = 180) {
  const oneLine = String(value).replace(/\s+/g, ' ').trim()
  return oneLine.length > maximum ? `${oneLine.slice(0, maximum - 1)}…` : oneLine
}

function queryTokens(query) {
  const tokens = String(query).toLowerCase().split(/\s+/).filter((token) => token.length > 1)
  if (tokens.length > MAX_QUERY_TOKENS) throw new Error(`Query exceeds ${MAX_QUERY_TOKENS} searchable words`)
  return tokens
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error('Navigation request cancelled')
}

function firstCodeLine(lines, start, maximum = 180) {
  return compactLine(lines[start - 1] || '', maximum)
}

function findSqlEnd(lines, startLine, isFunction) {
  const endLimit = Math.min(lines.length, startLine - 1 + MAX_BLOCK_SCAN_LINES)
  if (isFunction) {
    let delimiter = null
    let openingLine = -1
    for (let index = startLine - 1; index < endLimit; index += 1) {
      const delimiters = [...lines[index].matchAll(/\$[A-Za-z0-9_]*\$/g)].map((match) => match[0])
      if (!delimiter && delimiters.length > 0) {
        delimiter = delimiters[0]
        openingLine = index
        if (delimiters.filter((value) => value === delimiter).length > 1 && /;\s*(?:--.*)?$/.test(lines[index])) return index + 1
        continue
      }
      if (delimiter && index > openingLine && lines[index].includes(delimiter) && /;\s*(?:--.*)?$/.test(lines[index])) return index + 1
    }
  }
  for (let index = startLine - 1; index < endLimit; index += 1) {
    if (lines[index].includes(';')) return index + 1
  }
  return endLimit
}

function regexCanStart(line, index) {
  const prefix = line.slice(0, index).trimEnd()
  return prefix === ''
    || /[=(:,!&|?;{}\[\]]$/.test(prefix)
    || /(?:=>|\b(?:return|throw|case|yield|await))\s*$/.test(prefix)
}

function expressionContinues(line) {
  return /(?:=|=>|\?|:|,|\.|\+|-|\*|\/|&&|\|\|)\s*(?:\/\/.*)?$/.test(line.trim())
}

function codeTokenLines(lines, token) {
  const matches = new Set()
  let state = 'code'
  let escaped = false
  let regexClass = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (let position = 0; position < line.length; position += 1) {
      const char = line[position]
      const next = line[position + 1]

      if (state === 'block-comment') {
        if (char === '*' && next === '/') { state = 'code'; position += 1 }
        continue
      }
      if (state === 'single' || state === 'double' || state === 'template') {
        if (escaped) { escaped = false; continue }
        if (char === '\\') { escaped = true; continue }
        if ((state === 'single' && char === "'") || (state === 'double' && char === '"') || (state === 'template' && char === '`')) state = 'code'
        continue
      }
      if (state === 'regex') {
        if (escaped) { escaped = false; continue }
        if (char === '\\') { escaped = true; continue }
        if (char === '[') { regexClass = true; continue }
        if (char === ']' && regexClass) { regexClass = false; continue }
        if (char === '/' && !regexClass) state = 'code'
        continue
      }

      if (line.startsWith(token, position)) matches.add(index)
      if (char === '/' && next === '/') break
      if (char === '/' && next === '*') { state = 'block-comment'; position += 1; continue }
      if (char === "'") { state = 'single'; escaped = false; continue }
      if (char === '"') { state = 'double'; escaped = false; continue }
      if (char === '`') { state = 'template'; escaped = false; continue }
      if (char === '/' && next !== '>' && regexCanStart(line, position)) { state = 'regex'; escaped = false; regexClass = false }
    }
    if (state === 'single' || state === 'double' || state === 'regex') state = 'code'
  }

  return matches
}

function findCaseEnd(lines, startLine) {
  const endLimit = Math.min(lines.length, startLine - 1 + MAX_BLOCK_SCAN_LINES)
  for (let index = startLine; index < endLimit; index += 1) {
    if (/^\s*(?:case\s+.+:|default\s*:)/.test(lines[index])) return index
  }
  return endLimit
}

function findBlockEnd(lines, startLine, extension, options = {}) {
  if (extension === '.sql') return findSqlEnd(lines, startLine, options.sqlFunction === true)

  let braces = 0
  let parentheses = 0
  let brackets = 0
  let opened = false
  let sawBodyBrace = false
  let state = 'code'
  let escaped = false
  let regexClass = false
  const endLimit = Math.min(lines.length, startLine - 1 + MAX_BLOCK_SCAN_LINES)

  for (let index = startLine - 1; index < endLimit; index += 1) {
    const line = lines[index]
    for (let position = 0; position < line.length; position += 1) {
      const char = line[position]
      const next = line[position + 1]

      if (state === 'block-comment') {
        if (char === '*' && next === '/') { state = 'code'; position += 1 }
        continue
      }
      if (state === 'single' || state === 'double' || state === 'template') {
        if (escaped) { escaped = false; continue }
        if (char === '\\') { escaped = true; continue }
        if ((state === 'single' && char === "'") || (state === 'double' && char === '"') || (state === 'template' && char === '`')) state = 'code'
        continue
      }
      if (state === 'regex') {
        if (escaped) { escaped = false; continue }
        if (char === '\\') { escaped = true; continue }
        if (char === '[') { regexClass = true; continue }
        if (char === ']' && regexClass) { regexClass = false; continue }
        if (char === '/' && !regexClass) state = 'code'
        continue
      }

      if (char === '/' && next === '/') break
      if (char === '/' && next === '*') { state = 'block-comment'; position += 1; continue }
      if (char === "'") { state = 'single'; escaped = false; continue }
      if (char === '"') { state = 'double'; escaped = false; continue }
      if (char === '`') { state = 'template'; escaped = false; continue }
      if (char === '/' && next !== '>' && regexCanStart(line, position)) { state = 'regex'; escaped = false; regexClass = false; continue }

      if (char === '{') {
        if (parentheses === 0 && brackets === 0) sawBodyBrace = true
        braces += 1
        opened = true
      } else if (char === '}') braces -= 1
      else if (char === '(') { parentheses += 1; opened = true }
      else if (char === ')') parentheses -= 1
      else if (char === '[') { brackets += 1; opened = true }
      else if (char === ']') brackets -= 1
    }

    if (state === 'single' || state === 'double' || state === 'regex') state = 'code'
    if (opened && braces <= 0 && parentheses <= 0 && brackets <= 0 && (!options.requiresBlock || sawBodyBrace) && !expressionContinues(line)) return index + 1
    if (!opened && !options.requiresBlock && !expressionContinues(line)) return index + 1
  }

  return endLimit
}

function addUniqueItem(items, seen, item, revision) {
  const key = `${item.kind}\0${item.path}\0${item.start}\0${item.label}`
  if (seen.has(key)) return
  seen.add(key)
  items.push({
    ...item,
    id: shortId(item.kind, item.path, item.start, item.label, revision),
  })
}

function parseSourceFile(file, revision) {
  const { path: filePath, lines, extension } = file
  const items = []
  const seen = new Set()
  const routeLines = extension === '.jsx' || extension === '.tsx' ? codeTokenLines(lines, '<Route') : new Set()
  const add = (item) => addUniqueItem(items, seen, item, revision)

  add({
    kind: 'file', path: filePath, start: 1, end: lines.length,
    label: path.basename(filePath), detail: `${lines.length} lines`,
  })

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = index + 1
    const depth = (line.match(/^\s*/)?.[0] || '').replaceAll('\t', '  ').length
    const exported = /^\s*export\b/.test(line)
    let match

    if ((match = line.match(/^\s*import\s+(?:.+?\s+from\s+)?['"]([^'"]+)['"]/))) {
      add({ kind: 'import', path: filePath, start: lineNumber, end: lineNumber, label: match[1], detail: compactLine(line) })
    }

    if ((match = line.match(/^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)/))) {
      add({
        kind: 'function', path: filePath, start: lineNumber,
        end: findBlockEnd(lines, lineNumber, extension, { requiresBlock: true }),
        label: match[1], detail: compactLine(`${match[1]}(${match[2]})`), depth, exported,
      })
    } else if ((match = line.match(/^\s*(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/))) {
      add({
        kind: 'class', path: filePath, start: lineNumber,
        end: findBlockEnd(lines, lineNumber, extension, { requiresBlock: true }),
        label: match[1], detail: firstCodeLine(lines, lineNumber), depth, exported,
      })
    } else if ((match = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/))) {
      add({
        kind: 'symbol', path: filePath, start: lineNumber,
        end: findBlockEnd(lines, lineNumber, extension),
        label: match[1], detail: firstCodeLine(lines, lineNumber), depth, exported,
      })
    }

    if (routeLines.has(index)) {
      let routeEnd = index
      let routeTag = line
      while (!routeTag.includes('>') && routeEnd + 1 < lines.length && routeEnd - index < 12) {
        routeEnd += 1
        routeTag += ` ${lines[routeEnd]}`
      }
      const route = routeTag.match(/<Route\b[^>]*\bpath=["']([^"']+)["'][^>]*>/)
      if (route) {
        const componentNames = [...routeTag.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)]
          .map((component) => component[1])
          .filter((name) => name !== 'Route')
        add({
          kind: 'route', path: filePath, start: lineNumber, end: routeEnd + 1,
          label: route[1], detail: componentNames.join('>') || compactLine(routeTag),
        })
      }
    }

    if ((match = line.match(/\bcase\s+['"]([A-Z][A-Z0-9_]*)['"]\s*:/))) {
      add({
        kind: 'action', path: filePath, start: lineNumber,
        end: findCaseEnd(lines, lineNumber),
        label: match[1], detail: 'reducer/dispatch action',
      })
    }

    const dbPattern = /\.(from|rpc)\(\s*['"]([^'"]+)['"]/g
    while ((match = dbPattern.exec(line))) {
      add({
        kind: match[1] === 'rpc' ? 'rpc' : 'table', path: filePath,
        start: lineNumber, end: lineNumber, label: match[2], detail: compactLine(line),
      })
    }

    if ((match = line.match(/^\s*(?:test|it)\s*\(\s*['"`]([^'"`]+)['"`]/))) {
      add({
        kind: 'test', path: filePath, start: lineNumber,
        end: findBlockEnd(lines, lineNumber, extension),
        label: match[1], detail: firstCodeLine(lines, lineNumber),
      })
    }

    if ((match = line.match(/^(#{1,6})\s+(.+)$/))) {
      add({
        kind: 'heading', path: filePath, start: lineNumber, end: lineNumber,
        label: compactLine(match[2]), detail: `h${match[1].length}`,
      })
    }

    if (extension === '.sql' && (match = line.match(/^\s*(?:create(?:\s+or\s+replace)?|alter)\s+(table|function|trigger|policy|index|view)\s+(?:if\s+(?:not\s+)?exists\s+)?(?:public\.)?["']?([\w.-]+)/i))) {
      const sqlKind = match[1].toLowerCase()
      add({
        kind: `sql-${sqlKind}`, path: filePath, start: lineNumber,
        end: findBlockEnd(lines, lineNumber, extension, { sqlFunction: sqlKind === 'function' }), label: match[2].replace(/["']$/, ''),
        detail: compactLine(line),
      })
    }
  }

  return items
}

function rowFor(item) {
  return [item.id, item.kind, item.path, `L${item.start}-${item.end}`, item.label, item.detail || '']
}

function boundedRows({ revision, rows, offset, limit, budget, cursorBase, hint, makeCursor, meta = {} }) {
  const selected = []
  let nextOffset = null

  for (let index = offset; index < rows.length && selected.length < limit; index += 1) {
    let row = rows[index]
    const makeProbe = (candidateRow) => ({
      ...meta,
      rev: revision,
      cols: ['id', 'kind', 'path', 'lines', 'label', 'detail'],
      rows: [...selected, candidateRow],
      next: 'x'.repeat(CURSOR_TOKEN_LENGTH),
      truncated: true,
      ...(hint ? { hint } : {}),
    })
    let probe = makeProbe(row)
    if (JSON.stringify(probe).length > budget && selected.length === 0) {
      row = [row[0], row[1], compactLine(row[2], 80), row[3], compactLine(row[4], 50), compactLine(row[5], 70)]
      probe = makeProbe(row)
    }
    if (JSON.stringify(probe).length > budget && selected.length === 0) {
      row = [row[0], row[1], '', row[3], compactLine(row[4], 30), '']
      probe = makeProbe(row)
    }
    if (JSON.stringify(probe).length > budget) {
      nextOffset = selected.length === 0 ? index + 1 : index
      break
    }
    selected.push(row)
    if (selected.length === limit && index + 1 < rows.length) nextOffset = index + 1
  }

  const next = nextOffset === null ? null : makeCursor({ ...cursorBase, offset: nextOffset, rev: revision })
  return {
    ...meta,
    rev: revision,
    cols: ['id', 'kind', 'path', 'lines', 'label', 'detail'],
    rows: selected,
    next,
    truncated: next !== null,
    ...(hint ? { hint } : {}),
  }
}

export class RepoNavigator {
  constructor(root, options = {}) {
    this.root = path.resolve(root)
    this.maxFileBytes = options.maxFileBytes || 512_000
    this.maxFiles = options.maxFiles || 5_000
    this.maxTotalBytes = options.maxTotalBytes || 25_000_000
    this.maxDepth = options.maxDepth || 24
    this.maxEntries = options.maxEntries || 20_000
    this.maxItems = options.maxItems || 100_000
    this.maxLines = options.maxLines || 500_000
    this.revision = 'empty'
    this.metadataRevision = 'empty'
    this.files = new Map()
    this.items = []
    this.itemById = new Map()
    this.dynamicItemIds = new Set()
    this.projectMap = null
    this.cursorCache = new Map()
  }

  async #walk(directory, relative = '', depth = 0, totals = { files: 0, bytes: 0, entries: 0 }, signal) {
    throwIfAborted(signal)
    if (depth > this.maxDepth) return []
    const output = []
    const entries = []
    const directoryHandle = await fs.opendir(directory)
    for await (const entry of directoryHandle) {
      totals.entries += 1
      if (totals.entries > this.maxEntries) throw new Error(`Index entry limit exceeded (${this.maxEntries})`)
      entries.push(entry)
    }
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const relativePath = normalizeRelative(path.posix.join(relative, entry.name))
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && (!entry.name.startsWith('.') || ALLOWED_DOT_DIRS.has(entry.name))) {
          output.push(...await this.#walk(path.join(directory, entry.name), relativePath, depth + 1, totals, signal))
        }
        continue
      }
      if (!entry.isFile() || SECRET_NAME.test(relativePath) || KEY_EXTENSION.test(entry.name)) continue
      const extension = path.extname(entry.name).toLowerCase()
      if (!TEXT_EXTENSIONS.has(extension)) continue
      const absolutePath = path.join(directory, entry.name)
      const stat = await fs.lstat(absolutePath)
      if (!stat.isFile()) continue
      if (stat.size > this.maxFileBytes) continue
      totals.files += 1
      totals.bytes += stat.size
      if (totals.files > this.maxFiles) throw new Error(`Index file limit exceeded (${this.maxFiles})`)
      if (totals.bytes > this.maxTotalBytes) throw new Error(`Index byte limit exceeded (${this.maxTotalBytes})`)
      output.push({
        absolutePath, relativePath, extension, size: stat.size,
        mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, dev: stat.dev, ino: stat.ino,
      })
    }

    return output
  }

  async ensureIndex(signal) {
    const candidates = await this.#walk(this.root, '', 0, { files: 0, bytes: 0, entries: 0 }, signal)
    const metadataHash = createHash('sha1')
    for (const candidate of candidates) {
      throwIfAborted(signal)
      metadataHash.update(`${candidate.relativePath}\0${candidate.size}\0${candidate.mtimeMs}\0${candidate.ctimeMs}\0`)
    }
    const metadataRevision = metadataHash.digest('hex')
    if (metadataRevision === this.metadataRevision) return

    const canonicalRoot = await fs.realpath(this.root)
    const hash = createHash('sha1')
    const files = new Map()
    let totalBytes = 0
    let totalLines = 0

    for (const candidate of candidates) {
      throwIfAborted(signal)
      const realPath = await fs.realpath(candidate.absolutePath)
      if (realPath !== canonicalRoot && !realPath.startsWith(`${canonicalRoot}${path.sep}`)) continue
      const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0) | (fsConstants.O_NONBLOCK || 0)
      const handle = await fs.open(realPath, flags)
      let content
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > this.maxFileBytes) continue
        if (stat.dev !== candidate.dev || stat.ino !== candidate.ino) continue
        const verifiedPath = await fs.realpath(realPath)
        if (verifiedPath !== canonicalRoot && !verifiedPath.startsWith(`${canonicalRoot}${path.sep}`)) continue
        const verifiedStat = await fs.stat(verifiedPath)
        if (verifiedStat.dev !== stat.dev || verifiedStat.ino !== stat.ino) continue
        totalBytes += stat.size
        if (totalBytes > this.maxTotalBytes) throw new Error(`Index byte limit exceeded (${this.maxTotalBytes})`)
        content = await handle.readFile('utf8')
      } finally {
        await handle.close()
      }
      if (content.includes('\u0000')) continue
      hash.update(candidate.relativePath).update('\0').update(content).update('\0')
      const lines = content.split(/\r?\n/)
      totalLines += lines.length
      if (totalLines > this.maxLines) throw new Error(`Index line limit exceeded (${this.maxLines})`)
      files.set(candidate.relativePath, { ...candidate, path: candidate.relativePath, content, lines })
    }

    const revision = hash.digest('hex').slice(0, 12)
    if (revision === this.revision) {
      this.metadataRevision = metadataRevision
      return
    }

    const items = []
    for (const file of files.values()) {
      const parsed = parseSourceFile(file, revision)
      if (items.length + parsed.length > this.maxItems) throw new Error(`Index item limit exceeded (${this.maxItems})`)
      items.push(...parsed)
    }
    items.sort((left, right) => left.path.localeCompare(right.path) || left.start - right.start || left.kind.localeCompare(right.kind))

    const itemById = new Map()
    for (const item of items) {
      if (itemById.has(item.id)) throw new Error(`Navigation ID collision for ${item.path}:${item.start}`)
      itemById.set(item.id, item)
    }

    this.revision = revision
    this.metadataRevision = metadataRevision
    this.files = files
    this.items = items
    this.itemById = itemById
    this.dynamicItemIds.clear()
    this.cursorCache.clear()
    const mapFile = files.get('mcp/project-map.json')
    try {
      this.projectMap = mapFile ? JSON.parse(mapFile.content) : null
    } catch {
      this.projectMap = null
    }
  }

  #assertPath(requestedPath) {
    const normalized = normalizeRelative(requestedPath)
    if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized) || SECRET_NAME.test(normalized) || KEY_EXTENSION.test(normalized)) {
      throw new Error('Path is outside the readable project scope')
    }
    const absolute = path.resolve(this.root, normalized)
    if (absolute !== this.root && !absolute.startsWith(`${this.root}${path.sep}`)) throw new Error('Path is outside the readable project scope')
    const file = this.files.get(normalized)
    if (!file) throw new Error(`Indexed text file not found: ${normalized}`)
    return file
  }

  #cursor(args, op) {
    if (!args.cursor) return { offset: 0 }
    const decoded = this.cursorCache.get(String(args.cursor))
    if (!decoded) throw new Error('Cursor is invalid, stale, or expired')
    if (decoded.op !== op || decoded.rev !== this.revision) throw new Error('Cursor is stale or belongs to another operation')
    return decoded
  }

  #makeCursor(payload) {
    const token = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest()
      .subarray(0, 12)
      .toString('base64url')
    this.cursorCache.set(token, payload)
    while (this.cursorCache.size > CURSOR_CACHE_LIMIT) this.cursorCache.delete(this.cursorCache.keys().next().value)
    return token
  }

  #rememberDynamicItem(item) {
    if (this.itemById.has(item.id)) return
    this.itemById.set(item.id, item)
    this.dynamicItemIds.add(item.id)
    while (this.dynamicItemIds.size > MAX_MATCHES) {
      const oldest = this.dynamicItemIds.values().next().value
      this.dynamicItemIds.delete(oldest)
      this.itemById.delete(oldest)
    }
  }

  #budget(args, op) {
    return clamp(args.max_chars, 500, HARD_MAX_CHARS, DEFAULT_BUDGETS[op])
  }

  #limit(args) {
    return clamp(args.limit, 1, MAX_LIMIT, DEFAULT_LIMIT)
  }

  #guide(args) {
    const cursor = this.#cursor(args, 'guide')
    const map = this.projectMap || {}
    const landmarkRows = (map.landmarks || []).map(([name, filePath, detail]) => {
      const item = this.items.find((candidate) => candidate.kind === 'file' && candidate.path === filePath)
      return [item?.id || '', 'landmark', filePath, 'L1', name, detail]
    })
    const commandRows = (map.commands || []).map((command) => ['', 'command', '', '-', command, 'project command'])
    const ruleRows = (map.rules || []).slice(0, 8).map((rule) => ['', 'rule', '', '-', rule, 'project guardrail'])
    return boundedRows({
      revision: this.revision,
      rows: [...landmarkRows, ...commandRows, ...ruleRows],
      offset: cursor.offset || 0,
      limit: args.limit === undefined ? MAX_LIMIT : this.#limit(args),
      budget: this.#budget(args, 'guide'),
      cursorBase: { op: 'guide' },
      hint: 'Use find, then outline, then read only selected IDs/ranges.',
      meta: {
        project: compactLine(map.name || path.basename(this.root), 80),
        summary: compactLine(map.summary || 'Indexed local software project', 240),
      },
      makeCursor: (payload) => this.#makeCursor(payload),
    })
  }

  #map(args) {
    const cursor = this.#cursor(args, 'map')
    const rawQuery = args.q ?? cursor.q ?? ''
    if (args.q !== undefined && cursor.q !== undefined && String(args.q) !== String(cursor.q)) throw new Error('Cursor query does not match q')
    const query = String(rawQuery).trim().toLowerCase()
    if (query.length > MAX_QUERY_CHARS) throw new Error(`map q must contain at most ${MAX_QUERY_CHARS} characters`)
    if (query) queryTokens(query)
    const features = (this.projectMap?.features || []).filter((feature) => {
      if (!query) return true
      const haystack = [feature.name, ...(feature.keywords || []), ...(feature.files || []), ...(feature.tests || [])].join(' ').toLowerCase()
      return query.split(/\s+/).every((token) => haystack.includes(token))
    })
    const featureRows = features.map((feature) => [
      '',
      'feature',
      (feature.files || [])[0] || '',
      '-',
      feature.name,
      `files:${(feature.files || []).join(',')} tests:${(feature.tests || []).join(',')}`,
    ])
    const routeRows = this.items
      .filter((item) => item.kind === 'route' && (!query || `${item.label} ${item.detail}`.toLowerCase().includes(query)))
      .map(rowFor)
    return boundedRows({
      revision: this.revision,
      rows: [...featureRows, ...routeRows],
      offset: cursor.offset || 0,
      limit: this.#limit(args),
      budget: this.#budget(args, 'map'),
      cursorBase: { op: 'map', q: rawQuery },
      hint: query ? 'Use find with a symbol, action, route, table, RPC, or task phrase.' : 'Filter map with q, or use find for live source matches.',
      makeCursor: (payload) => this.#makeCursor(payload),
    })
  }

  #find(args, signal) {
    const cursor = this.#cursor(args, 'find')
    const query = String(args.q ?? cursor.q ?? '').trim()
    if (!query) throw new Error('find requires q')
    if (query.length < 2 || query.length > MAX_QUERY_CHARS) throw new Error(`find q must contain 2-${MAX_QUERY_CHARS} characters`)
    if (args.q !== undefined && cursor.q !== undefined && String(args.q) !== String(cursor.q)) throw new Error('Cursor query does not match q')
    const lower = query.toLowerCase()
    const tokens = queryTokens(lower)
    const requiredMatches = tokens.length > 1 ? Math.ceil(tokens.length * 0.6) : 1
    const scored = []

    for (const item of this.items) {
      throwIfAborted(signal)
      const label = item.label.toLowerCase()
      const filePath = item.path.toLowerCase()
      const detail = (item.detail || '').toLowerCase()
      let score = 0
      let directMatch = false
      if (label === lower) { score += 120; directMatch = true }
      else if (label.startsWith(lower)) { score += 90; directMatch = true }
      else if (label.includes(lower)) { score += 70; directMatch = true }
      if (item.kind === 'file' && path.basename(filePath) === lower) { score += 100; directMatch = true }
      else if (item.kind === 'file' && filePath.includes(lower)) { score += 65; directMatch = true }
      else if (path.basename(filePath, path.extname(filePath)) === lower) { score += 12; directMatch = true }
      if (detail.includes(lower)) { score += 45; directMatch = true }
      const tokenMatches = tokens.filter((token) => `${label} ${filePath} ${detail}`.includes(token)).length
      score += tokenMatches * 14
      const matched = directMatch || tokenMatches >= requiredMatches
      if (tokens.length > 1 && tokenMatches === tokens.length) score += 25
      if (matched) score += KIND_SCORE.get(item.kind) || 0
      if (filePath.startsWith('mcp/') || filePath.includes('benchmark-repo-nav')) score -= 30
      if (matched && score > 0 && scored.length < MAX_MATCHES) scored.push({ item, score })
    }

    const structuralLines = new Set(this.items.map((item) => `${item.path}:${item.start}`))
    let contentMatches = 0
    sourceSearch:
    for (const file of this.files.values()) {
      throwIfAborted(signal)
      for (let index = 0; index < file.lines.length; index += 1) {
        const line = file.lines[index]
        const lineLower = line.toLowerCase()
        const tokenMatches = tokens.filter((token) => lineLower.includes(token)).length
        if (!lineLower.includes(lower) && tokenMatches < Math.min(2, tokens.length)) continue
        const lineNumber = index + 1
        if (structuralLines.has(`${file.path}:${lineNumber}`)) continue
        const item = {
          id: shortId('text', file.path, lineNumber, compactLine(line), this.revision),
          kind: 'text', path: file.path, start: lineNumber, end: lineNumber,
          label: compactLine(line, 100), detail: 'literal source match',
        }
        this.#rememberDynamicItem(item)
        const sourcePenalty = file.path.startsWith('mcp/') || file.path.includes('benchmark-repo-nav') ? 30 : 0
        scored.push({ item, score: 30 + tokenMatches * 12 + (lineLower.includes(lower) ? 25 : 0) - sourcePenalty })
        contentMatches += 1
        if (contentMatches >= MAX_MATCHES) break sourceSearch
      }
    }

    for (const task of this.projectMap?.tasks || []) {
      const haystack = [task.name, ...(task.aliases || [])].join(' ').toLowerCase()
      const tokenMatches = tokens.filter((token) => haystack.includes(token)).length
      if (!haystack.includes(lower) && tokenMatches < requiredMatches) continue
      const item = this.items.find((candidate) => candidate.path === task.path && candidate.label === task.symbol)
      if (item) scored.push({ item, score: 190 + tokenMatches * 20 + (haystack.includes(lower) ? 40 : 0) })
    }

    for (const feature of this.projectMap?.features || []) {
      const haystack = [feature.name, ...(feature.keywords || [])].join(' ').toLowerCase()
      const tokenMatches = tokens.filter((token) => haystack.includes(token)).length
      if (!haystack.includes(lower) && tokenMatches < requiredMatches) continue
      const item = {
        id: '', kind: 'feature',
        path: (feature.files || [])[0] || '', start: 1, end: 1, label: feature.name,
        detail: `files:${(feature.files || []).join(',')} tests:${(feature.tests || []).join(',')}`,
      }
      scored.push({ item, score: 55 + tokenMatches * 18 + (haystack.includes(lower) ? 20 : 0) })
    }

    const deduplicated = new Map()
    for (const entry of scored) {
      const key = entry.item.id || `${entry.item.kind}:${entry.item.label}:${entry.item.path}`
      const previous = deduplicated.get(key)
      if (!previous || previous.score < entry.score) deduplicated.set(key, entry)
    }
    const rows = [...deduplicated.values()]
      .sort((left, right) => right.score - left.score || left.item.path.localeCompare(right.item.path) || left.item.start - right.item.start)
      .map(({ item }) => rowFor(item))
    return boundedRows({
      revision: this.revision,
      rows,
      offset: cursor.offset || 0,
      limit: this.#limit(args),
      budget: this.#budget(args, 'find'),
      cursorBase: { op: 'find', q: query },
      hint: 'Read source IDs; for feature rows, outline one of the listed paths.',
      makeCursor: (payload) => this.#makeCursor(payload),
    })
  }

  #outline(args) {
    const cursor = this.#cursor(args, 'outline')
    const requestedPath = args.path || this.itemById.get(args.id)?.path || cursor.path
    const file = this.#assertPath(requestedPath)
    if (cursor.path && file.path !== cursor.path) throw new Error('Cursor path does not match outline path')
    const allowed = new Set(['action', 'class', 'function', 'heading', 'route', 'rpc', 'sql-function', 'sql-policy', 'sql-table', 'sql-trigger', 'symbol', 'table', 'test'])
    const rows = this.items
      .filter((item) => item.path === file.path && allowed.has(item.kind))
      .sort((left, right) => Number(right.exported) - Number(left.exported) || (left.depth || 0) - (right.depth || 0) || left.start - right.start)
      .map(rowFor)
    return boundedRows({
      revision: this.revision,
      rows,
      offset: cursor.offset || 0,
      limit: this.#limit(args),
      budget: this.#budget(args, 'outline'),
      cursorBase: { op: 'outline', path: file.path },
      hint: 'Read only the declaration IDs needed for the task.',
      makeCursor: (payload) => this.#makeCursor(payload),
    })
  }

  #read(args) {
    const cursor = this.#cursor(args, 'read')
    const requestedItem = args.id ? this.itemById.get(String(args.id)) : null
    if (args.id && !requestedItem) throw new Error('Unknown or stale ID; run find/outline again')
    const requestedPath = args.path || requestedItem?.path || cursor.path
    const file = this.#assertPath(requestedPath)
    if (cursor.path && file.path !== cursor.path) throw new Error('Cursor path does not match read path')
    if (cursor.id && args.id && cursor.id !== args.id) throw new Error('Cursor ID does not match read ID')

    let start
    let stop
    let column = 0
    const sourceId = requestedItem?.id || cursor.id || ''
    if (cursor.path) {
      start = clamp(cursor.line, 1, file.lines.length || 1, 1)
      stop = clamp(cursor.stop, start, file.lines.length || start, start)
      column = clamp(cursor.column, 0, (file.lines[start - 1] || '').length, 0)
    } else if (args.range) {
      const match = String(args.range).match(/^(\d+)(?::|-)(\d+)$/)
      if (!match) throw new Error('range must be start:end')
      start = clamp(match[1], 1, file.lines.length || 1, 1)
      stop = clamp(match[2], start, file.lines.length || start, start)
    } else {
      start = requestedItem?.start || 1
      stop = requestedItem?.end || Math.min(file.lines.length, 120)
    }

    const budget = this.#budget(args, 'read')
    const cursorPayload = (line, nextColumn = 0) => ({
      op: 'read', path: file.path, line, stop, column: nextColumn,
      ...(sourceId ? { id: sourceId } : {}), rev: this.revision,
    })
    const cursorFor = (line, nextColumn = 0) => this.#makeCursor(cursorPayload(line, nextColumn))

    const lineText = file.lines[start - 1] || ''
    if (column > 0 || JSON.stringify({
      rev: this.revision,
      chunks: [[sourceId, file.path, `L${start}-${start}`, `${start}|${lineText}`]],
      next: start < stop ? 'x'.repeat(CURSOR_TOKEN_LENGTH) : null,
      truncated: start < stop,
    }).length > budget) {
      const remaining = lineText.slice(column)
      let low = 0
      let high = remaining.length
      let best = null
      while (low <= high) {
        const length = Math.floor((low + high) / 2)
        const nextColumn = column + length
        const lineComplete = nextColumn >= lineText.length
        const nextPayload = lineComplete
          ? (start < stop ? cursorPayload(start + 1) : null)
          : cursorPayload(start, nextColumn)
        const candidate = {
          rev: this.revision,
          chunks: [[sourceId, file.path, `L${start}@${column}-${nextColumn}`, `${start}|${remaining.slice(0, length)}`]],
          next: nextPayload ? 'x'.repeat(CURSOR_TOKEN_LENGTH) : null,
          truncated: nextPayload !== null,
          partial: [start, column, nextColumn, lineText.length],
          nextPayload,
        }
        const measured = { ...candidate }
        delete measured.nextPayload
        if (JSON.stringify(measured).length <= budget) {
          best = candidate
          low = length + 1
        } else {
          high = length - 1
        }
      }
      if (!best || best.partial[2] <= best.partial[1]) throw new Error('max_chars is too small for a safe read response')
      best.next = best.nextPayload ? this.#makeCursor(best.nextPayload) : null
      delete best.nextPayload
      return best
    }

    const pageEnd = Math.min(stop, start + 199, file.lines.length)
    const selected = []
    let nextLine = null
    for (let lineNumber = start; lineNumber <= pageEnd; lineNumber += 1) {
      const candidate = [...selected, `${lineNumber}|${file.lines[lineNumber - 1]}`]
      const probe = {
        rev: this.revision,
        chunks: [[sourceId, file.path, `L${start}-${lineNumber}`, candidate.join('\n')]],
        next: lineNumber < stop ? 'x'.repeat(CURSOR_TOKEN_LENGTH) : null,
        truncated: true,
      }
      if (JSON.stringify(probe).length > budget) {
        nextLine = lineNumber
        break
      }
      selected.push(`${lineNumber}|${file.lines[lineNumber - 1]}`)
    }
    if (nextLine === null && pageEnd < stop) nextLine = pageEnd + 1
    const output = {
      rev: this.revision,
      chunks: [[sourceId, file.path, `L${start}-${start + selected.length - 1}`, selected.join('\n')]],
      next: nextLine ? cursorFor(nextLine) : null,
      truncated: nextLine !== null,
    }
    if (JSON.stringify(output).length > budget) throw new Error('Read response exceeded max_chars')
    return output
  }

  #refs(args, signal) {
    const cursor = this.#cursor(args, 'refs')
    const sourceItem = args.id ? this.itemById.get(String(args.id)) : null
    if (args.id && !sourceItem) throw new Error('Unknown or stale ID; run find/outline again')
    const query = String(args.q || sourceItem?.label || cursor.q || '').trim()
    if (!query) throw new Error('refs requires q or id')
    if (query.length < 2 || query.length > MAX_QUERY_CHARS) throw new Error(`refs query must contain 2-${MAX_QUERY_CHARS} characters`)
    queryTokens(query)
    if (args.q !== undefined && cursor.q !== undefined && String(args.q) !== String(cursor.q)) throw new Error('Cursor query does not match q')
    const rows = []
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const word = /^[A-Za-z_$][\w$]*$/.test(query) ? new RegExp(`\\b${escapedQuery}\\b`) : null

    referenceSearch:
    for (const file of this.files.values()) {
      throwIfAborted(signal)
      for (let index = 0; index < file.lines.length; index += 1) {
        const line = file.lines[index]
        if (!(word ? word.test(line) : line.includes(query))) continue
        const lineNumber = index + 1
        if (sourceItem && file.path === sourceItem.path && lineNumber === sourceItem.start) continue
        const item = {
          id: shortId('reference', file.path, lineNumber, query, this.revision), kind: 'reference',
          path: file.path, start: lineNumber, end: lineNumber,
          label: query, detail: compactLine(line),
        }
        this.#rememberDynamicItem(item)
        rows.push(rowFor(item))
        if (rows.length >= MAX_MATCHES) break referenceSearch
      }
    }

    return boundedRows({
      revision: this.revision,
      rows,
      offset: cursor.offset || 0,
      limit: this.#limit(args),
      budget: this.#budget(args, 'refs'),
      cursorBase: { op: 'refs', q: query },
      hint: 'Use read on a reference ID for bounded local context.',
      makeCursor: (payload) => this.#makeCursor(payload),
    })
  }

  async run(args = {}, options = {}) {
    await this.ensureIndex(options.signal)
    throwIfAborted(options.signal)
    const op = String(args.op || '')
    if (op === 'guide') return this.#guide(args)
    if (op === 'map') return this.#map(args)
    if (op === 'find') return this.#find(args, options.signal)
    if (op === 'outline') return this.#outline(args)
    if (op === 'read') return this.#read(args)
    if (op === 'refs') return this.#refs(args, options.signal)
    throw new Error('op must be guide, map, find, outline, read, or refs')
  }
}

export const navigationLimits = {
  defaultBudgets: { ...DEFAULT_BUDGETS },
  hardMaxChars: HARD_MAX_CHARS,
  maxLimit: MAX_LIMIT,
}
