import { sql } from 'drizzle-orm'
import { graphql } from 'graphql'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { eventHashHex } from '../aci/hash.js'
import type { AciEvent } from '../aci/types.js'
import { createPGliteDatabase } from '../database/pglite.js'
import { createShadowTables, revertToHeight } from '../database/shadow.js'
import type { Database } from '../database/types.js'
import { buildGraphQLSchema } from '../graphql/schema.js'
import { createIndexingCache } from '../indexing/cache.js'
import { processEventBatch } from '../indexing/executor.js'
import type { MdwContractLog } from '../mdw/types.js'
import { aesyncCheckpoint } from '../schema/internal.js'
import { onchainTable } from '../schema/onchain.js'
import { matchEvent } from '../sync/matcher.js'
import type { CompiledContract, EventCallback } from '../sync/types.js'

const benchUsers = onchainTable('bench_users', (t) => ({
  id: t.text('id').primaryKey(),
  name: t.text('name').notNull(),
  balance: t.integer('balance').notNull(),
}))

function fmt(label: string, value: number, unit: string): string {
  return `[BENCH] ${label}: ${Math.round(value).toLocaleString()} ${unit}`
}

// ── 1. Event Matching Throughput ──────────────────────────────────────

describe('event matching throughput', () => {
  test('matches 10,000 events', () => {
    const eventName = 'Transfer'
    const hash = eventHashHex(eventName)

    const aciEvent: AciEvent = {
      name: eventName,
      hash,
      fields: [
        { index: 0, name: 'from', type: 'address', indexed: true },
        { index: 1, name: 'to', type: 'address', indexed: true },
        { index: 2, name: 'amount', type: 'int', indexed: false },
      ],
    }

    const contractId = 'ct_testcontract1'
    const compiled: CompiledContract = {
      name: 'Token',
      address: contractId,
      aci: { name: 'Token', events: [aciEvent], entrypoints: [] },
      events: [aciEvent],
    }

    const contracts = new Map<string, CompiledContract>()
    contracts.set(contractId, compiled)

    const callback: EventCallback = {
      name: 'Token:Transfer',
      fn: async () => {},
    }
    const eventCallbacks = new Map<string, EventCallback>()
    eventCallbacks.set('Token:Transfer', callback)

    const logs: MdwContractLog[] = []
    for (let i = 0; i < 10_000; i++) {
      logs.push({
        contract_id: contractId,
        contract_tx_hash: `th_tx_${i}`,
        call_tx_hash: `th_call_${i}`,
        block_time: 1700000000 + i,
        height: 100_000 + (i % 1000),
        micro_index: i % 10,
        block_hash: `mh_block_${i}`,
        log_idx: i,
        args: [`ak_sender_${i}`, `ak_receiver_${i}`],
        data: String(i * 1000),
        event_hash: hash,
        event_name: null,
        ext_caller_contract_id: null,
        parent_contract_id: null,
      })
    }

    const start = performance.now()
    let matched = 0
    for (const log of logs) {
      const result = matchEvent(log, contracts, eventCallbacks)
      if (result) matched++
    }
    const elapsed = performance.now() - start

    const eventsPerSecond = (matched / elapsed) * 1000
    console.log(fmt('Event matching', eventsPerSecond, 'events/sec'))

    expect(matched).toBe(10_000)
    expect(elapsed).toBeLessThan(10_000)
  }, 30_000)
})

// ── 2. Indexing Cache Flush Throughput ────────────────────────────────

describe('indexing cache flush throughput', () => {
  let db: Database

  beforeEach(async () => {
    db = await createPGliteDatabase('memory://')
    await db.migrate({ benchUsers })
  })

  afterEach(async () => {
    await db.close()
  })

  test('flushes 1,000 buffered inserts', async () => {
    const cache = createIndexingCache()
    const tables = { benchUsers }

    for (let i = 0; i < 1_000; i++) {
      cache.insert('bench_users', {
        id: `user_${i}`,
        name: `User ${i}`,
        balance: i * 100,
      })
    }

    expect(cache.size()).toBe(1_000)

    const start = performance.now()
    await cache.flush(db.qb, tables)
    const elapsed = performance.now() - start

    const rowsPerSecond = (1_000 / elapsed) * 1000
    console.log(fmt('Cache flush', rowsPerSecond, 'rows/sec'))

    const result = await db.qb.execute<{ cnt: string }>(
      sql`SELECT count(*)::text as cnt FROM "bench_users"`,
    )
    expect(Number(result.rows[0]!.cnt)).toBe(1_000)
    expect(elapsed).toBeLessThan(15_000)
  }, 30_000)
})

// ── 3. Full Batch Processing Throughput ──────────────────────────────

