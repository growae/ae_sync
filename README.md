# aesync

Contract indexing framework for Aeternity, built on top of [ae_mdw](https://github.com/aeternity/ae_mdw). Define contracts, schemas, and event handlers in TypeScript — aesync handles the rest.

Think [Ponder](https://ponder.sh) for Aeternity.

## Features

- **Sophia-native** — Typed events extracted from Sophia ACI. No manual decoding.
- **ae_mdw built in** — Ships with ae_mdw bundled. One container, zero external dependencies.
- **Auto-generated APIs** — GraphQL and REST endpoints generated from your schema definitions.
- **Reorg-safe** — Shadow tables and checkpoint tracking handle chain reorganizations automatically.
- **Hot reload** — Vite-based build system with selective restart on file changes.
- **Dual database** — PGlite for development, PostgreSQL for production.

## Quick Start

```bash
npx @growae/create-aesync my-indexer
cd my-indexer
pnpm dev
```

## How It Works

**1. Define contracts** in `aesync.config.ts`:

```typescript
import { createConfig } from '@growae/aesync'
import PairAci from './abis/Pair.json'

export default createConfig({
  network: { name: 'mainnet' },
  contracts: {
    DexPair: {
      aci: PairAci,
      address: 'ct_...',
      startHeight: 600000,
    },
  },
})
```

**2. Define schemas** in `schema.ts`:

```typescript
import { onchainTable, aeAddress, aeAmount } from '@growae/aesync'

export const swapEvent = onchainTable('swap_event', {
  id: text('id').primaryKey(),
  pair: aeAddress('pair').notNull(),
  sender: aeAddress('sender').notNull(),
  amountIn: aeAmount('amount_in').notNull(),
  amountOut: aeAmount('amount_out').notNull(),
  height: integer('height').notNull(),
})
```

**3. Write handlers** in `src/index.ts`:

```typescript
import { aesync } from 'aesync:registry'
import { swapEvent } from 'aesync:schema'

aesync.on('DexPair:Swap', async ({ event, context }) => {
  await context.db.insert(swapEvent).values({
    id: `${event.txHash}-${event.logIndex}`,
    pair: event.contractId,
    sender: event.args.sender,
    amountIn: event.args.amount0In,
    amountOut: event.args.amount1Out,
    height: event.height,
  })
})
```

**4. Query your data** via auto-generated GraphQL:

```graphql
{
  swapEvents(first: 10, orderBy: "height", orderDirection: DESC) {
    items {
      id
      pair
      sender
      amountIn
      amountOut
    }
    pageInfo { hasNextPage endCursor }
  }
}
```

## Packages

| Package | Description |
|---------|-------------|
| [`@growae/aesync`](packages/core) | Core framework — sync engine, database, GraphQL, CLI |
| [`@growae/aesync-client`](packages/client) | Typed client SDK with SQL-over-HTTP and GraphQL |
| [`@growae/create-aesync`](packages/create-aesync) | Project scaffolding CLI with starter templates |

## CLI

```bash
aesync dev          # Development mode with hot reload + PGlite
aesync start        # Production mode with PostgreSQL
aesync serve        # API-only mode (no indexing)
aesync codegen      # Generate type declarations
aesync db list      # Show database state
aesync db reset     # Reset all tables
```

## Architecture

```
aesync.config.ts    ─── Contracts + ACI + network
schema.ts            ─── Drizzle tables (onchainTable)
src/*.ts             ─── Event handlers (aesync.on)
src/api/index.ts     ─── Custom Hono routes
        │
        ▼
┌──────────────────────────────────────────┐
│  aesync                                 │
│                                          │
│  Build System (Vite + virtual modules)   │
│         │                                │
│         ▼                                │
│  Sync Engine ◄── ae_mdw HTTP/WS ──────┐ │
│    │ historical backfill               │ │
│    │ realtime following                │ │
│    │ reorg detection                   │ │
│    ▼                                   │ │
│  Indexing Store                        │ │
│    │ batched cache                     │ │
│    │ handler execution                 │ │
│    │ shadow tables (reorg safety)      │ │
│    ▼                                   │ │
│  PostgreSQL / PGlite                   │ │
│    │                                   │ │
│    ▼                                   │ │
│  API Server (Hono)                     │ │
│    │ auto-generated GraphQL            │ │
│    │ /sql read-only endpoint           │ │
│    │ /health /ready /status            │ │
│    │ custom routes                     │ │
└────┼───────────────────────────────────┘ │
     ▼                                     │
  :42069                            ae_mdw :4000
```

## Docker

**Bundled** (ae_mdw + aesync + PostgreSQL in one container):

```bash
docker compose up
```

**Separate** (connect to external ae_mdw and PostgreSQL):

```bash
docker compose -f docker-compose.separate.yml up
```

## Development

```bash
pnpm install          # Install dependencies
pnpm test             # Run tests (295 passing)
pnpm check:types      # Type check all packages
pnpm build            # Build all packages
pnpm bench            # Run performance benchmarks
pnpm docs:dev         # Start docs site locally
```

### Project Structure

```
ae_sync/
├── packages/
│   ├── core/              # @growae/aesync
│   │   └── src/
│   │       ├── aci/       # Sophia ACI parser + event hashing
│   │       ├── bin/       # CLI commands
│   │       ├── build/     # Vite plugin + virtual modules
│   │       ├── config/    # createConfig + validation
│   │       ├── database/  # PGlite + PostgreSQL + shadow tables
│   │       ├── graphql/   # Schema generation + resolvers
│   │       ├── indexing/  # Cache + handler execution
│   │       ├── mdw/       # ae_mdw HTTP + WebSocket client
│   │       ├── schema/    # onchainTable + column helpers
│   │       ├── server/    # Hono server + /sql endpoint
│   │       └── sync/      # Backfill + realtime + reorg
│   ├── client/            # @growae/aesync-client
│   └── create-aesync/     # Scaffolding CLI + templates
├── site/                  # VitePress documentation
├── examples/
│   └── grow-dex-indexer/  # Production DEX indexer example
├── docker/                # supervisord, entrypoint, healthcheck
├── Dockerfile             # Full image (ae_mdw + aesync + PostgreSQL)
├── Dockerfile.slim        # Slim image (aesync only)
└── docker-compose.yml
```

## License

[MIT](LICENSE)
