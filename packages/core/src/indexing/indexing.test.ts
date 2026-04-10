import { sql } from 'drizzle-orm'
import { integer, text } from 'drizzle-orm/pg-core/columns'
import { pgTable } from 'drizzle-orm/pg-core/table'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPGliteDatabase } from '../database/pglite.js'
import type { Database } from '../database/types.js'
import { aesyncCheckpoint } from '../schema/internal.js'
import type { HandlerEvent, MatchedEvent } from '../sync/types.js'
import { createIndexingCache } from './cache.js'
import { createHandlerContext } from './context.js'
import { processEventBatch } from './executor.js'

const testTokens = pgTable('test_tokens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  supply: integer('supply').notNull().default(0),
})

let db: Database

beforeEach(async () => {
  db = await createPGliteDatabase('memory://')
})

afterEach(async () => {
  await db.close()
})

describe('IndexingCache', () => {
  it('insert buffers correctly', () => {
    const cache = createIndexingCache()
    cache.insert('test_tokens', { id: '1', name: 'Token A', supply: 100 })
    cache.insert('test_tokens', { id: '2', name: 'Token B', supply: 200 })

    expect(cache.insertBuffer.get('test_tokens')).toHaveLength(2)
    expect(cache.insertBuffer.get('test_tokens')![0]!.name).toBe('Token A')
  })

  it('update buffers correctly', () => {
    const cache = createIndexingCache()
    cache.update('test_tokens', { id: '1' }, { supply: 500 })

    expect(cache.updateBuffer.get('test_tokens')).toHaveLength(1)
    expect(cache.updateBuffer.get('test_tokens')![0]!.set.supply).toBe(500)
  })

  it('delete buffers correctly', () => {
    const cache = createIndexingCache()
    cache.delete('test_tokens', { id: '1' })

    expect(cache.deleteBuffer.get('test_tokens')).toHaveLength(1)
    expect(cache.deleteBuffer.get('test_tokens')![0]!.id).toBe('1')
  })

  it('find returns cached insert', () => {
    const cache = createIndexingCache()
    cache.insert('test_tokens', { id: '1', name: 'Token A', supply: 100 })

    const found = cache.find('test_tokens', { id: '1' })
    expect(found).toBeDefined()
    expect(found!.name).toBe('Token A')
  })

  it('find returns undefined for missing', () => {
    const cache = createIndexingCache()
    cache.insert('test_tokens', { id: '1', name: 'Token A', supply: 100 })

    const found = cache.find('test_tokens', { id: '99' })
    expect(found).toBeUndefined()
  })

  it('clear resets all buffers', () => {
    const cache = createIndexingCache()
    cache.insert('test_tokens', { id: '1', name: 'Token A', supply: 100 })
    cache.update('test_tokens', { id: '1' }, { supply: 500 })
    cache.delete('test_tokens', { id: '2' })

    cache.clear()

    expect(cache.insertBuffer.size).toBe(0)
    expect(cache.updateBuffer.size).toBe(0)
    expect(cache.deleteBuffer.size).toBe(0)
  })

  it('size counts correctly', () => {
    const cache = createIndexingCache()
    cache.insert('test_tokens', { id: '1', name: 'Token A', supply: 100 })
    cache.insert('test_tokens', { id: '2', name: 'Token B', supply: 200 })
    cache.update('test_tokens', { id: '1' }, { supply: 500 })
    cache.delete('test_tokens', { id: '3' })

    expect(cache.size()).toBe(4)
  })

  it('flush writes to DB', async () => {
    await db.migrate({ testTokens, aesyncCheckpoint })

    const cache = createIndexingCache()
    cache.insert('test_tokens', { id: '1', name: 'Token A', supply: 100 })
    cache.insert('test_tokens', { id: '2', name: 'Token B', supply: 200 })

    await cache.flush(db.qb, { testTokens })

    const rows = await db.qb.execute<{
      id: string
      name: string
      supply: number
    }>(sql`SELECT * FROM "test_tokens" ORDER BY "id"`)
    expect(rows.rows).toHaveLength(2)
    expect(rows.rows[0]!.name).toBe('Token A')
    expect(rows.rows[1]!.name).toBe('Token B')
  })
})

