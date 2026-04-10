# DEX Indexer

This example builds a complete DEX indexer for an Aeternity decentralized exchange. It tracks pair creation, swaps, liquidity events, and token metadata using the factory contract pattern.

## Overview

The DEX consists of three contracts:
- **Factory** -- creates trading pair contracts
- **Pair** -- holds liquidity for a token pair, handles swaps
- **Router** -- high-level swap interface (optional for indexing)

## Project Setup

```bash
npx @growae/create-aesync dex-indexer
cd dex-indexer
pnpm install
```

## Contract Configuration

```typescript
// src/ae-sync.config.ts
import { createConfig } from '@growae/aesync'
import factoryAci from './abis/factory.json'
import pairAci from './abis/pair.json'

export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: 'https://mainnet.aeternity.io/mdw',
  },
  database: {
    kind: 'postgres',
    connectionString: process.env.DATABASE_URL,
  },
  contracts: {
    Factory: {
      address: 'ct_factory_address_here',
      aci: factoryAci,
      startHeight: 800000,
    },
    Pair: {
      aci: pairAci,
      factory: {
        contract: 'Factory',
        event: 'PairCreated',
        parameter: 'pair',
      },
    },
  },
})
```

The `Pair` contract uses the factory pattern -- its addresses are discovered dynamically when `Factory.PairCreated` events fire.

## Schema Definitions

```typescript
// src/schema.ts
import {
  onchainTable,
  text,
  integer,
  bigint,
  aeAddress,
  aeAmount,
  aeTxHash,
  index,
} from '@growae/aesync'

export const tokens = onchainTable('tokens', {
  address: aeAddress('address').primaryKey(),
  name: text('name'),
  symbol: text('symbol'),
  decimals: integer('decimals').notNull().default(18),
})

export const pairs = onchainTable(
  'pairs',
  {
    address: aeAddress('address').primaryKey(),
    token0: aeAddress('token0').notNull(),
    token1: aeAddress('token1').notNull(),
    reserve0: aeAmount('reserve0').notNull().default('0'),
    reserve1: aeAmount('reserve1').notNull().default('0'),
    totalSupply: aeAmount('total_supply').notNull().default('0'),
    createdAtHeight: integer('created_at_height').notNull(),
    swapCount: integer('swap_count').notNull().default(0),
  },
  (table) => [
    index('pairs_token0_idx').on(table.token0),
    index('pairs_token1_idx').on(table.token1),
  ],
)

export const swaps = onchainTable(
  'swaps',
  {
    id: text('id').primaryKey(),
    pair: aeAddress('pair').notNull(),
    sender: aeAddress('sender').notNull(),
    amount0In: aeAmount('amount0_in').notNull(),
    amount1In: aeAmount('amount1_in').notNull(),
    amount0Out: aeAmount('amount0_out').notNull(),
    amount1Out: aeAmount('amount1_out').notNull(),
    txHash: aeTxHash('tx_hash').notNull(),
    height: integer('height').notNull(),
  },
  (table) => [
    index('swaps_pair_idx').on(table.pair),
    index('swaps_height_idx').on(table.height),
    index('swaps_sender_idx').on(table.sender),
  ],
)

export const liquidityEvents = onchainTable(
  'liquidity_events',
  {
    id: text('id').primaryKey(),
    pair: aeAddress('pair').notNull(),
    sender: aeAddress('sender').notNull(),
    type: text('type').notNull(), // 'mint' or 'burn'
    amount0: aeAmount('amount0').notNull(),
    amount1: aeAmount('amount1').notNull(),
    liquidity: aeAmount('liquidity').notNull(),
    txHash: aeTxHash('tx_hash').notNull(),
    height: integer('height').notNull(),
  },
  (table) => [
    index('liq_events_pair_idx').on(table.pair),
    index('liq_events_height_idx').on(table.height),
  ],
)

export const stats = onchainTable('stats', {
  id: text('id').primaryKey(),
  pairCount: integer('pair_count').notNull().default(0),
  totalSwapCount: integer('total_swap_count').notNull().default(0),
})
```

## Event Handlers

