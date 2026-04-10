# onchainTable

Creates a table definition that ae_sync manages. Tables created with `onchainTable` are automatically migrated, backed by shadow tables for reorg protection, and exposed through the GraphQL API.

## Import

```typescript
import { onchainTable } from '@growae/aesync'
```

## Usage

```typescript
import { onchainTable, text, integer, aeAddress, aeAmount } from '@growae/aesync'

export const transfers = onchainTable('transfers', {
  id: text('id').primaryKey(),
  from: aeAddress('from').notNull(),
  to: aeAddress('to').notNull(),
  amount: aeAmount('amount').notNull(),
  height: integer('height').notNull(),
})
```

## Signature

```typescript
function onchainTable<TTableName extends string, TColumnsMap>(
  name: TTableName,
  columns: TColumnsMap | ((columnTypes: PgColumnsBuilders) => TColumnsMap),
  extraConfig?: (self: BuildExtraConfigColumns) => PgTableExtraConfigValue[],
): OnchainTable
```

### Parameters

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | PostgreSQL table name |
| `columns` | `object \| function` | Column definitions (object or callback style) |
| `extraConfig` | `function` | Optional indexes and constraints |

## Column Types

### Standard Columns

All Drizzle `pg-core` column types are re-exported:

```typescript
import {
  text, varchar, integer, bigint, serial,
  boolean, real, doublePrecision, numeric,
  timestamp, json, jsonb,
} from '@growae/aesync'
```

### Aeternity Helpers

```typescript
import { aeAddress, aeAmount, aeTxHash, aeBlockHash } from '@growae/aesync'
```

| Helper | Maps To | Purpose |
|---|---|---|
| `aeAddress(name)` | `text(name)` | Aeternity addresses (`ak_...`, `ct_...`) |
| `aeAmount(name)` | `numeric(name, { precision: 78, scale: 0 })` | Token amounts (matches Sophia `int`) |
| `aeTxHash(name)` | `text(name)` | Transaction hashes (`th_...`) |
| `aeBlockHash(name)` | `text(name)` | Block hashes (`mh_...`, `kh_...`) |

## Indexes

```typescript
import { onchainTable, text, aeAddress, index, uniqueIndex, primaryKey } from '@growae/aesync'

export const balances = onchainTable(
  'balances',
  {
    token: aeAddress('token').notNull(),
    owner: aeAddress('owner').notNull(),
    amount: text('amount').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.token, table.owner] }),
    index('balances_owner_idx').on(table.owner),
  ],
)
```

## Callback-Style Columns

```typescript
export const events = onchainTable('events', (t) => ({
  id: t.text('id').primaryKey(),
  name: t.text('name').notNull(),
  data: t.jsonb('data'),
  height: t.integer('height').notNull(),
}))
```

## Type Inference

Extract TypeScript types from table definitions:

```typescript
import type { InferTableSelect, InferTableInsert } from '@growae/aesync'

type Transfer = InferTableSelect<typeof transfers>
type NewTransfer = InferTableInsert<typeof transfers>
```

## How It Works

`onchainTable` is a thin wrapper around Drizzle's `pgTable` that brands the table with an internal marker (`ONCHAIN_TABLE_MARKER`). This marker lets ae_sync distinguish your indexing tables from arbitrary Drizzle tables at runtime.

At startup, ae_sync:
1. Discovers all exported `onchainTable` definitions from `schema.ts`
2. Runs migrations to create or update the tables
3. Creates corresponding shadow tables (`_reorg__<tablename>`) for reorg protection
4. Registers the tables with the GraphQL schema builder

You can check if a table was created with `onchainTable` using:

```typescript
import { isOnchainTable } from '@growae/aesync'

isOnchainTable(transfers) // true
isOnchainTable(someOtherTable) // false
```
