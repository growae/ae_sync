import { Hono } from 'hono'
import { VERSION } from '../exports/index.js'
import type { SyncStatusProvider } from './types.js'

export function healthRoutes(statusProvider: SyncStatusProvider): Hono {
  const app = new Hono()

  app.get('/health', (c) => {
    return c.json({ status: 'ok' })
  })

  app.get('/ready', (c) => {
    const { ready } = statusProvider()
    if (ready) {
      return c.json({ status: 'ready' }, 200)
    }
    return c.json({ status: 'not_ready' }, 503)
  })

  app.get('/status', (c) => {
    const { ready, contracts } = statusProvider()
    return c.json({ version: VERSION, ready, contracts })
  })

  return app
}
