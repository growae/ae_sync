import { sql } from 'drizzle-orm'
import { graphql } from 'graphql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodeEventArgs } from '../aci/decoder.js'
import { eventHashHex } from '../aci/hash.js'
import { parseAci } from '../aci/parser.js'
import { createConfig } from '../config/index.js'
import { createDatabase } from '../database/index.js'
import { applyMigrations } from '../database/migrate.js'
import { createShadowTables, revertToHeight } from '../database/shadow.js'
import type { Database } from '../database/types.js'
import { buildGraphQLSchema } from '../graphql/schema.js'
import { createIndexingCache } from '../indexing/cache.js'
import { processEventBatch } from '../indexing/executor.js'
import type { HandlerContext } from '../indexing/types.js'
import type { MdwContractLog } from '../mdw/types.js'
import {
  aesyncCheckpoint,
  aesyncContractState,
  aesyncMeta,
} from '../schema/internal.js'
import { onchainTable } from '../schema/onchain.js'
import { healthRoutes } from '../server/health.js'
import { matchEvent } from '../sync/matcher.js'
import type {
  CompiledContract,
  EventCallback,
  MatchedEvent,
} from '../sync/types.js'

// ── Shared fixtures ────────────────────────────────────────────────

const TOKEN_ACI = {
  contract: {
    name: 'Token',
    kind: 'contract_main',
    event: {
      variant: [{ Transfer: ['address', 'address', 'int'] }],
    },
    functions: [
      {
        name: 'init',
        arguments: [],
        returns: 'unit',
        stateful: true,
        payable: false,
      },
      {
        name: 'transfer',
        arguments: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'int' },
        ],
        returns: 'unit',
        stateful: true,
        payable: false,
      },
    ],
  },
}

const transfers = onchainTable('transfers', (t) => ({
  id: t.text('id').primaryKey(),
  from: t.text('from').notNull(),
  to: t.text('to').notNull(),
  amount: t.bigint('amount', { mode: 'bigint' }).notNull(),
}))

const userTables = { transfers }

const internalTables = { aesyncMeta, aesyncContractState, aesyncCheckpoint }

function makeMockLog(overrides: Partial<MdwContractLog> = {}): MdwContractLog {
  return {
    contract_id: 'ct_test123',
    contract_tx_hash: 'th_deploy',
    call_tx_hash: 'th_call1',
    block_time: 1700000000,
    height: 100,
    micro_index: 0,
    block_hash: 'mh_block1',
    log_idx: 0,
    args: [],
    data: '',
    event_hash: '',
    event_name: null,
    ext_caller_contract_id: null,
    parent_contract_id: null,
    ...overrides,
  }
}

// ── 1. Config → Database → Migration pipeline ─────────────────────