describe('Handler context', () => {
  it('db.insert routes to cache', async () => {
    const cache = createIndexingCache()
    const context = createHandlerContext({
      db,
      tables: { testTokens },
      cache,
      networkName: 'testnet',
      height: 100,
      onRegister: vi.fn(),
    })

    await context.db
      .insert(testTokens)
      .values({ id: '1', name: 'Token A', supply: 100 })

    expect(cache.insertBuffer.get('test_tokens')).toHaveLength(1)
    expect(cache.insertBuffer.get('test_tokens')![0]!.id).toBe('1')
  })

  it('db.select falls through to DB', async () => {
    await db.migrate({ testTokens })
    await db.qb.execute(
      sql`INSERT INTO "test_tokens" (id, name, supply) VALUES ('1', 'Token A', 100)`,
    )

    const cache = createIndexingCache()
    const context = createHandlerContext({
      db,
      tables: { testTokens },
      cache,
      networkName: 'testnet',
      height: 100,
      onRegister: vi.fn(),
    })

    const rows = await context.db
      .select()
      .from(testTokens)
      .where(sql`"id" = '1'`)
    expect(rows).toHaveLength(1)
    expect((rows[0] as Record<string, unknown>).name).toBe('Token A')
  })
})

function makeMockEvent(overrides?: Partial<HandlerEvent>): HandlerEvent {
  return {
    args: {},
    contractId: 'ct_test123',
    txHash: 'th_abc',
    logIndex: 0,
    height: 100,
    blockTime: Date.now(),
    blockHash: 'mh_block1',
    microIndex: 0,
    raw: {
      contract_id: 'ct_test123',
      contract_tx_hash: 'th_create',
      event_hash: '0xabc',
      args: [],
      data: '',
      call_tx_hash: 'th_abc',
      log_idx: 0,
      height: 100,
      block_time: Date.now(),
      block_hash: 'mh_block1',
      micro_index: 0,
      event_name: null,
      ext_caller_contract_id: null,
      parent_contract_id: null,
    },
    ...overrides,
  }
}

describe('Event executor', () => {
  it('processes batch of events', async () => {
    await db.migrate({ testTokens, aesyncCheckpoint })

    const cache = createIndexingCache()
    const handler = vi.fn(
      async ({ context }: { event: HandlerEvent; context: unknown }) => {
        const ctx = context as {
          db: {
            insert: (t: typeof testTokens) => {
              values: (v: Record<string, unknown>) => Promise<void>
            }
          }
        }
        await ctx.db
          .insert(testTokens)
          .values({ id: '1', name: 'Token A', supply: 100 })
      },
    )

    const events: MatchedEvent[] = [
      {
        contractName: 'TestContract',
        eventName: 'Transfer',
        event: makeMockEvent(),
        callback: { name: 'Transfer', fn: handler },
      },
    ]

    const result = await processEventBatch({
      events,
      database: db,
      tables: { testTokens },
      networkName: 'testnet',
      cache,
      checkpointHeight: 100,
      checkpointBlockHash: 'mh_block1',
    })

    expect(result.eventsProcessed).toBe(1)
    expect(result.duration).toBeGreaterThan(0)
    expect(handler).toHaveBeenCalledOnce()

    const rows = await db.qb.execute<{ id: string }>(
      sql`SELECT * FROM "test_tokens"`,
    )
    expect(rows.rows).toHaveLength(1)

    const checkpoint = await db.qb.execute<{ height: number }>(
      sql`SELECT * FROM "_aesync_checkpoint" WHERE height = 100`,
    )
    expect(checkpoint.rows).toHaveLength(1)
  })

  it('rolls back on handler error', async () => {
    await db.migrate({ testTokens, aesyncCheckpoint })

    const cache = createIndexingCache()

    let callCount = 0
    const handler = vi.fn(
      async ({ context }: { event: HandlerEvent; context: unknown }) => {
        callCount++
        const ctx = context as {
          db: {
            insert: (t: typeof testTokens) => {
              values: (v: Record<string, unknown>) => Promise<void>
            }
          }
        }
        await ctx.db.insert(testTokens).values({
          id: String(callCount),
          name: 'Token',
          supply: 100,
        })
        if (callCount === 2) throw new Error('Handler failed')
      },
    )

    const events: MatchedEvent[] = [
      {
        contractName: 'TestContract',
        eventName: 'Transfer',
        event: makeMockEvent(),
        callback: { name: 'Transfer', fn: handler },
      },
      {
        contractName: 'TestContract',
        eventName: 'Transfer',
        event: makeMockEvent({ logIndex: 1 }),
        callback: { name: 'Transfer', fn: handler },
      },
    ]

    await expect(
      processEventBatch({
        events,
        database: db,
        tables: { testTokens },
        networkName: 'testnet',
        cache,
        checkpointHeight: 100,
        checkpointBlockHash: 'mh_block1',
      }),
    ).rejects.toThrow('Handler failed')

    const rows = await db.qb.execute<{ id: string }>(
      sql`SELECT * FROM "test_tokens"`,
    )
    expect(rows.rows).toHaveLength(0)

    const checkpoint = await db.qb.execute<{ height: number }>(
      sql`SELECT * FROM "_aesync_checkpoint"`,
    )
    expect(checkpoint.rows).toHaveLength(0)
  })
})
