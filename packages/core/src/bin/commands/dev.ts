import type { Command } from 'commander'
import type { Table } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import { createBuild } from '../../build/index.js'
import type { BuildResult } from '../../build/index.js'
import { createShadowTables } from '../../database/shadow.js'
import { graphqlMiddleware } from '../../graphql/index.js'
import { createIndexingCache } from '../../indexing/cache.js'
import { processEventBatch } from '../../indexing/executor.js'
import { createServer } from '../../server/index.js'
import type { SyncStatusProvider } from '../../server/types.js'
import { createSync } from '../../sync/index.js'
import type { SyncEngine } from '../../sync/index.js'
import type { MatchedEvent } from '../../sync/types.js'

interface DevOptions {
  port: string
  hostname: string
  config?: string
  schema?: string
  mdwUrl?: string
  verbose?: boolean
}

export function registerDev(program: Command): void {
  program
    .command('dev')
    .description('Start ae-sync in development mode with hot reload')
    .option('-p, --port <port>', 'HTTP server port', '42069')
    .option('--hostname <host>', 'HTTP server hostname', 'localhost')
    .option('--config <path>', 'Path to config file')
    .option('--schema <path>', 'Path to schema file')
    .option('--mdw-url <url>', 'Override middleware URL')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (opts: DevOptions) => {
      await runDev(opts)
    })
}

async function runDev(opts: DevOptions): Promise<void> {
  const port = Number.parseInt(opts.port, 10)
  const { hostname } = opts

  console.log('\x1b[36m◆\x1b[0m ae-sync dev')
  console.log('')

  const rootDir = process.cwd()

  const build = await createBuild({
    rootDir,
    watch: true,
    configPath: opts.config,
    schemaPath: opts.schema,
  })

  let result: BuildResult
  try {
    result = await build.run()
  } catch (err) {
    console.error(
      '\x1b[31m✗\x1b[0m Build failed:',
      err instanceof Error ? err.message : err,
    )
    await build.close()
    process.exit(1)
  }

  const { config, contracts, schema, database, indexing, api, mdw } = result

  if (opts.mdwUrl) {
    config.network.mdwUrl = opts.mdwUrl
  }

  console.log('\x1b[32m✓\x1b[0m Config loaded')
  console.log(`  Network: ${config.network.name}`)
  console.log(`  Database: ${config.database.kind}`)
  console.log(`  Contracts: ${Object.keys(config.contracts).join(', ')}`)

  try {
    await createShadowTables(database, schema as Record<string, PgTable>)
    console.log('\x1b[32m✓\x1b[0m Shadow tables ready')
  } catch (err) {
    console.error(
      '\x1b[33m⚠\x1b[0m Shadow table setup failed:',
      err instanceof Error ? err.message : err,
    )
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
  ;(globalThis as Record<string, unknown>).__AESYNC_DB__ = database.qb
  ;(globalThis as Record<string, unknown>).__AESYNC_CLIENT__ = null

  const server = createServer({
    config: { port, hostname },
    statusProvider,
    db: database.qb,
  })

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
  console.log(`\x1b[32m✓\x1b[0m Server listening on http://${hostname}:${port}`)
  console.log(`  GraphQL: http://${hostname}:${port}/graphql`)

  const cache = createIndexingCache()
  let eventBuffer: MatchedEvent[] = []
  const BATCH_SIZE = 100

  async function flushEventBuffer() {
    if (eventBuffer.length === 0) return
    const batch = eventBuffer
    eventBuffer = []
    try {
      const result = await processEventBatch({
        events: batch,
        database,
        tables: schema as Record<string, PgTable>,
        networkName: config.network.name ?? 'mainnet',
        cache,
        checkpointHeight: batch[batch.length - 1]!.event.height,
        checkpointBlockHash: batch[batch.length - 1]!.event.blockHash,
      })
      console.log(
        `\x1b[32m✓\x1b[0m Batch processed: ${result.eventsProcessed} events (${result.duration.toFixed(0)}ms)`,
      )
    } catch (err) {
      console.error(
        '\x1b[31m✗\x1b[0m Batch processing error:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  sync.on('event', async (matched) => {
    eventBuffer.push(matched)
    if (eventBuffer.length >= BATCH_SIZE) {
      await flushEventBuffer()
    }
  })

  if (opts.verbose) {
    sync.onProgress((p) => {
      console.log(
        `\x1b[34m↻\x1b[0m Sync: ${p.totalEvents} events (${p.eventsPerSecond.toFixed(1)}/s)`,
      )
    })
  }

  sync.on('error', (err) => {
    console.error('\x1b[31m✗\x1b[0m Sync error:', err.message)
  })

  sync.on('backfillComplete', async (name) => {
    await flushEventBuffer()
    console.log(`\x1b[32m✓\x1b[0m Backfill complete: ${name}`)
  })

  sync.on('realtimeStarted', () => {
    console.log('\x1b[32m✓\x1b[0m Realtime sync active')
  })

  await sync.start()
  console.log('\x1b[32m✓\x1b[0m Sync engine started')

  const shutdown = async () => {
    console.log('\n\x1b[33m⏹\x1b[0m Shutting down...')
    sync.stop()
    await server.stop()
    await database.close()
    await build.close()
    console.log('\x1b[32m✓\x1b[0m Stopped')
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}
