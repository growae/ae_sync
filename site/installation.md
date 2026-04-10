# Installation

## Quick Start (Scaffolder)

```bash
npx @growae/create-aesync my-indexer
cd my-indexer
pnpm install
```

This sets up a complete project with config, schema, and handler files.

## Manual Setup

### 1. Create a project

```bash
mkdir my-indexer && cd my-indexer
pnpm init
pnpm add @growae/aesync
```

### 2. Configure TypeScript

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

### 3. Create your config

```typescript
// src/ae-sync.config.ts
import { createConfig } from '@growae/aesync'

export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: 'https://mainnet.aeternity.io/mdw',
  },
  contracts: {
    MyContract: {
      address: 'ct_...',
      aci: myContractAci,
    },
  },
})
```

### 4. Define your schema

```typescript
// src/schema.ts
import { onchainTable, text, integer } from '@growae/aesync'

export const events = onchainTable('events', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  height: integer('height').notNull(),
})
```

### 5. Write handlers

```typescript
// src/index.ts
import type { EventCallbackFn } from '@growae/aesync'
import { events } from './schema'

export const MyContract_MyEvent: EventCallbackFn = async ({ event, context }) => {
  await context.db.insert(events).values({
    id: event.txHash,
    name: event.name,
    height: context.network.height,
  })
}
```

### 6. Add scripts to package.json

```json
{
  "scripts": {
    "dev": "ae-sync dev",
    "start": "ae-sync start",
    "codegen": "ae-sync codegen"
  }
}
```

## Database Options

### PGlite (default)

No configuration needed. ae_sync uses an embedded PGlite instance stored in `.ae-sync/pglite/`. This is ideal for development -- no Postgres installation required.

### PostgreSQL

For production, use a real PostgreSQL database:

```typescript
export default createConfig({
  // ...
  database: {
    kind: 'postgres',
    connectionString: 'postgresql://user:pass@localhost:5432/mydb',
  },
})
```

You can also set the connection string via the `DATABASE_URL` environment variable:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb pnpm ae-sync start
```

### Connection Pool

Configure the connection pool for PostgreSQL:

```typescript
database: {
  kind: 'postgres',
  connectionString: 'postgresql://...',
  poolConfig: { max: 10 },
}
```

## Docker

See the [Docker guide](/guides/docker) for containerized deployment options.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | (uses PGlite) |
| `AE_MDW_URL` | ae_mdw HTTP endpoint | (from config) |
| `AE_MDW_WS_URL` | ae_mdw WebSocket endpoint | (from config) |
| `AE_NODE_URL` | Aeternity node URL | (from config) |

Environment variables override values set in `ae-sync.config.ts`.
