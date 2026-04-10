# Schemas

Schemas define the PostgreSQL tables that your event handlers write to. aesync uses Drizzle ORM under the hood and provides `onchainTable` as a branded wrapper around `pgTable`.

## Defining Tables

Use `onchainTable` to create tables that aesync manages. These tables are:
- Automatically created on startup via migrations
- Backed by shadow tables for reorg protection
- Exposed through the auto-generated GraphQL API

```typescript
// src/schema.ts
import { onchainTable, text, integer, aeAddress, aeAmount } from '@growae/aesync'

export const transfers = onchainTable('transfers', {
  id: text('id').primaryKey(),
  from: aeAddress('from').notNull(),
  to: aeAddress('to').notNull(),
  amount: aeAmount('amount').notNull(),
  height: integer('height').notNull(),
})
```

## Column Types

aesync re-exports all standard Drizzle column types plus Aeternity-specific helpers.

### Standard Columns

| Function | PostgreSQL Type | TypeScript Type |
|---|---|---|
| `text(name)` | `TEXT` | `string` |
| `varchar(name, { length })` | `VARCHAR(n)` | `string` |
| `integer(name)` | `INTEGER` | `number` |
| `bigint(name, { mode })` | `BIGINT` | `bigint` or `number` |
| `serial(name)` | `SERIAL` | `number` |
| `boolean(name)` | `BOOLEAN` | `boolean` |
| `real(name)` | `REAL` | `number` |
| `doublePrecision(name)` | `DOUBLE PRECISION` | `number` |
| `numeric(name, { precision, scale })` | `NUMERIC(p,s)` | `string` |
| `timestamp(name)` | `TIMESTAMP` | `Date` or `string` |
| `json(name)` | `JSON` | `unknown` |
| `jsonb(name)` | `JSONB` | `unknown` |

### Aeternity Column Helpers

These helpers map to standard Postgres types with semantics matching Sophia types:

| Function | PostgreSQL Type | Use For |
|---|---|---|
| `aeAddress(name)` | `TEXT` | `ak_...` accounts, `ct_...` contracts |
| `aeAmount(name)` | `NUMERIC(78,0)` | Token amounts (Sophia `int` has unlimited precision) |
| `aeTxHash(name)` | `TEXT` | Transaction hashes (`th_...`) |
| `aeBlockHash(name)` | `TEXT` | Block hashes (`mh_...`, `kh_...`) |

```typescript
import { onchainTable, text, integer, aeAddress, aeAmount, aeTxHash } from '@growae/aesync'

export const swaps = onchainTable('swaps', {
  id: text('id').primaryKey(),
  pair: aeAddress('pair').notNull(),
  sender: aeAddress('sender').notNull(),
  amountIn: aeAmount('amount_in').notNull(),
  amountOut: aeAmount('amount_out').notNull(),
  txHash: aeTxHash('tx_hash').notNull(),
  height: integer('height').notNull(),
})
```

## Column Modifiers

Columns support standard Drizzle modifiers:

```typescript
export const tokens = onchainTable('tokens', {
  address: aeAddress('address').primaryKey(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  decimals: integer('decimals').notNull().default(18),
  totalSupply: aeAmount('total_supply').default('0'),
})
```

- `.primaryKey()` -- marks the column as the table's primary key
- `.notNull()` -- adds a NOT NULL constraint
- `.default(value)` -- sets a default value
- `.unique()` -- adds a UNIQUE constraint

## Indexes

Add indexes for query performance:

```typescript
import { onchainTable, text, integer, aeAddress, index } from '@growae/aesync'

export const transfers = onchainTable(
  'transfers',
  {
    id: text('id').primaryKey(),
    from: aeAddress('from').notNull(),
    to: aeAddress('to').notNull(),
    height: integer('height').notNull(),
  },
  (table) => [
    index('transfers_from_idx').on(table.from),
    index('transfers_to_idx').on(table.to),
    index('transfers_height_idx').on(table.height),
  ],
)
```

### Composite and Unique Indexes

```typescript
import { onchainTable, text, aeAddress, uniqueIndex, primaryKey } from '@growae/aesync'

export const balances = onchainTable(
  'balances',
  {
    token: aeAddress('token').notNull(),
    owner: aeAddress('owner').notNull(),
    amount: text('amount').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.token, table.owner] }),
    uniqueIndex('balances_token_owner_idx').on(table.token, table.owner),
  ],
)
```

## Multiple Tables

Export all tables from `schema.ts`. aesync discovers them automatically:

```typescript
export const pairs = onchainTable('pairs', { /* ... */ })
export const swaps = onchainTable('swaps', { /* ... */ })
export const liquidity = onchainTable('liquidity', { /* ... */ })
export const tokens = onchainTable('tokens', { /* ... */ })
```

## Callback-Style Columns

You can also use the callback-style column definition, which provides column type constructors as the argument:

```typescript
export const transfers = onchainTable('transfers', (t) => ({
  id: t.text('id').primaryKey(),
  from: t.text('from').notNull(),
  to: t.text('to').notNull(),
  amount: t.numeric('amount', { precision: 78, scale: 0 }).notNull(),
  height: t.integer('height').notNull(),
}))
```

## Shadow Tables

aesync automatically creates shadow tables (prefixed with `_reorg__`) for each `onchainTable`. These track previous row states and allow the framework to revert data if a chain reorganization occurs. You don't need to interact with shadow tables directly -- they are managed by the sync engine.