describe('full batch processing throughput', () => {
  let db: Database

  beforeEach(async () => {
    db = await createPGliteDatabase('memory://')
    await db.migrate({ benchUsers, aesyncCheckpoint })
    await createShadowTables(db, { benchUsers })
  })

  afterEach(async () => {
    await db.close()
  })

  test('processes 100 events through full pipeline', async () => {
    const tables = { benchUsers }
    const cache = createIndexingCache()

    const events = Array.from({ length: 100 }, (_, i) => ({
      contractName: 'Token',
      eventName: 'Transfer',
      event: {
        args: {
          from: `ak_sender_${i}`,
          to: `ak_receiver_${i}`,
          amount: BigInt(i * 1000),
        },
        contractId: 'ct_testcontract1',
        txHash: `th_call_${i}`,
        logIndex: i,
        height: 500_000,
        blockTime: 1700000000 + i,
        blockHash: 'mh_block_batch',
        microIndex: i % 10,
        raw: {} as MdwContractLog,
      },
      callback: {
        name: 'Token:Transfer',
        fn: async ({ context }: { event: unknown; context: any }) => {
          context.db.insert(benchUsers).values({
            id: `user_batch_${i}`,
            name: `User ${i}`,
            balance: i * 100,
          })
        },
      },
    }))

    const start = performance.now()
    const result = await processEventBatch({
      events,
      database: db,
      tables,
      networkName: 'testnet',
      cache,
      checkpointHeight: 500_000,
      checkpointBlockHash: 'mh_block_batch',
    })
    const elapsed = performance.now() - start

    const eventsPerSecond = (result.eventsProcessed / elapsed) * 1000
    console.log(fmt('Batch processing', eventsPerSecond, 'events/sec'))

    expect(result.eventsProcessed).toBe(100)

    const rows = await db.qb.execute<{ cnt: string }>(
      sql`SELECT count(*)::text as cnt FROM "bench_users"`,
    )
    expect(Number(rows.rows[0]!.cnt)).toBe(100)
  }, 30_000)
})

// ── 4. Revert Throughput ─────────────────────────────────────────────

describe('revert throughput', () => {
  let db: Database

  beforeEach(async () => {
    db = await createPGliteDatabase('memory://')
    await db.migrate({ benchUsers })
    await createShadowTables(db, { benchUsers })
  })

  afterEach(async () => {
    await db.close()
  })

  test('reverts 100 heights worth of inserts', async () => {
    const tables = { benchUsers }
    const totalRows = 1_000
    const totalHeights = 200
    const revertHeights = 100
    const rowsPerHeight = totalRows / totalHeights

    for (let h = 0; h < totalHeights; h++) {
      const height = 1000 + h
      await db.qb.execute(sql.raw(`SET aesync.checkpoint_height = '${height}'`))
      for (let r = 0; r < rowsPerHeight; r++) {
        const idx = h * rowsPerHeight + r
        await db.qb.execute(
          sql.raw(
            `INSERT INTO "bench_users" (id, name, balance) VALUES ('u_${idx}', 'User ${idx}', ${idx * 10})`,
          ),
        )
      }
    }

    const beforeCount = await db.qb.execute<{ cnt: string }>(
      sql`SELECT count(*)::text as cnt FROM "bench_users"`,
    )
    expect(Number(beforeCount.rows[0]!.cnt)).toBe(totalRows)

    const forkHeight = 1000 + totalHeights - revertHeights - 1
    const expectedRemaining = (totalHeights - revertHeights) * rowsPerHeight

    const start = performance.now()
    await revertToHeight(db, tables, forkHeight)
    const elapsed = performance.now() - start

    const afterCount = await db.qb.execute<{ cnt: string }>(
      sql`SELECT count(*)::text as cnt FROM "bench_users"`,
    )
    const rowsReverted =
      Number(beforeCount.rows[0]!.cnt) - Number(afterCount.rows[0]!.cnt)
    const revertedPerSecond = (rowsReverted / elapsed) * 1000

    console.log(fmt('Revert', revertedPerSecond, 'reverted-rows/sec'))

    expect(Number(afterCount.rows[0]!.cnt)).toBe(expectedRemaining)
  }, 30_000)
})

// ── 5. GraphQL Query Throughput ──────────────────────────────────────

describe('graphql query throughput', () => {
  let db: Database

  beforeEach(async () => {
    db = await createPGliteDatabase('memory://')
    await db.migrate({ benchUsers })
  })

  afterEach(async () => {
    await db.close()
  })

  test('executes 100 paginated list queries', async () => {
    const values: string[] = []
    for (let i = 0; i < 1_000; i++) {
      values.push(`('gql_${i}', 'User ${i}', ${i * 10})`)
    }
    await db.qb.execute(
      sql.raw(
        `INSERT INTO "bench_users" (id, name, balance) VALUES ${values.join(', ')}`,
      ),
    )

    const tables = { benchUser: benchUsers }
    const schema = buildGraphQLSchema(tables, db.qb)

    const query = `{
        benchUsers(first: 20, orderBy: "id", orderDirection: ASC) {
          items { id name balance }
          pageInfo { hasNextPage endCursor }
        }
      }`

    const numQueries = 100
    const start = performance.now()
    for (let i = 0; i < numQueries; i++) {
      const result = await graphql({ schema, source: query })
      if (i === 0) {
        expect(result.errors).toBeUndefined()
        const data = result.data as any
        expect(data.benchUsers.items.length).toBe(20)
        expect(data.benchUsers.pageInfo.hasNextPage).toBe(true)
      }
    }
    const elapsed = performance.now() - start

    const queriesPerSecond = (numQueries / elapsed) * 1000
    console.log(fmt('GraphQL queries', queriesPerSecond, 'queries/sec'))

    expect(elapsed).toBeLessThan(30_000)
  }, 30_000)
})
