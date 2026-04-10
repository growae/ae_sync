import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { healthRoutes } from './health.js'
import { corsMiddleware, requestLogger } from './middleware.js'
import type { ServerConfig, SyncStatusProvider } from './types.js'

export { healthRoutes } from './health.js'
export { corsMiddleware, requestLogger } from './middleware.js'
export type {
  ContractSyncStatus,
  ServerConfig,
  SyncStatusProvider,
} from './types.js'

const defaultStatusProvider: SyncStatusProvider = () => ({
  ready: false,
  contracts: [],
})

export function createServer(
  config: ServerConfig,
  statusProvider: SyncStatusProvider = defaultStatusProvider,
) {
  const app = new Hono()

  app.use('*', corsMiddleware())
  app.use('*', requestLogger())
  app.route('/', healthRoutes(statusProvider))

  let httpServer: ReturnType<typeof serve> | null = null

  return {
    app,
    async start(): Promise<void> {
      await new Promise<void>((resolve) => {
        httpServer = serve(
          {
            fetch: (req: Request) => app.fetch(req),
            port: config.port,
            hostname: config.hostname,
          },
          () => resolve(),
        )
      })
    },
    async stop(): Promise<void> {
      const s = httpServer
      httpServer = null
      if (s) {
        await new Promise<void>((resolve, reject) => {
          s.close((err?: Error) => {
            if (err) reject(err)
            else resolve()
          })
        })
      }
    },
  }
}
