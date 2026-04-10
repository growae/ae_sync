import type { Command } from 'commander'
import { sql } from 'drizzle-orm'
import { createBuild } from '../../build/index.js'
import type { Database } from '../../database/types.js'

export function registerDb(program: Command): void {
  const db = program.command('db').description('Database management commands')

  db.command('list')
    .description('Show internal ae-sync table states')
    .action(async () => {
      await runDbList()
    })

  db.command('reset')
    .description('Drop all ae-sync tables and re-create')
    .option('--confirm', 'Confirm destructive operation')
    .action(async (opts: { confirm?: boolean }) => {
      await runDbReset(opts)
    })
}

async function withDatabase(
  fn: (database: Database) => Promise<void>,
): Promise<void> {
  const rootDir = process.cwd()
  const build = await createBuild({ rootDir, watch: false })

  try {
    const result = await build.run()
    await fn(result.database)
    await result.database.close()
  } finally {
    await build.close()
  }
}

async function runDbList(): Promise<void> {
  console.log('\x1b[36m◆\x1b[0m ae-sync db list')
  console.log('')

  await withDatabase(async (database) => {
    try {
      const meta = await database.qb.execute<{
        key: string
        value: string
      }>(sql.raw('SELECT * FROM _aesync_meta ORDER BY key'))
      if (meta.rows.length > 0) {
        console.log('\x1b[1mMeta:\x1b[0m')
        for (const row of meta.rows) {
          console.log(`  ${row.key}: ${row.value}`)
        }
      } else {
        console.log('\x1b[33mℹ\x1b[0m No meta entries found')
      }
    } catch {
      console.log('\x1b[33mℹ\x1b[0m _aesync_meta table does not exist')
    }

    console.log('')

    try {
      const states = await database.qb.execute<{
        contract_id: string
        contract_name: string
        status: string
        last_height: number
        events_processed: number
      }>(sql.raw('SELECT * FROM _aesync_contract_state ORDER BY contract_name'))
      if (states.rows.length > 0) {
        console.log('\x1b[1mContract States:\x1b[0m')
        for (const row of states.rows) {
          console.log(`  ${row.contract_name} (${row.contract_id})`)
          console.log(`    Status: ${row.status}`)
          console.log(`    Height: ${row.last_height}`)
          console.log(`    Events: ${row.events_processed}`)
        }
      } else {
        console.log('\x1b[33mℹ\x1b[0m No contract states found')
      }
    } catch {
      console.log(
        '\x1b[33mℹ\x1b[0m _aesync_contract_state table does not exist',
      )
    }
  })
}

async function runDbReset(opts: { confirm?: boolean }): Promise<void> {
  if (!opts.confirm) {
    console.error(
      '\x1b[31m✗\x1b[0m Use --confirm to confirm destructive operation',
    )
    process.exit(1)
  }

  console.log('\x1b[36m◆\x1b[0m ae-sync db reset')
  console.log('')

  await withDatabase(async (database) => {
    const tables = await database.qb.execute<{ tablename: string }>(
      sql.raw(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND (tablename LIKE '_aesync_%' OR tablename LIKE '_reorg__%')
      `),
    )

    for (const row of tables.rows) {
      await database.qb.execute(
        sql.raw(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`),
      )
      console.log(`  Dropped: ${row.tablename}`)
    }

    console.log('')
    console.log(
      `\x1b[32m✓\x1b[0m Reset complete — dropped ${tables.rows.length} table(s)`,
    )
  })
}
