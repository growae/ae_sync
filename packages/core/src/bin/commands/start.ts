import type { Command } from 'commander'
import type { Table } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import { createBuild } from '../../build/index.js'
import type { BuildResult } from '../../build/index.js'
import { createShadowTables } from '../../database/shadow.js'
import { graphqlMiddleware } from '../../graphql/index.js'
import { createServer } from '../../server/index.js'
import type { SyncStatusProvider } from '../../server/types.js'
import { createSync } from '../../sync/index.js'
import type { SyncEngine } from '../../sync/index.js'

interface StartOptions {
  port: string
  hostname: string
  config?: string
  schema?: string
}

export function registerStart(program: Command): void {
  program
    .command('start')
    .description('Start ae-sync in production mode')
    .option('-p, --port <port>', 'HTTP server port', '42069')
    .option('--hostname <host>', 'HTTP server hostname', '0.0.0.0')
    .option('--config <path>', 'Path to config file')
    .option('--schema <path>', 'Path to schema file')
    .action(async (opts: StartOptions) => {
      await runStart(opts)
    })
}

function jsonLog(
  level: string,
  msg: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...data,
  }
  console.log(JSON.stringify(entry))
}

async function runStart(opts: StartOptions): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error(
      'ERROR: DATABASE_URL environment variable is required in production mode',
    )
    process.exit(1)
  }

  const port = Number.parseInt(opts.port, 10)
  const { hostname } = opts
  const rootDir = process.cwd()

  jsonLog('info', 'Starting ae-sync in production mode')

  const build = await createBuild({ rootDir, watch: false })

  let result: BuildResult
  try {
    result = await build.run()
  } catch (err) {
    jsonLog('error', 'Build failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    await build.close()
    process.exit(1)
  }

  const { config, contracts, schema, database, indexing, api, mdw } = result
  await build.close()

  jsonLog('info', 'Config loaded', {
    network: config.network.name,
    database: config.database.kind,
    contracts: Object.keys(config.contracts),
  })

  try {
    await createShadowTables(database, schema as Record<string, PgTable>)
  } catch (err) {
    jsonLog('warn', 'Shadow table setup failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const eventCallbackMap = new Map(indexing.map((cb) => [cb.name, cb]))

  const sync: SyncEngine = createSync({
    database,
    mdwHttp: mdw.http,
    mdwWs: mdw.ws,
    contracts,
    eventCallbacks: eventCallbackMap,
  })

  const statusProvider: SyncStatusProvider = () => {
    const status = sync.getStatus()
    const allRealtime = status.contracts.every(
      (c) => c.status === 'realtime' || c.status === 'stopped',
    )
    return {
      ready: allRealtime,
      contracts: status.contracts.map((c) => ({
        name: c.contractName,
        status: c.status,
        eventsProcessed: c.eventsProcessed,
        lastHeight: c.lastHeight,
      })),
    }
  }

  const server = createServer({ port, hostname }, statusProvider)

  const gqlApp = graphqlMiddleware(schema as Record<string, Table>, database.qb)
  server.app.route('/graphql', gqlApp)

  if (api) {
    for (const mw of api.middleware) {
      server.app.use('*', mw as Parameters<typeof server.app.use>[1])
    }
    for (const route of api.routes) {
      const method = route.method.toLowerCase()
      const app = server.app as unknown as Record<
        string,
        (path: string, handler: unknown) => void
      >
      if (typeof app[method] === 'function') {
        app[method](route.path, route.handler)
      }
    }
  }

  await server.start()
  jsonLog('info', 'Server started', { port, hostname })

  sync.on('error', (err) => {
    jsonLog('error', 'Sync error', { error: err.message })
  })

  sync.on('backfillComplete', (name) => {
    jsonLog('info', 'Backfill complete', { contract: name })
  })

  sync.on('realtimeStarted', () => {
    jsonLog('info', 'Realtime sync active')
  })

  await sync.start()
  jsonLog('info', 'Sync engine started')

  const shutdown = async () => {
    jsonLog('info', 'Shutting down')
    sync.stop()
    await server.stop()
    await database.close()
    jsonLog('info', 'Stopped')
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}
