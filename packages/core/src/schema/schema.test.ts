import { getTableColumns, getTableName } from 'drizzle-orm'
import { text as drizzleText } from 'drizzle-orm/pg-core/columns'
import { pgTable } from 'drizzle-orm/pg-core/table'
import { describe, expect, it } from 'vitest'
import {
  ONCHAIN_TABLE_MARKER,
  aeAddress,
  aeAmount,
  aeBlockHash,
  aeTxHash,
  aesyncCheckpoint,
  aesyncContractState,
  aesyncMeta,
  isOnchainTable,
  onchainTable,
} from './index.js'

describe('onchainTable', () => {
  it('creates a valid Drizzle table with object-style columns', () => {
    const table = onchainTable('test_events', (t) => ({
      id: t.text('id').primaryKey(),
      value: t.integer('value').notNull(),
    }))

    expect(getTableName(table)).toBe('test_events')
    const cols = getTableColumns(table)
    expect(cols).toHaveProperty('id')
    expect(cols).toHaveProperty('value')
  })

  it('supports the callback-style column builder', () => {
    const table = onchainTable('cb_table', (t) => ({
      pk: t.text('pk').primaryKey(),
      amount: t.bigint('amount', { mode: 'bigint' }).notNull(),
      active: t.boolean('active').notNull().default(true),
    }))

    const cols = getTableColumns(table)
    expect(Object.keys(cols)).toEqual(['pk', 'amount', 'active'])
  })

  it('is tagged with the ONCHAIN_TABLE_MARKER symbol', () => {
    const table = onchainTable('marked', (t) => ({
      id: t.text('id').primaryKey(),
    }))

    expect(ONCHAIN_TABLE_MARKER in table).toBe(true)
    expect(
      (table as unknown as Record<symbol, unknown>)[ONCHAIN_TABLE_MARKER],
    ).toBe(true)
  })

  it('is detected by isOnchainTable()', () => {
    const onchain = onchainTable('on', (t) => ({
      id: t.text('id').primaryKey(),
    }))
    const plain = pgTable('plain', { id: drizzleText('id').primaryKey() })

    expect(isOnchainTable(onchain)).toBe(true)
    expect(isOnchainTable(plain)).toBe(false)
    expect(isOnchainTable(null)).toBe(false)
    expect(isOnchainTable({})).toBe(false)
  })
})

describe('column types', () => {
  it('supports all standard Drizzle column types', () => {
    const table = onchainTable('all_types', (t) => ({
      id: t.serial('id').primaryKey(),
      name: t.text('name').notNull(),
      count: t.integer('count'),
      big: t.bigint('big', { mode: 'bigint' }),
      flag: t.boolean('flag'),
      ratio: t.real('ratio'),
      precise: t.doublePrecision('precise'),
      ts: t.timestamp('ts'),
      data: t.json('data'),
      datab: t.jsonb('datab'),
      code: t.varchar('code', { length: 10 }),
      amount: t.numeric('amount'),
    }))

    const cols = getTableColumns(table)
    expect(Object.keys(cols)).toHaveLength(12)
  })

  it('supports default values', () => {
    const table = onchainTable('defaults', (t) => ({
      id: t.text('id').primaryKey(),
      count: t.integer('count').notNull().default(0),
      active: t.boolean('active').notNull().default(true),
    }))

    const cols = getTableColumns(table)
    expect(cols.count.hasDefault).toBe(true)
    expect(cols.active.hasDefault).toBe(true)
  })
})

describe('aesync-specific columns', () => {
  it('aeAddress() returns a text column', () => {
    const table = onchainTable('addr_test', {
      id: aeAddress('id').primaryKey(),
      contractAddr: aeAddress('contract_addr').notNull(),
    })

    const cols = getTableColumns(table)
    expect(cols.id.dataType).toBe('string')
    expect(cols.contractAddr.notNull).toBe(true)
  })

  it('aeAmount() returns a numeric(78,0) column', () => {
    const table = onchainTable('amount_test', {
      id: aeAddress('id').primaryKey(),
      balance: aeAmount('balance').notNull(),
    })

    const cols = getTableColumns(table)
    expect(cols.balance.dataType).toBe('string')
    expect(cols.balance.notNull).toBe(true)
  })

  it('aeTxHash() returns a text column', () => {
    const table = onchainTable('tx_test', {
      hash: aeTxHash('hash').primaryKey(),
    })

    const cols = getTableColumns(table)
    expect(cols.hash.dataType).toBe('string')
  })

  it('aeBlockHash() returns a text column', () => {
    const table = onchainTable('block_test', {
      hash: aeBlockHash('hash').primaryKey(),
    })

    const cols = getTableColumns(table)
    expect(cols.hash.dataType).toBe('string')
  })
})

describe('internal tables', () => {
  it('aesyncMeta has the correct structure', () => {
    expect(getTableName(aesyncMeta)).toBe('_aesync_meta')
    const cols = getTableColumns(aesyncMeta)
    expect(cols).toHaveProperty('key')
    expect(cols).toHaveProperty('value')
    expect(cols).toHaveProperty('updatedAt')
    expect(cols.key.primary).toBe(true)
    expect(cols.value.notNull).toBe(true)
  })

  it('aesyncContractState has the correct structure', () => {
    expect(getTableName(aesyncContractState)).toBe('_aesync_contract_state')
    const cols = getTableColumns(aesyncContractState)
    expect(cols).toHaveProperty('contractId')
    expect(cols).toHaveProperty('contractName')
    expect(cols).toHaveProperty('lastCursor')
    expect(cols).toHaveProperty('lastHeight')
    expect(cols).toHaveProperty('eventsProcessed')
    expect(cols).toHaveProperty('status')
    expect(cols).toHaveProperty('error')
    expect(cols).toHaveProperty('startedAt')
    expect(cols).toHaveProperty('updatedAt')
    expect(cols.status.notNull).toBe(true)
  })

  it('aesyncCheckpoint has the correct structure', () => {
    expect(getTableName(aesyncCheckpoint)).toBe('_aesync_checkpoint')
    const cols = getTableColumns(aesyncCheckpoint)
    expect(cols).toHaveProperty('height')
    expect(cols).toHaveProperty('blockHash')
    expect(cols).toHaveProperty('eventsCount')
    expect(cols).toHaveProperty('createdAt')
    expect(cols.height.primary).toBe(true)
    expect(cols.blockHash.notNull).toBe(true)
  })
})

describe('column info extraction', () => {
  it('can enumerate all columns from a table', () => {
    const table = onchainTable('info_test', (t) => ({
      id: t.text('id').primaryKey(),
      name: t.text('name').notNull(),
      value: t.integer('value'),
    }))

    const cols = getTableColumns(table)
    const names = Object.keys(cols)
    expect(names).toEqual(['id', 'name', 'value'])
  })

  it('can read notNull and primary from column metadata', () => {
    const table = onchainTable('meta_test', (t) => ({
      id: t.text('id').primaryKey(),
      required: t.text('required').notNull(),
      optional: t.text('optional'),
    }))

    const cols = getTableColumns(table)
    expect(cols.id.primary).toBe(true)
    expect(cols.required.notNull).toBe(true)
    expect(cols.optional.notNull).toBe(false)
  })
})
