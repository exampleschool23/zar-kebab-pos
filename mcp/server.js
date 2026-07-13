#!/usr/bin/env node
import { once } from 'node:events'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { navigationLimits, RepoNavigator } from './repo-navigator.js'
import { serverInstructions, toolDefinition } from './tool-definition.js'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const navigator = new RepoNavigator(path.resolve(serverDirectory, '..'))
const PROTOCOL_VERSION = '2025-06-18'
const SUPPORTED_PROTOCOLS = new Set(['2024-11-05', '2025-03-26', PROTOCOL_VERSION])
const MAX_REQUEST_BYTES = 65_536
const MAX_BUFFER_BYTES = MAX_REQUEST_BYTES * 32
const MAX_PENDING = 32
const MAX_OUTPUT_QUEUE = 64
const MAX_TOOL_CALLS_PER_MINUTE = 240
const MAX_PROTOCOL_ERRORS_PER_MINUTE = 60
const MAX_CANCELLED_IDS = 256
const MAX_ID_CHARS = 128
const MAX_METHOD_CHARS = 128
const STRING_LIMITS = { q: 512, path: 4_096, id: 128, range: 32, cursor: 8_192 }
const ARGUMENT_KEYS = new Set(['op', 'q', 'path', 'id', 'range', 'cursor', 'limit', 'max_chars'])
const OPS = new Set(['guide', 'map', 'find', 'outline', 'read', 'refs'])

let lifecycle = 'new'
let inputBuffer = ''
let processing = false
const pending = []
const controllers = new Map()
const cancelledIds = new Set()
const recentToolCalls = []
const recentProtocolErrors = []
const outputQueue = []
let outputWriting = false

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cleanMessage(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || 'Internal error'
}

async function flushOutput() {
  if (outputWriting) return
  outputWriting = true
  try {
    while (outputQueue.length > 0) {
      const item = outputQueue.shift()
      try {
        if (!process.stdout.write(item.line)) {
          process.stdin.pause()
          await once(process.stdout, 'drain')
        }
        item.resolve(true)
      } catch (caught) {
        item.reject(caught)
      }
      if (outputQueue.length < MAX_OUTPUT_QUEUE / 2 && !process.stdin.destroyed) process.stdin.resume()
    }
  } finally {
    outputWriting = false
  }
}

function send(payload, options = {}) {
  const line = `${JSON.stringify(payload)}\n`
  return new Promise((resolve, reject) => {
    if (outputQueue.length >= MAX_OUTPUT_QUEUE) {
      if (options.bestEffort) {
        resolve(false)
        return
      }
      const disposableIndex = outputQueue.findIndex((item) => item.bestEffort)
      if (disposableIndex === -1) {
        reject(new Error('Output queue limit exceeded'))
        return
      }
      const [discarded] = outputQueue.splice(disposableIndex, 1)
      discarded.resolve(false)
    }
    outputQueue.push({ line, resolve, reject, bestEffort: options.bestEffort === true })
    if (outputQueue.length >= MAX_OUTPUT_QUEUE / 2) process.stdin.pause()
    void flushOutput()
  })
}

async function result(id, value) {
  await send({ jsonrpc: '2.0', id, result: value })
}

async function error(id, code, message, options) {
  await send({ jsonrpc: '2.0', id, error: { code, message: cleanMessage(message) } }, options)
}

function validId(message) {
  if (!isRecord(message)) return false
  if (!Object.hasOwn(message, 'id')) return true
  return (typeof message.id === 'string' && message.id.length <= MAX_ID_CHARS)
    || (typeof message.id === 'number' && Number.isSafeInteger(message.id))
}

function emitProtocolError(id, code, message) {
  const cutoff = Date.now() - 60_000
  while (recentProtocolErrors[0] < cutoff) recentProtocolErrors.shift()
  if (recentProtocolErrors.length >= MAX_PROTOCOL_ERRORS_PER_MINUTE) return
  recentProtocolErrors.push(Date.now())
  void error(id, code, message, { bestEffort: true }).catch(() => {})
}

function rememberCancellation(requestId) {
  const valid = (typeof requestId === 'string' && requestId.length <= MAX_ID_CHARS)
    || (typeof requestId === 'number' && Number.isSafeInteger(requestId))
  if (!valid) return
  const controller = controllers.get(requestId)
  if (controller) {
    controller.abort()
    return
  }
  if (!pending.some((message) => isRecord(message) && message.id === requestId)) return
  cancelledIds.add(requestId)
  while (cancelledIds.size > MAX_CANCELLED_IDS) cancelledIds.delete(cancelledIds.values().next().value)
}

function validateArguments(value) {
  if (!isRecord(value)) throw new Error('arguments must be an object')
  for (const key of Object.keys(value)) {
    if (!ARGUMENT_KEYS.has(key)) throw new Error(`Unsupported argument: ${key}`)
  }
  if (typeof value.op !== 'string' || !OPS.has(value.op)) throw new Error('op must be guide, map, find, outline, read, or refs')
  for (const [key, maximum] of Object.entries(STRING_LIMITS)) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== 'string') throw new Error(`${key} must be a string`)
    if (value[key].length > maximum) throw new Error(`${key} exceeds ${maximum} characters`)
  }
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 50)) throw new Error('limit must be an integer from 1 to 50')
  if (value.max_chars !== undefined && (!Number.isInteger(value.max_chars) || value.max_chars < 500 || value.max_chars > 16_000)) throw new Error('max_chars must be an integer from 500 to 16000')
  if (!value.cursor) {
    if (value.op === 'find' && !value.q) throw new Error('find requires q')
    if (value.op === 'outline' && !value.path && !value.id) throw new Error('outline requires path or id')
    if (value.op === 'read' && !value.path && !value.id) throw new Error('read requires path or id')
    if (value.op === 'refs' && !value.q && !value.id) throw new Error('refs requires q or id')
  }
  return value
}

