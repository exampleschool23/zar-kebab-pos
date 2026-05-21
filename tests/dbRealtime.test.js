import test from 'node:test'
import assert from 'node:assert/strict'

import { subscribeToRealtime } from '../src/lib/db.js'

function makeRealtimeClient() {
  const handlers = new Map()
  let statusCallback = () => {}
  const channel = {
    on(_event, filter, callback) {
      handlers.set(filter.table, callback)
      return channel
    },
    subscribe(callback) {
      statusCallback = callback || (() => {})
      return channel
    },
  }

  return {
    handlers,
    emitStatus(status) {
      statusCallback(status)
    },
    removed: false,
    from() {
      const query = {
        order() {
          return query
        },
        then(resolve) {
          return Promise.resolve({ data: [] }).then(resolve)
        },
      }
      return {
        select() {
          return query
        },
      }
    },
    channel() {
      return channel
    },
    removeChannel(value) {
      assert.equal(value, channel)
      this.removed = true
    },
  }
}

test('business settings realtime updates active sessions', async () => {
  const dbClient = makeRealtimeClient()
  const actions = []
  const unsubscribe = subscribeToRealtime(
    action => actions.push(action),
    {
      dbClient,
      debounceMs: 0,
      settingsLoader: async () => ({
        restaurantName: 'Zar Kebab',
        serviceRate: 15,
        receiptFooter: 'Rahmat',
        autoPrint: true,
      }),
    }
  )

  assert.equal(typeof dbClient.handlers.get('business_settings'), 'function')

  dbClient.handlers.get('business_settings')()
  await new Promise(resolve => setTimeout(resolve, 5))

  assert.deepEqual(actions, [
    {
      type: 'SET_SETTINGS',
      payload: {
        restaurantName: 'Zar Kebab',
        serviceRate: 15,
        receiptFooter: 'Rahmat',
        autoPrint: true,
      },
    },
  ])

  unsubscribe()
  assert.equal(dbClient.removed, true)
})

test('remote table updates show conflict feedback and refresh tables', async () => {
  const dbClient = makeRealtimeClient()
  const actions = []
  const unsubscribe = subscribeToRealtime(action => actions.push(action), {
    dbClient,
    debounceMs: 0,
    settingsLoader: async () => null,
  })

  await dbClient.handlers.get('restaurant_tables')({ eventType: 'UPDATE' })

  assert.deepEqual(actions[0], {
    type: 'SET_CONNECTION_NOTICE',
    payload: {
      tone: 'info',
      message: 'Changed by another device. Refreshed the latest data.',
    },
  })
  assert.deepEqual(actions[1], { type: 'SET_TABLES', payload: [] })

  unsubscribe()
})

test('realtime channel errors surface a connection notice', () => {
  const dbClient = makeRealtimeClient()
  const actions = []
  const warn = console.warn
  console.warn = () => {}
  const unsubscribe = subscribeToRealtime(action => actions.push(action), {
    dbClient,
    debounceMs: 0,
    settingsLoader: async () => null,
  })

  try {
    dbClient.emitStatus('CHANNEL_ERROR')

    assert.deepEqual(actions, [
      {
        type: 'SET_CONNECTION_NOTICE',
        payload: {
          tone: 'error',
          message: 'Realtime connection is unstable. Data may be delayed.',
        },
      },
    ])
  } finally {
    console.warn = warn
  }

  unsubscribe()
})
