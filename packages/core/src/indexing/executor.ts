import { sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import type { Database } from '../database/types.js'
import type { MatchedEvent } from '../sync/types.js'
import { createHandlerContext } from './context.js'
import type { IndexingCache, ProcessBatchResult } from './types.js'

export interface ProcessEventBatchParams {
  events: MatchedEvent[]
  database: Database
  tables: Record<string, PgTable>
  networkName: string
  cache: IndexingCache
  checkpointHeight: number
  checkpointBlockHash: string
}

export async function processEventBatch(
  params: ProcessEventBatchParams,
): Promise<ProcessBatchResult> {
  const {
    events,
    database,
    tables,
    networkName,
    cache,
    checkpointHeight,
    checkpointBlockHash,
  } = params

  const start = performance.now()

  cache.clear()

  const registrations: { name: string; address: string }[] = []

  await database.transaction(async (tx) => {
    await tx.execute(
      sql.raw(`SET LOCAL aesync.checkpoint_height = '${checkpointHeight}'`),
    )

    for (const matched of events) {
      const context = createHandlerContext({
        db: { ...database, qb: tx },
        tables,
        cache,
        networkName,
        height: matched.event.height,
        onRegister(name, address) {
          registrations.push({ name, address })
        },
      })

      await matched.callback.fn({ event: matched.event, context })
    }

    await cache.flush(tx, tables)

    await tx.execute(
      sql.raw(
        `INSERT INTO "_aesync_checkpoint" (height, block_hash, events_count) VALUES (${checkpointHeight}, '${checkpointBlockHash}', ${events.length}) ON CONFLICT (height) DO UPDATE SET block_hash = '${checkpointBlockHash}', events_count = ${events.length}`,
      ),
    )
  })

  const duration = performance.now() - start

  return {
    eventsProcessed: events.length,
    duration,
  }
}