describe('Config → Database → Migration pipeline', () => {
  let db: Database

  afterEach(async () => {
    if (db) await db.close()
  })

  it('creates config, database, migrates, and verifies tables', async () => {
    const config = createConfig({
      network: { name: 'testnet', mdwUrl: 'https://testnet.aeternity.io/mdw' },
      database: { kind: 'pglite', directory: 'memory://' },
      contracts: {
        Token: { aci: TOKEN_ACI, address: 'ct_test123' },
      },
    })

    expect(config.network.name).toBe('testnet')
    expect(config.database.kind).toBe('pglite')

    db = await createDatabase(config.database)

    await applyMigrations(db.qb, { ...userTables, ...internalTables })

    const result = await db.qb.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('transfers', '_aesync_meta', '_aesync_contract_state', '_aesync_checkpoint')`,
    )

    const tableNames = result.rows.map((r) => r.table_name).sort()
    expect(tableNames).toEqual([
      '_aesync_checkpoint',
      '_aesync_contract_state',
      '_aesync_meta',
      'transfers',
    ])
  })
})

// ── 2. ACI → Event matching pipeline ──────────────────────────────

describe('ACI → Event matching pipeline', () => {
  it('parses ACI, computes hash, matches event, and decodes args', () => {
    const aci = parseAci(TOKEN_ACI)
    const transferEvent = aci.events.find((e) => e.name === 'Transfer')!
    expect(transferEvent).toBeDefined()

    const expectedHash = eventHashHex('Transfer')
    expect(transferEvent.hash).toBe(expectedHash)

    const contracts = new Map<string, CompiledContract>()
    contracts.set('ct_test123', {
      name: 'Token',
      address: 'ct_test123',
      aci,
      events: aci.events,
    })

    const callbacks = new Map<string, EventCallback>()
    const handlerFn = async () => {}
    callbacks.set('Token:Transfer', { name: 'Transfer', fn: handlerFn })

    const log = makeMockLog({
      event_hash: expectedHash,
      args: ['ak_sender', 'ak_receiver', '1000'],
    })

    const matched = matchEvent(log, contracts, callbacks)!
    expect(matched).not.toBeNull()
    expect(matched.contractName).toBe('Token')
    expect(matched.eventName).toBe('Transfer')
    expect(matched.event.args.arg0).toBe('ak_sender')
    expect(matched.event.args.arg1).toBe('ak_receiver')
    expect(matched.event.args.arg2).toBe(1000n)
    expect(matched.event.txHash).toBe('th_call1')
    expect(matched.event.height).toBe(100)
  })

  it('returns null for unmatched contract_id', () => {
    const aci = parseAci(TOKEN_ACI)
    const contracts = new Map<string, CompiledContract>()
    contracts.set('ct_other', {
      name: 'Token',
      address: 'ct_other',
      aci,
      events: aci.events,
    })

    const callbacks = new Map<string, EventCallback>()
    callbacks.set('Token:Transfer', {
      name: 'Transfer',
      fn: async () => {},
    })

    const log = makeMockLog({ event_hash: eventHashHex('Transfer') })
    const matched = matchEvent(log, contracts, callbacks)
    expect(matched).toBeNull()
  })

  it('returns null for unmatched event_hash', () => {
    const aci = parseAci(TOKEN_ACI)
    const contracts = new Map<string, CompiledContract>()
    contracts.set('ct_test123', {
      name: 'Token',
      address: 'ct_test123',
      aci,
      events: aci.events,
    })

    const callbacks = new Map<string, EventCallback>()
    callbacks.set('Token:Transfer', {
      name: 'Transfer',
      fn: async () => {},
    })

    const log = makeMockLog({ event_hash: 'deadbeef' })
    const matched = matchEvent(log, contracts, callbacks)
    expect(matched).toBeNull()
  })
})

// ── 3. Full indexing pipeline: event → handler → database ─────────

describe('Full indexing pipeline', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase({ kind: 'pglite', directory: 'memory://' })
    await applyMigrations(db.qb, { ...userTables, ...internalTables })
    await createShadowTables(db, userTables)
  })

  afterEach(async () => {
    await db.close()
  })

  it('processes event batch, inserts row, and records in shadow', async () => {
    const cache = createIndexingCache()

    const callback: EventCallback = {
      name: 'Transfer',
      fn: async ({ event, context }) => {
        const ctx = context as HandlerContext
        ctx.db.insert(transfers).values({
          id: `${event.txHash}-${event.logIndex}`,
          from: event.args.arg0 as string,
          to: event.args.arg1 as string,
          amount: event.args.arg2 as bigint,
        })
      },
    }

    const aci = parseAci(TOKEN_ACI)
    const transferEvent = aci.events.find((e) => e.name === 'Transfer')!
    const log = makeMockLog({
      event_hash: transferEvent.hash,
      args: ['ak_sender', 'ak_receiver', '500'],
    })
    const decodedArgs = decodeEventArgs(transferEvent, log.args, log.data)

    const matched: MatchedEvent = {
      contractName: 'Token',
      eventName: 'Transfer',
      event: {
        args: decodedArgs,
        contractId: log.contract_id,
        txHash: log.call_tx_hash,
        logIndex: log.log_idx,
        height: log.height,
        blockTime: log.block_time,
        blockHash: log.block_hash,
        microIndex: log.micro_index,
        raw: log,
      },
      callback,
    }

    const result = await processEventBatch({
      events: [matched],
      database: db,
      tables: userTables,
      networkName: 'testnet',
      cache,
      checkpointHeight: 100,
      checkpointBlockHash: 'mh_block1',
    })

    expect(result.eventsProcessed).toBe(1)

    const rows = await db.qb.execute<{
      id: string
      from: string
      to: string
      amount: string
    }>(sql`SELECT * FROM "transfers"`)
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.from).toBe('ak_sender')
    expect(rows.rows[0]!.to).toBe('ak_receiver')

    const shadow = await db.qb.execute<{
      operation: string
      checkpoint_height: number
    }>(sql`SELECT operation, checkpoint_height FROM "_reorg__transfers"`)
    expect(shadow.rows).toHaveLength(1)
    expect(shadow.rows[0]!.operation).toBe('INSERT')
    expect(shadow.rows[0]!.checkpoint_height).toBe(100)

    const cp = await db.qb.execute<{ height: number; events_count: number }>(
      sql`SELECT height, events_count FROM "_aesync_checkpoint"`,
    )
    expect(cp.rows).toHaveLength(1)
    expect(cp.rows[0]!.height).toBe(100)
    expect(cp.rows[0]!.events_count).toBe(1)
  })
})

// ── 4. Reorg pipeline: insert → revert → verify ──────────────────

describe('Reorg pipeline', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase({ kind: 'pglite', directory: 'memory://' })
    await applyMigrations(db.qb, userTables)
    await createShadowTables(db, userTables)
  })

  afterEach(async () => {
    await db.close()
  })

  it('reverts height-101 data while preserving height-100 data', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx1', 'ak_a', 'ak_b', 100)`,
    )

    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx2', 'ak_c', 'ak_d', 200)`,
    )

    const beforeRevert = await db.qb.execute<{ id: string }>(
      sql`SELECT id FROM "transfers" ORDER BY id`,
    )
    expect(beforeRevert.rows).toHaveLength(2)

    await revertToHeight(db, userTables, 100)

    const afterRevert = await db.qb.execute<{ id: string }>(
      sql`SELECT id FROM "transfers" ORDER BY id`,
    )
    expect(afterRevert.rows).toHaveLength(1)
    expect(afterRevert.rows[0]!.id).toBe('tx1')
  })

  it('reverts updates back to original values', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx1', 'ak_a', 'ak_b', 100)`,
    )

    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(
      sql`UPDATE "transfers" SET amount = 999 WHERE id = 'tx1'`,
    )

    await revertToHeight(db, userTables, 100)

    const rows = await db.qb.execute<{ amount: string }>(
      sql`SELECT amount FROM "transfers" WHERE id = 'tx1'`,
    )
    expect(Number(rows.rows[0]!.amount)).toBe(100)
  })

  it('cleans shadow entries after revert', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx1', 'ak_a', 'ak_b', 100)`,
    )

    await revertToHeight(db, userTables, 100)

    const shadow = await db.qb.execute<{ operation_id: string }>(
      sql`SELECT * FROM "_reorg__transfers"`,
    )
    expect(shadow.rows).toHaveLength(0)
  })
})

