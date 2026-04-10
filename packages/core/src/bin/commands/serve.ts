import type { Command } from 'commander'
import type { Table } from 'drizzle-orm'
import { createBuild } from '../../build/index.js'
import { graphqlMiddleware } from '../../graphql/index.js'
import { createServer } from '../../server/index.js'
import type { SyncStatusProvider } from '../../server/types.js'

interface ServeOptions {
  port: string
  hostname: string
  config?: string
  schema?: string
}

export function registerServe(program: Command): void {
  program
    .command('serve')
    .description('Serve existing indexed data (API-only, no sync)')
    .option('-p, --port <port>', 'HTTP server port', '42069')
    .option('--hostname <host>', 'HTTP server hostname', 'localhost')
    .option('--config <path>', 'Path to config file')
    .option('--schema <path>', 'Path to schema file')
    .action(async (opts: ServeOptions) => {
      await runServe(opts)
    })
}

async function runServe(opts: ServeOptions): Promise<void> {
  const port = Number.parseInt(opts.port, 10)
  const { hostname } = opts
  const rootDir = process.cwd()

  console.log('\x1b[36m◆\x1b[0m ae-sync serve (API-only)')
  console.log('')

  const build = await createBuild({ rootDir, watch: false })

  let result: Awaited<
    ReturnType<Awaited<ReturnType<typeof createBuild>>['run']>
  >
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

  const { schema, database, api } = result
  await build.close()

  console.log('\x1b[32m✓\x1b[0m Config and schema loaded')

  const statusProvider: SyncStatusProvider = () => ({
    ready: true,
    contracts: [],
  })

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
  console.log(`\x1b[32m✓\x1b[0m Server listening on http://${hostname}:${port}`)
  console.log(`  GraphQL: http://${hostname}:${port}/graphql`)
  console.log('')
  console.log(
    '\x1b[33mℹ\x1b[0m Serving existing data only — no sync engine running',
  )

  const shutdown = async () => {
    console.log('\n\x1b[33m⏹\x1b[0m Shutting down...')
    await server.stop()
    await database.close()
    console.log('\x1b[32m✓\x1b[0m Stopped')
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}