```typescript
// src/index.ts
import { eq, sql } from 'drizzle-orm'
import type { EventCallbackFn } from '@growae/aesync'
import { tokens, pairs, swaps, liquidityEvents, stats } from './schema'

// Initialize global stats on first run
async function ensureStats(context: { db: any }) {
  const existing = await context.db
    .select()
    .from(stats)
    .where(eq(stats.id, 'global'))
  if (existing.length === 0) {
    await context.db.insert(stats).values({ id: 'global' })
  }
}

// --- Factory Events ---

export const Factory_PairCreated: EventCallbackFn = async ({ event, context }) => {
  const { pair, token0, token1 } = event.args as {
    pair: string
    token0: string
    token1: string
  }

  // Ensure token records exist
  for (const addr of [token0, token1]) {
    const existing = await context.db
      .select()
      .from(tokens)
      .where(eq(tokens.address, addr))
    if (existing.length === 0) {
      await context.db.insert(tokens).values({ address: addr })
    }
  }

  // Create the pair record
  await context.db.insert(pairs).values({
    address: pair,
    token0,
    token1,
    createdAtHeight: context.network.height,
  })

  // Update global stats
  await ensureStats(context)
  await context.db.execute(
    sql`UPDATE stats SET pair_count = pair_count + 1 WHERE id = 'global'`
  )
}

// --- Pair Events ---

export const Pair_Swap: EventCallbackFn = async ({ event, context }) => {
  const args = event.args as {
    sender: string
    amount0_in: bigint
    amount1_in: bigint
    amount0_out: bigint
    amount1_out: bigint
  }

  await context.db.insert(swaps).values({
    id: `${event.txHash}-${event.logIndex}`,
    pair: event.contractId,
    sender: args.sender,
    amount0In: args.amount0_in.toString(),
    amount1In: args.amount1_in.toString(),
    amount0Out: args.amount0_out.toString(),
    amount1Out: args.amount1_out.toString(),
    txHash: event.txHash,
    height: event.height,
  })

  // Increment pair swap count
  await context.db.execute(
    sql`UPDATE pairs SET swap_count = swap_count + 1 WHERE address = ${event.contractId}`
  )

  // Increment global swap count
  await ensureStats(context)
  await context.db.execute(
    sql`UPDATE stats SET total_swap_count = total_swap_count + 1 WHERE id = 'global'`
  )
}

export const Pair_Mint: EventCallbackFn = async ({ event, context }) => {
  const args = event.args as {
    sender: string
    amount0: bigint
    amount1: bigint
    liquidity: bigint
  }

  await context.db.insert(liquidityEvents).values({
    id: `${event.txHash}-${event.logIndex}`,
    pair: event.contractId,
    sender: args.sender,
    type: 'mint',
    amount0: args.amount0.toString(),
    amount1: args.amount1.toString(),
    liquidity: args.liquidity.toString(),
    txHash: event.txHash,
    height: event.height,
  })
}

export const Pair_Burn: EventCallbackFn = async ({ event, context }) => {
  const args = event.args as {
    sender: string
    amount0: bigint
    amount1: bigint
    liquidity: bigint
  }

  await context.db.insert(liquidityEvents).values({
    id: `${event.txHash}-${event.logIndex}`,
    pair: event.contractId,
    sender: args.sender,
    type: 'burn',
    amount0: args.amount0.toString(),
    amount1: args.amount1.toString(),
    liquidity: args.liquidity.toString(),
    txHash: event.txHash,
    height: event.height,
  })
}

export const Pair_Sync: EventCallbackFn = async ({ event, context }) => {
  const { reserve0, reserve1 } = event.args as {
    reserve0: bigint
    reserve1: bigint
  }

  await context.db
    .update(pairs)
    .set({
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
    })
    .where(eq(pairs.address, event.contractId))
}
```

## Custom API Routes

```typescript
// src/api/index.ts
import { sql } from 'drizzle-orm'

export const routes = [
  {
    method: 'GET',
    path: '/api/stats',
    handler: async (c: any) => {
      return c.json({
        message: 'Use the GraphQL API at /graphql for queries',
      })
    },
  },
  {
    method: 'GET',
    path: '/api/pairs/:address/ohlcv',
    handler: async (c: any) => {
      const address = c.req.param('address')
      return c.json({
        pair: address,
        candles: [],
      })
    },
  },
]

export const middleware = []
```

## GraphQL Queries

Once running, query the DEX data:

### List all pairs

```graphql
query {
  pairs(first: 20, orderBy: "swapCount", orderDirection: DESC) {
    items {
      address
      token0
      token1
      reserve0
      reserve1
      swapCount
      createdAtHeight
    }
    pageInfo {
      hasNextPage
    }
  }
}
```

### Recent swaps for a pair

```graphql
query {
  swaps(
    where: { pair: "ct_pair_address" }
    first: 50
    orderBy: "height"
    orderDirection: DESC
  ) {
    items {
      id
      sender
      amount0In
      amount1Out
      height
      txHash
    }
  }
}
```

### Liquidity events

```graphql
query {
  liquidityEvents(
    where: { type: "mint", pair: "ct_pair_address" }
    first: 20
    orderBy: "height"
    orderDirection: DESC
  ) {
    items {
      sender
      amount0
      amount1
      liquidity
      height
    }
  }
}
```

## Running

```bash
# Development (PGlite)
pnpm ae-sync dev

# Production
DATABASE_URL=postgresql://user:pass@localhost:5432/dex pnpm ae-sync start
```

## Key Takeaways

- **Factory pattern** discovers pair contract addresses automatically
- **Event handlers** follow the `ContractName_EventName` convention
- **Schema** uses Aeternity column helpers (`aeAddress`, `aeAmount`) for type safety
- **GraphQL** is auto-generated with filtering on every column
- **Custom routes** can be added for specialized endpoints like OHLCV data
