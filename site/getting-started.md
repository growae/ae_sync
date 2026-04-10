# Getting Started

aesync is a contract indexing framework for the Aeternity blockchain. It reads events from ae_mdw, processes them through your TypeScript handlers, stores the results in PostgreSQL, and serves the data via auto-generated GraphQL APIs.

## Prerequisites

- **Node.js** 20 or later
- **pnpm** (recommended) or npm

## Scaffold a New Project

The fastest way to start is with `create-aesync`:

```bash
npx @growae/create-aesync my-indexer
cd my-indexer
pnpm install
```

## Project Structure

The scaffolded project looks like this:

```
my-indexer/
  src/
    aesync.config.ts    # Network, database, and contract config
    schema.ts            # onchainTable definitions
    index.ts             # Event handler functions
    api/
      index.ts           # Custom Hono API routes (optional)
  package.json
  tsconfig.json
```

### `aesync.config.ts`

Defines which network to connect to, the database backend, and which contracts to index:

```typescript
import { createConfig } from '@growae/aesync'

export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: 'https://mainnet.aeternity.io/mdw',
  },
  contracts: {
    MyToken: {
      address: 'ct_...',
      aci: myTokenAci,
      startHeight: 800000,
    },
  },
})
```

### `schema.ts`

Defines the tables that your event handlers write to:

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

### `index.ts`

Contains event handler functions that run when matching contract events are detected:

```typescript
import type { EventCallbackFn } from '@growae/aesync'
import { transfers } from './schema'

export const MyToken_Transfer: EventCallbackFn = async ({ event, context }) => {
  await context.db.insert(transfers).values({
    id: event.txHash,
    from: event.args.from,
    to: event.args.to,
    amount: event.args.value,
    height: context.network.height,
  })
}
```

Handler names follow the pattern `ContractName_EventName`.

## Run Locally

Start the development server with hot-reload:

```bash
pnpm aesync dev
```

This will:
1. Load your config and compile contract ACIs
2. Create database tables (PGlite by default -- no Postgres install needed)
3. Backfill historical events from ae_mdw
4. Switch to real-time WebSocket sync
5. Start the HTTP server on `http://localhost:42069`

## Query Your Data

Open the GraphQL playground at `http://localhost:42069/graphql` and run a query:

```graphql
{
  transfers(first: 10, orderBy: "height", orderDirection: DESC) {
    items {
      id
      from
      to
      amount
      height
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

Every table defined with `onchainTable` automatically gets:
- A singular query (e.g. `transfer(id: "...")`) for lookups by primary key
- A plural query (e.g. `transfers(...)`) with filtering, ordering, and cursor-based pagination

## Next Steps

- [Installation](/installation) -- manual setup and Docker options
- [Contracts](/guides/contracts) -- configuring contracts and ACIs
- [Schemas](/guides/schemas) -- column types and indexes
- [Event Handlers](/guides/event-handlers) -- the context API in detail
- [API Routes](/guides/api-routes) -- adding custom Hono endpoints