// ── 5. GraphQL schema generation → query execution ────────────────

describe('GraphQL schema → query execution', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase({ kind: 'pglite', directory: 'memory://' })
    await applyMigrations(db.qb, userTables)
  })

  afterEach(async () => {
    await db.close()
  })

  it('queries inserted data via GraphQL', async () => {
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx1', 'ak_alice', 'ak_bob', 500)`,
    )
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx2', 'ak_bob', 'ak_carol', 300)`,
    )

    const schema = buildGraphQLSchema(userTables, db.qb)

    const result = await graphql({
      schema,
      source: `{ transfers(id: "tx1") { id from to amount } }`,
    })

    expect(result.errors).toBeUndefined()
    expect(result.data?.transfers).toEqual({
      id: 'tx1',
      from: 'ak_alice',
      to: 'ak_bob',
      amount: '500',
    })
  })

  it('paginates list queries with first/after', async () => {
    for (let i = 1; i <= 5; i++) {
      await db.qb.execute(
        sql.raw(
          `INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx${i}', 'ak_a', 'ak_b', ${i * 100})`,
        ),
      )
    }

    const schema = buildGraphQLSchema(userTables, db.qb)

    const page1 = await graphql({
      schema,
      source:
        '{ transferses(first: 2) { items { id } pageInfo { hasNextPage endCursor } } }',
    })

    expect(page1.errors).toBeUndefined()
    const page1Data = page1.data?.transferses as {
      items: { id: string }[]
      pageInfo: { hasNextPage: boolean; endCursor: string }
    }
    expect(page1Data.items).toHaveLength(2)
    expect(page1Data.pageInfo.hasNextPage).toBe(true)

    const cursor = page1Data.pageInfo.endCursor
    const page2 = await graphql({
      schema,
      source: `{ transferses(first: 2, after: "${cursor}") { items { id } pageInfo { hasNextPage } } }`,
    })

    expect(page2.errors).toBeUndefined()
    const page2Data = page2.data?.transferses as {
      items: { id: string }[]
      pageInfo: { hasNextPage: boolean }
    }
    expect(page2Data.items).toHaveLength(2)
  })

  it('filters with where clause', async () => {
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx1', 'ak_alice', 'ak_bob', 500)`,
    )
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx2', 'ak_bob', 'ak_carol', 300)`,
    )

    const schema = buildGraphQLSchema(userTables, db.qb)

    const result = await graphql({
      schema,
      source: `{ transferses(where: { from: "ak_alice" }) { items { id from } pageInfo { hasNextPage } } }`,
    })

    expect(result.errors).toBeUndefined()
    const data = result.data?.transferses as {
      items: { id: string; from: string }[]
    }
    expect(data.items).toHaveLength(1)
    expect(data.items[0]!.from).toBe('ak_alice')
  })
})

// ── 6. Server health/ready/status endpoints ───────────────────────

