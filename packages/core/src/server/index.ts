import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { DrizzleInstance } from '../database/types.js'
import { healthRoutes } from './health.js'
import { corsMiddleware, requestLogger } from './middleware.js'
import { sqlRoutes } from './sql.js'
import type { ServerConfig, SyncStatusProvider } from './types.js'

export { healthRoutes } from './health.js'
export { corsMiddleware, requestLogger } from './middleware.js'
export { sqlRoutes } from './sql.js'
export type {
  ContractSyncStatus,
  ServerConfig,
  SyncStatusProvider,
} from './types.js'

export interface CreateServerOptions {
  config: ServerConfig
  statusProvider?: SyncStatusProvider
  db?: DrizzleInstance
}

const defaultStatusProvider: SyncStatusProvider = () => ({
  ready: false,
  contracts: [],
})

export function createServer(
  configOrOptions: ServerConfig | CreateServerOptions,
  statusProvider?: SyncStatusProvider,
) {
  let config: ServerConfig
  let provider: SyncStatusProvider
  let db: DrizzleInstance | undefined

  if ('config' in configOrOptions) {
    config = configOrOptions.config
    provider = configOrOptions.statusProvider ?? defaultStatusProvider
    db = configOrOptions.db
  } else {
    config = configOrOptions
    provider = statusProvider ?? defaultStatusProvider
  }

  const app = new Hono()

  app.use('*', corsMiddleware())
  app.use('*', requestLogger())
  app.route('/', healthRoutes(provider))

  if (db) {
    app.route('/', sqlRoutes(db))
  }

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
