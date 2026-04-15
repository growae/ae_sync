import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Table } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import { createServer as createViteServer } from 'vite'
import { ViteNodeRunner } from 'vite-node/client'
import { ViteNodeServer } from 'vite-node/server'
import type { AeSyncConfig } from '../config/types.js'
import { createDatabase } from '../database/index.js'
import {
  applyInternalMigrations,
  applyMigrations,
} from '../database/migrate.js'
import type { Database } from '../database/types.js'
import { type MdwClient, createMdwClient } from '../mdw/index.js'
import type { CompiledContract, EventCallback } from '../sync/types.js'
import { compileApi } from './api.js'
import type { CompiledApi } from './api.js'
import { generateEnvDts } from './codegen.js'
import { compileConfig } from './config.js'
import { compileContracts } from './contracts.js'
import { compileIndexing } from './indexing.js'
import { vitePluginAeSync } from './plugin.js'
import { compileSchema } from './schema.js'

export interface BuildResult {
  config: AeSyncConfig
  contracts: Map<string, CompiledContract>
  schema: Record<string, Table>
  database: Database
  indexing: EventCallback[]
  api: CompiledApi | null
  mdw: MdwClient
}

export interface Build {
  run(): Promise<BuildResult>
  close(): Promise<void>
}

export interface BuildOptions {
  rootDir: string
  watch?: boolean
  configPath?: string
  schemaPath?: string
}

export async function createBuild(options: BuildOptions): Promise<Build> {
  const { rootDir, watch = false, configPath, schemaPath } = options

  const coreDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const server = await createViteServer({
    root: rootDir,
    plugins: [vitePluginAeSync({ rootDir, coreDir })],
    server: { hmr: watch },
    logLevel: 'silent',
  })

  await server.pluginContainer.buildStart({})

  const node = new ViteNodeServer(server)
  const runner = new ViteNodeRunner({
    root: server.config.root,
    base: server.config.base,
    fetchModule(id) {
      return node.fetchModule(id)
    },
    resolveId(id, importer) {
      return node.resolveId(id, importer)
    },
  })

  return {
    async run(): Promise<BuildResult> {
      const config = await compileConfig(runner, rootDir, configPath)
      const contracts = await compileContracts(config)
      const schema = await compileSchema(runner, rootDir, schemaPath)

      const database = await createDatabase(config.database)
      await applyInternalMigrations(database.qb)
      await applyMigrations(database.qb, schema as Record<string, PgTable>)

      const indexing = await compileIndexing(runner, rootDir, contracts)
      ;(globalThis as Record<string, unknown>).__AESYNC_DB__ = database.qb
      const api = await compileApi(runner, rootDir)

      await generateEnvDts(rootDir, contracts)

      const mdw = createMdwClient({
        httpUrl: config.network.mdwUrl,
        wsUrl: config.network.mdwWsUrl,
      })

      return { config, contracts, schema, database, indexing, api, mdw }
    },

    async close(): Promise<void> {
      await server.close()
    },
  }
}

export {
  compileApi,
  compileConfig,
  compileContracts,
  compileIndexing,
  compileSchema,
  generateEnvDts,
  vitePluginAeSync,
}
export { generateEnvDtsContent } from './codegen.js'
export type { CompiledApi } from './api.js'
