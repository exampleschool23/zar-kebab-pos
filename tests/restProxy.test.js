import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROXIED_SUPABASE_ORIGIN, REST_PROXY_PATH, proxiedRestUrl } from '../src/lib/restProxy.js'

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

test('REST requests to the production project go through the same-origin proxy', () => {
  const url = `${PROXIED_SUPABASE_ORIGIN}/rest/v1/orders?select=*%2Citems%3Aorder_items%28*%29&id=eq.1`
  assert.equal(proxiedRestUrl(url, PROXIED_SUPABASE_ORIGIN), '/sb/rest/v1/orders?select=*%2Citems%3Aorder_items%28*%29&id=eq.1')
  assert.equal(proxiedRestUrl(`${PROXIED_SUPABASE_ORIGIN}/rest/v1/rpc/settle_orders_payment`, `${PROXIED_SUPABASE_ORIGIN}/`),
    '/sb/rest/v1/rpc/settle_orders_payment')
})

test('auth, storage, realtime and other projects stay direct', () => {
  for (const path of ['/auth/v1/token?grant_type=refresh_token', '/storage/v1/object/menu/a.webp', '/realtime/v1/api/broadcast']) {
    const url = PROXIED_SUPABASE_ORIGIN + path
    assert.equal(proxiedRestUrl(url, PROXIED_SUPABASE_ORIGIN), url)
  }
  const other = 'https://example.supabase.co/rest/v1/orders'
  assert.equal(proxiedRestUrl(other, 'https://example.supabase.co'), other)
  const request = { url: `${PROXIED_SUPABASE_ORIGIN}/rest/v1/orders` }
  assert.equal(proxiedRestUrl(request, PROXIED_SUPABASE_ORIGIN), request)
})

test('Vercel forwards the proxy path to the same project before the SPA fallback', () => {
  const { rewrites } = JSON.parse(read('vercel.json'))
  assert.deepEqual(rewrites[0], {
    source: `${REST_PROXY_PATH}:path*`,
    destination: `${PROXIED_SUPABASE_ORIGIN}/rest/v1/:path*`,
  })
  assert.equal(new RegExp(`^${rewrites.at(-1).source}$`).test('/sb/rest/v1/orders'), false)
})

test('the browser client and dev server use the proxy', () => {
  assert.match(read('src/lib/supabase.js'), /fetch\(isBrowser \? proxiedRestUrl\(input, supabaseUrl\) : input,/)
  assert.match(read('vite.config.js'), /'\/sb\/rest\/v1': \{ target: supabaseUrl, changeOrigin: true, rewrite: path => path\.replace\(\/\^\\\/sb\/, ''\) \}/)
})