function rateLimitAvailable() {
  const cutoff = Date.now() - 60_000
  while (recentToolCalls[0] < cutoff) recentToolCalls.shift()
  if (recentToolCalls.length >= MAX_TOOL_CALLS_PER_MINUTE) return false
  recentToolCalls.push(Date.now())
  return true
}

async function handle(message) {
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string' || message.method.length === 0 || message.method.length > MAX_METHOD_CHARS || !validId(message)) {
    const responseId = validId(message) && Object.hasOwn(message, 'id') ? message.id : null
    await error(responseId, -32600, 'Invalid Request')
    return
  }

  const isNotification = !Object.hasOwn(message, 'id')
  if (isNotification) {
    if (message.method === 'notifications/initialized' && lifecycle === 'initializing') lifecycle = 'ready'
    return
  }

  if (cancelledIds.delete(message.id)) {
    await error(message.id, -32800, 'Request cancelled')
    return
  }

  if (message.method === 'initialize') {
    if (lifecycle !== 'new') {
      await error(message.id, -32600, 'Server is already initialized')
      return
    }
    if (!isRecord(message.params) || typeof message.params.protocolVersion !== 'string' || !isRecord(message.params.clientInfo)) {
      await error(message.id, -32602, 'Invalid initialize params')
      return
    }
    const requested = message.params.protocolVersion
    lifecycle = 'initializing'
    await result(message.id, {
      protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'zarkebab-repo-nav', version: '1.0.0' },
      instructions: serverInstructions,
    })
    return
  }

  if (lifecycle !== 'ready') {
    await error(message.id, -32002, 'Server initialization is not complete')
    return
  }

  if (message.method === 'ping') {
    await result(message.id, {})
    return
  }

  if (message.method === 'tools/list') {
    if (message.params !== undefined && !isRecord(message.params)) {
      await error(message.id, -32602, 'Invalid tools/list params')
      return
    }
    await result(message.id, { tools: [toolDefinition] })
    return
  }

  if (message.method === 'tools/call') {
    if (!isRecord(message.params) || message.params.name !== toolDefinition.name) {
      await error(message.id, -32602, 'Unknown tool or invalid params')
      return
    }
    let argumentsValue
    try {
      argumentsValue = validateArguments(message.params.arguments || {})
    } catch (caught) {
      await error(message.id, -32602, caught instanceof Error ? caught.message : 'Invalid tool arguments')
      return
    }
    if (!rateLimitAvailable()) {
      await result(message.id, { content: [{ type: 'text', text: 'Tool rate limit exceeded; retry shortly.' }], isError: true })
      return
    }

    const controller = new AbortController()
    controllers.set(message.id, controller)
    try {
      const output = await navigator.run(argumentsValue, { signal: controller.signal })
      const text = JSON.stringify(output)
      if (text.length > navigationLimits.hardMaxChars) throw new Error('Response exceeded the hard output limit')
      await result(message.id, { content: [{ type: 'text', text }], isError: false })
    } catch (caught) {
      await result(message.id, {
        content: [{ type: 'text', text: cleanMessage(caught instanceof Error ? caught.message : caught) }],
        isError: true,
      })
    } finally {
      controllers.delete(message.id)
    }
    return
  }

  await error(message.id, -32601, 'Method not found')
}

async function processPending() {
  if (processing) return
  processing = true
  try {
    while (pending.length > 0) {
      const message = pending.shift()
      try {
        await handle(message)
      } catch (caught) {
        await error(validId(message) ? message?.id ?? null : null, -32603, caught instanceof Error ? caught.message : 'Internal error')
      }
    }
  } finally {
    processing = false
  }
}

function acceptLine(line) {
  if (!line.trim()) return
  if (Buffer.byteLength(line, 'utf8') > MAX_REQUEST_BYTES) {
    emitProtocolError(null, -32700, `Request exceeds ${MAX_REQUEST_BYTES} bytes`)
    return
  }
  let message
  try {
    message = JSON.parse(line)
  } catch {
    emitProtocolError(null, -32700, 'Parse error')
    return
  }

  if (isRecord(message) && message.method === 'notifications/cancelled') {
    rememberCancellation(message.params?.requestId)
    return
  }
  if (pending.length >= MAX_PENDING) {
    emitProtocolError(validId(message) ? message?.id ?? null : null, -32000, 'Too many pending requests')
    return
  }
  pending.push(message)
  void processPending()
}

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  inputBuffer += chunk
  if (Buffer.byteLength(inputBuffer, 'utf8') > MAX_BUFFER_BYTES) {
    inputBuffer = ''
    emitProtocolError(null, -32700, 'Input buffer limit exceeded')
    return
  }
  let newline = inputBuffer.indexOf('\n')
  while (newline !== -1) {
    const line = inputBuffer.slice(0, newline)
    inputBuffer = inputBuffer.slice(newline + 1)
    acceptLine(line)
    newline = inputBuffer.indexOf('\n')
  }
  if (Buffer.byteLength(inputBuffer, 'utf8') > MAX_REQUEST_BYTES) {
    inputBuffer = ''
    emitProtocolError(null, -32700, `Request exceeds ${MAX_REQUEST_BYTES} bytes`)
  }
})
