import { GraphQLSchema, printSchema } from 'graphql'
import { describe, expect, it } from 'vitest'
import { onchainTable } from '../schema/onchain.js'
import { decodeCursor, encodeCursor } from './pagination.js'
import { BigIntScalar, JSONScalar, buildGraphQLSchema } from './schema.js'

const testTables = {
  swapEvent: onchainTable('swap_event', (t) => ({
    id: t.text('id').primaryKey(),
    amount: t.bigint('amount', { mode: 'bigint' }).notNull(),
    sender: t.text('sender').notNull(),
    active: t.boolean('active'),
    price: t.real('price'),
    data: t.jsonb('data'),
    count: t.integer('count'),
    total: t.numeric('total'),
  })),
}

const mockDb = {} as any

describe('buildGraphQLSchema', () => {
  const schema = buildGraphQLSchema(testTables, mockDb)

  it('produces a valid GraphQL schema', () => {
    expect(schema).toBeInstanceOf(GraphQLSchema)
    const result = schema.toConfig()
    expect(result.query).toBeDefined()
  })

  it('generates the object type for a table', () => {
    const sdl = printSchema(schema)
    expect(sdl).toContain('type SwapEvent')
  })

  it('generates single-record query by primary key', () => {
    const sdl = printSchema(schema)
    expect(sdl).toContain('swapEvent(id: String!): SwapEvent')
  })

  it('generates paginated list query', () => {
    const sdl = printSchema(schema)
    expect(sdl).toContain('swapEvents(')
    expect(sdl).toContain('first: Int')
    expect(sdl).toContain('after: String')
    expect(sdl).toContain('orderBy: String')
    expect(sdl).toContain('orderDirection: OrderDirection')
    expect(sdl).toContain('SwapEventPage')
  })

  it('generates page type with items and pageInfo', () => {
    const sdl = printSchema(schema)
    expect(sdl).toContain('type SwapEventPage')
    expect(sdl).toContain('items: [SwapEvent!]!')
    expect(sdl).toContain('pageInfo: PageInfo!')
  })

  it('generates PageInfo type', () => {
    const sdl = printSchema(schema)
    expect(sdl).toContain('type PageInfo')
    expect(sdl).toContain('hasNextPage: Boolean!')
    expect(sdl).toContain('endCursor: String')
  })

  it('generates filter input type', () => {
    const sdl = printSchema(schema)
    expect(sdl).toContain('input SwapEventFilter')
  })

  it('generates OrderDirection enum', () => {
    const sdl = printSchema(schema)
    expect(sdl).toContain('enum OrderDirection')
    expect(sdl).toContain('ASC')
    expect(sdl).toContain('DESC')
  })
})

describe('column type mapping', () => {
  const schema = buildGraphQLSchema(testTables, mockDb)
  const sdl = printSchema(schema)

  it('maps text to String', () => {
    expect(sdl).toContain('sender: String!')
  })

  it('maps bigint to BigInt', () => {
    expect(sdl).toContain('amount: BigInt!')
  })

  it('maps boolean to Boolean', () => {
    expect(sdl).toContain('active: Boolean')
  })

  it('maps real to Float', () => {
    expect(sdl).toContain('price: Float')
  })

  it('maps jsonb to JSON', () => {
    expect(sdl).toContain('data: JSON')
  })

  it('maps integer to Int', () => {
    expect(sdl).toContain('count: Int')
  })

  it('maps numeric to String', () => {
    expect(sdl).toContain('total: String')
  })
})

describe('filter input types', () => {
  const schema = buildGraphQLSchema(testTables, mockDb)
  const sdl = printSchema(schema)

  it('generates equality filter for columns', () => {
    expect(sdl).toContain('sender: String')
    expect(sdl).toContain('count: Int')
  })

  it('generates comparison filters', () => {
    expect(sdl).toContain('count_gt: Int')
    expect(sdl).toContain('count_gte: Int')
    expect(sdl).toContain('count_lt: Int')
    expect(sdl).toContain('count_lte: Int')
    expect(sdl).toContain('count_not: Int')
  })

  it('generates in filter', () => {
    expect(sdl).toContain('count_in: [Int!]')
  })

  it('generates string-specific filters for text columns', () => {
    expect(sdl).toContain('sender_contains: String')
    expect(sdl).toContain('sender_starts_with: String')
  })

  it('does not generate string filters for non-string columns', () => {
    expect(sdl).not.toContain('count_contains')
    expect(sdl).not.toContain('count_starts_with')
    expect(sdl).not.toContain('active_contains')
  })
})

describe('custom scalars', () => {
  it('BigInt scalar serializes to string', () => {
    expect(BigIntScalar.serialize(123n)).toBe('123')
    expect(BigIntScalar.serialize(0)).toBe('0')
  })

  it('BigInt scalar parses string values', () => {
    expect(BigIntScalar.parseValue('123')).toBe(123n)
    expect(BigIntScalar.parseValue(456)).toBe(456n)
  })

  it('JSON scalar passes through values', () => {
    const obj = { key: 'value', nested: { a: 1 } }
    expect(JSONScalar.serialize(obj)).toEqual(obj)
    expect(JSONScalar.parseValue(obj)).toEqual(obj)
  })
})

describe('cursor encoding/decoding', () => {
  it('roundtrips string values', () => {
    const cursor = encodeCursor('abc-123')
    expect(decodeCursor(cursor)).toBe('abc-123')
  })

  it('roundtrips numeric values', () => {
    const cursor = encodeCursor(42)
    expect(decodeCursor(cursor)).toBe(42)
  })

  it('produces base64 string', () => {
    const cursor = encodeCursor('test')
    expect(cursor).toBe(btoa(JSON.stringify('test')))
  })
})

describe('multi-table schema', () => {
  const tables = {
    user: onchainTable('users', (t) => ({
      id: t.text('id').primaryKey(),
      name: t.text('name').notNull(),
    })),
    transfer: onchainTable('transfers', (t) => ({
      id: t.text('id').primaryKey(),
      from: t.text('from').notNull(),
      to: t.text('to').notNull(),
      amount: t.bigint('amount', { mode: 'bigint' }).notNull(),
    })),
  }

  const schema = buildGraphQLSchema(tables, mockDb)
  const sdl = printSchema(schema)

  it('generates types for all tables', () => {
    expect(sdl).toContain('type User')
    expect(sdl).toContain('type Transfer')
  })

  it('generates queries for all tables', () => {
    expect(sdl).toContain('user(id: String!): User')
    expect(sdl).toContain('users(')
    expect(sdl).toContain('transfer(id: String!): Transfer')
    expect(sdl).toContain('transfers(')
  })

  it('generates page types for all tables', () => {
    expect(sdl).toContain('type UserPage')
    expect(sdl).toContain('type TransferPage')
  })

  it('generates filter types for all tables', () => {
    expect(sdl).toContain('input UserFilter')
    expect(sdl).toContain('input TransferFilter')
  })
})