describe('Server health/ready/status endpoints', () => {
  it('responds to /health with ok', async () => {
    const app = healthRoutes(() => ({ ready: true, contracts: [] }))
    const res = await app.request('/health')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('responds to /ready with ready when synced', async () => {
    const app = healthRoutes(() => ({ ready: true, contracts: [] }))
    const res = await app.request('/ready')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ready')
  })

  it('responds to /ready with 503 when not ready', async () => {
    const app = healthRoutes(() => ({ ready: false, contracts: [] }))
    const res = await app.request('/ready')

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('not_ready')
  })

  it('responds to /status with version and contract info', async () => {
    const app = healthRoutes(() => ({
      ready: true,
      contracts: [
        {
          name: 'Token',
          status: 'realtime',
          eventsProcessed: 42,
          lastHeight: 100,
        },
      ],
    }))
    const res = await app.request('/status')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.version).toBeDefined()
    expect(body.ready).toBe(true)
    expect(body.contracts).toHaveLength(1)
    expect(body.contracts[0].name).toBe('Token')
    expect(body.contracts[0].eventsProcessed).toBe(42)
  })
})

// ── 7. Cache → Flush → Read-back pipeline ─────────────────────────

describe('Cache → Flush → Read-back pipeline', () => {
  let db: Database

  beforeEach(async () => {
    db = await createDatabase({ kind: 'pglite', directory: 'memory://' })
    await applyMigrations(db.qb, userTables)
  })

  afterEach(async () => {
    await db.close()
  })

  it('buffers inserts and flushes to database', async () => {
    const cache = createIndexingCache()

    cache.insert('transfers', {
      id: 'tx1',
      from: 'ak_a',
      to: 'ak_b',
      amount: 100,
    })
    cache.insert('transfers', {
      id: 'tx2',
      from: 'ak_c',
      to: 'ak_d',
      amount: 200,
    })

    expect(cache.size()).toBe(2)

    await cache.flush(db.qb, userTables)

    const rows = await db.qb.execute<{ id: string; amount: string }>(
      sql`SELECT id, amount FROM "transfers" ORDER BY id`,
    )
    expect(rows.rows).toHaveLength(2)
    expect(rows.rows[0]!.id).toBe('tx1')
    expect(Number(rows.rows[0]!.amount)).toBe(100)
    expect(rows.rows[1]!.id).toBe('tx2')
    expect(Number(rows.rows[1]!.amount)).toBe(200)
  })

  it('buffers updates and flushes to database', async () => {
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx1', 'ak_a', 'ak_b', 100)`,
    )

    const cache = createIndexingCache()
    cache.update('transfers', { id: 'tx1' }, { amount: 999 })
    expect(cache.size()).toBe(1)

    await cache.flush(db.qb, userTables)

    const rows = await db.qb.execute<{ amount: string }>(
      sql`SELECT amount FROM "transfers" WHERE id = 'tx1'`,
    )
    expect(Number(rows.rows[0]!.amount)).toBe(999)
  })

  it('buffers deletes and flushes to database', async () => {
    await db.qb.execute(
      sql`INSERT INTO "transfers" (id, "from", "to", amount) VALUES ('tx1', 'ak_a', 'ak_b', 100)`,
    )

    const cache = createIndexingCache()
    cache.delete('transfers', { id: 'tx1' })
    expect(cache.size()).toBe(1)

    await cache.flush(db.qb, userTables)

    const rows = await db.qb.execute<{ id: string }>(
      sql`SELECT * FROM "transfers"`,
    )
    expect(rows.rows).toHaveLength(0)
  })

  it('find returns buffered data before flush', () => {
    const cache = createIndexingCache()

    cache.insert('transfers', {
      id: 'tx1',
      from: 'ak_a',
      to: 'ak_b',
      amount: 100,
    })

    const found = cache.find('transfers', { id: 'tx1' })
    expect(found).toBeDefined()
    expect(found!.from).toBe('ak_a')
  })

  it('clear empties all buffers', () => {
    const cache = createIndexingCache()
    cache.insert('transfers', {
      id: 'tx1',
      from: 'ak_a',
      to: 'ak_b',
      amount: 100,
    })
    cache.update('transfers', { id: 'tx1' }, { amount: 999 })

    expect(cache.size()).toBe(2)
    cache.clear()
    expect(cache.size()).toBe(0)
  })

  it('handles mixed insert and update for same row', async () => {
    const cache = createIndexingCache()

    cache.insert('transfers', {
      id: 'tx1',
      from: 'ak_a',
      to: 'ak_b',
      amount: 100,
    })
    cache.update('transfers', { id: 'tx1' }, { amount: 777 })

    await cache.flush(db.qb, userTables)

    const rows = await db.qb.execute<{ id: string; amount: string }>(
      sql`SELECT id, amount FROM "transfers" WHERE id = 'tx1'`,
    )
    expect(rows.rows).toHaveLength(1)
    expect(Number(rows.rows[0]!.amount)).toBe(777)
  })
})
