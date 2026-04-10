import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { DrizzleInstance } from '../database/types.js'
import { healthRoutes } from './health.js'
import { corsMiddleware } from './middleware.js'
import { sqlRoutes } from './sql.js'
import type { SyncStatusProvider } from './types.js'

function createTestApp(provider: SyncStatusProvider) {
  const app = new Hono()
  app.use('*', corsMiddleware())
  app.route('/', healthRoutes(provider))
  return app
}

describe('health routes', () => {
  const readyProvider: SyncStatusProvider = () => ({
    ready: true,
    contracts: [
      {
        name: 'DexPair',
        status: 'live',
        eventsProcessed: 5000,
        lastHeight: 100000,
      },
    ],
  })

  const notReadyProvider: SyncStatusProvider = () => ({
    ready: false,
    contracts: [
      {
        name: 'DexPair',
        status: 'backfilling',
        eventsProcessed: 100,
        lastHeight: 500,
      },
    ],
  })

  describe('GET /health', () => {
    it('returns 200 with ok status', async () => {
      const app = createTestApp(notReadyProvider)
      const res = await app.request('/health')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    })

    it('always returns 200 regardless of sync state', async () => {
      const app = createTestApp(readyProvider)
      const res = await app.request('/health')
      expect(res.status).toBe(200)
    })
  })

  describe('GET /ready', () => {
    it('returns 503 when not ready', async () => {
      const app = createTestApp(notReadyProvider)
      const res = await app.request('/ready')
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ status: 'not_ready' })
    })

    it('returns 200 when ready', async () => {
      const app = createTestApp(readyProvider)
      const res = await app.request('/ready')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ready' })
    })
  })

  describe('GET /status', () => {
    it('returns contract states and version', async () => {
      const app = createTestApp(readyProvider)
      const res = await app.request('/status')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({
        version: '0.0.1',
        ready: true,
        contracts: [
          {
            name: 'DexPair',
            status: 'live',
            eventsProcessed: 5000,
            lastHeight: 100000,
          },
        ],
      })
    })

    it('returns not-ready state with contract details', async () => {
      const app = createTestApp(notReadyProvider)
      const res = await app.request('/status')
      const body = await res.json()
      expect(body.ready).toBe(false)
      expect(body.contracts).toHaveLength(1)
      expect(body.contracts[0].status).toBe('backfilling')
    })
  })

  describe('CORS', () => {
    it('includes access-control-allow-origin header', async () => {
      const app = createTestApp(readyProvider)
      const res = await app.request('/health', {
        headers: { Origin: 'http://localhost:3000' },
      })
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })

    it('responds to preflight OPTIONS request', async () => {
      const app = createTestApp(readyProvider)
      const res = await app.request('/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      })
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })
  })
})

describe('sql routes', () => {
  function createSqlApp(mockExecute: (...args: unknown[]) => unknown) {
    const db = { execute: mockExecute } as unknown as DrizzleInstance
    const app = new Hono()
    app.route('/', sqlRoutes(db))
    return app
  }

  it('POST /sql with SELECT query returns rows', async () => {
    const rows = [{ id: 1, name: 'Alice' }]
    const app = createSqlApp(() => rows)

    const res = await app.request('/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT * FROM users' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows).toEqual(rows)
    expect(body.rowCount).toBe(1)
  })

  it('POST /sql with WITH (CTE) query is allowed', async () => {
    const rows = [{ total: 42 }]
    const app = createSqlApp(() => rows)

    const res = await app.request('/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: 'WITH cte AS (SELECT 1) SELECT * FROM cte',
      }),
    })

    expect(res.status).toBe(200)
  })

  it('POST /sql with INSERT query returns 403', async () => {
    const app = createSqlApp(() => [])

    const res = await app.request('/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: "INSERT INTO users (name) VALUES ('Bob')",
      }),
    })

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Only SELECT queries are allowed')
  })

  it('POST /sql with invalid SQL returns 400', async () => {
    const app = createSqlApp(() => {
      throw new Error('syntax error at position 7')
    })

    const res = await app.request('/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT *** FROM nowhere' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('syntax error at position 7')
  })
})
