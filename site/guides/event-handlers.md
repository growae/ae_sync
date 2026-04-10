# Event Handlers

Event handlers are TypeScript functions that aesync calls when it detects matching contract events. They receive the decoded event data and a context object for database operations.

## Naming Convention

Handler names follow the pattern `ContractName_EventName`:

```typescript
// Handles the "Transfer" event from the "Token" contract
export const Token_Transfer: EventCallbackFn = async ({ event, context }) => {
  // ...
}
```

The contract name must match a key in your `contracts` config, and the event name must match an event defined in the contract's ACI.

## Handler Signature

```typescript
import type { EventCallbackFn } from '@growae/aesync'

export const Token_Transfer: EventCallbackFn = async ({ event, context }) => {
  // event  - the decoded event data
  // context - database access and metadata
}
```

## The `event` Object

Each event provides:

| Property | Type | Description |
|---|---|---|
| `name` | `string` | Event name (e.g. `"Transfer"`) |
| `args` | `Record<string, unknown>` | Decoded event arguments from the ACI |
| `contractId` | `string` | Contract address that emitted the event |
| `txHash` | `string` | Transaction hash |
| `blockHash` | `string` | Micro-block hash |
| `height` | `number` | Key-block height |
| `logIndex` | `number` | Position of this log in the transaction |

```typescript
export const Token_Transfer: EventCallbackFn = async ({ event, context }) => {
  const { from, to, value } = event.args as {
    from: string
    to: string
    value: bigint
  }

  await context.db.insert(transfers).values({
    id: `${event.txHash}-${event.logIndex}`,
    from,
    to,
    amount: value.toString(),
    height: event.height,
  })
}
```

## The `context` Object

### `context.db`

The database interface provides a Drizzle-like API:

#### Insert

```typescript
await context.db.insert(transfers).values({
  id: event.txHash,
  from: event.args.from,
  to: event.args.to,
  amount: event.args.value,
  height: context.network.height,
})
```

Insert multiple rows:

```typescript
await context.db.insert(transfers).values([
  { id: '1', from: 'ak_...', to: 'ak_...', amount: '100', height: 1 },
  { id: '2', from: 'ak_...', to: 'ak_...', amount: '200', height: 1 },
])
```

#### Update

```typescript
import { eq } from 'drizzle-orm'

await context.db
  .update(tokens)
  .set({ totalSupply: newSupply.toString() })
  .where(eq(tokens.address, event.contractId))
```

#### Select

```typescript
import { eq } from 'drizzle-orm'

const rows = await context.db
  .select()
  .from(tokens)
  .where(eq(tokens.address, event.contractId))

if (rows.length > 0) {
  const token = rows[0]
  // ...
}
```

#### Delete

```typescript
import { eq } from 'drizzle-orm'

await context.db.delete(positions).where(eq(positions.id, positionId))
```

#### Raw SQL

```typescript
import { sql } from 'drizzle-orm'

await context.db.execute(
  sql`UPDATE tokens SET total_supply = total_supply + ${amount} WHERE address = ${addr}`
)
```

### `context.network`

Access network metadata:

```typescript
context.network.name    // "mainnet", "testnet", etc.
context.network.height  // current key-block height
```

### `context.contracts`

Register dynamically-discovered contract addresses (used with [factory contracts](/guides/factory-contracts)):

```typescript
context.contracts.register('Pair', event.args.pairAddress)
```

## Write Batching

aesync batches database writes within each event processing cycle. Inserts, updates, and deletes are collected in an in-memory cache and flushed to the database together. This means:

- Multiple inserts to the same table within one handler are batched into a single SQL statement
- You don't need to worry about transaction management -- aesync handles it
- Reads via `context.db.select()` hit the database directly and will not see unflushed writes from the current batch

## Common Patterns

### Upsert (create or update)

```typescript
export const Token_Transfer: EventCallbackFn = async ({ event, context }) => {
  const { from, to, value } = event.args as {
    from: string; to: string; value: bigint
  }

  // Update sender balance
  const fromRows = await context.db
    .select()
    .from(balances)
    .where(eq(balances.owner, from))

  if (fromRows.length > 0) {
    const current = BigInt(fromRows[0].amount)
    await context.db
      .update(balances)
      .set({ amount: (current - value).toString() })
      .where(eq(balances.owner, from))
  }

  // Update receiver balance
  const toRows = await context.db
    .select()
    .from(balances)
    .where(eq(balances.owner, to))

  if (toRows.length > 0) {
    const current = BigInt(toRows[0].amount)
    await context.db
      .update(balances)
      .set({ amount: (current + value).toString() })
      .where(eq(balances.owner, to))
  } else {
    await context.db.insert(balances).values({
      owner: to,
      amount: value.toString(),
    })
  }
}
```

### Aggregate counters

```typescript
export const Factory_PairCreated: EventCallbackFn = async ({ event, context }) => {
  await context.db.insert(pairs).values({
    address: event.args.pair,
    token0: event.args.token0,
    token1: event.args.token1,
    createdAt: context.network.height,
  })

  // Update global stats
  await context.db.execute(
    sql`UPDATE stats SET pair_count = pair_count + 1 WHERE id = 'global'`
  )
}
```
