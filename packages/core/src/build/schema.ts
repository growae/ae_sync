import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Table } from 'drizzle-orm'
import type { ViteNodeRunner } from 'vite-node/client'
import { isOnchainTable } from '../schema/onchain.js'

export async function compileSchema(
  runner: ViteNodeRunner,
  rootDir: string,
  customPath?: string,
): Promise<Record<string, Table>> {
  const schemaPath = customPath
    ? resolve(rootDir, customPath)
    : resolve(rootDir, 'schema.ts')
  if (!existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`)
  }

  const mod = (await runner.executeFile(schemaPath)) as Record<string, unknown>
  const tables: Record<string, Table> = {}

  for (const [key, value] of Object.entries(mod)) {
    if (isDrizzleTable(value)) {
      tables[key] = value as Table
    }
  }

  return tables
}

function isDrizzleTable(value: unknown): boolean {
  if (isOnchainTable(value)) return true
  if (typeof value !== 'object' || value === null) return false
  return Symbol.for('drizzle:Name') in value
}
