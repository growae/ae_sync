import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { healthRoutes } from './health.js'
import { corsMiddleware } from './middleware.js'
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
