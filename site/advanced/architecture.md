# Architecture

This page describes ae_sync's internal architecture for contributors and advanced users.

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                        ae_sync                          │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐    │
│  │  Build    │──▶│  Config  │──▶│  ACI Compiler    │    │
│  │  System   │   │          │   │  (event hashes,  │    │
│  │ (Vite)    │   │          │   │   type codegen)  │    │
│  └──────────┘   └──────────┘   └──────────────────┘    │
│       │                              │                  │
│       ▼                              ▼                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐    │
│  │  Schema   │──▶│ Database │──▶│  Shadow Tables   │    │
│  │ (Drizzle) │   │ (PGlite │   │  (reorg safety)  │    │
│  │          │   │  or PG)  │   │                  │    │
│  └──────────┘   └──────────┘   └──────────────────┘    │
│       │              │                                  │
│       ▼              ▼                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐    │
│  │ GraphQL  │   │ Indexing │◀──│   Sync Engine    │    │
│  │ Schema   │   │ Engine   │   │  (backfill +     │    │
│  │ Builder  │   │ (cache + │   │   realtime)      │    │
│  │          │   │  flush)  │   │                  │    │
│  └────┬─────┘   └──────────┘   └────────┬─────────┘    │
│       │                                  │              │
│       ▼                                  ▼              │
│  ┌──────────────────────────────────────────────────┐   │
│  │              HTTP Server (Hono)                   │   │
│  │  /graphql    /health    /ready    /api/*          │   │
│  └──────────────────────────────────────────────────┘   │
│                          │                              │
└──────────────────────────┼──────────────────────────────┘
                           │
                    ┌──────▼───────┐
                    │   ae_mdw     │
                    │ (HTTP + WS)  │
                    └──────────────┘
```

## Core Modules

### Build System

The build system uses Vite and `vite-node` to compile the user's TypeScript project at runtime. It:

- Loads `ae-sync.config.ts` via `vite-node`
- Compiles contract ACIs and computes event topic hashes
- Discovers `schema.ts` exports (tables defined with `onchainTable`)
- Discovers `index.ts` exports (event handler functions)
- Optionally discovers `api/index.ts` (custom Hono routes)
- Generates `ae-sync-env.d.ts` with typed event interfaces
- In dev mode, watches files for changes and triggers rebuilds

### Config System

`createConfig()` validates and resolves the user's configuration:

- Applies environment variable fallbacks (`DATABASE_URL`, `AE_MDW_URL`, etc.)
- Merges user config with defaults (PGlite database, port 42069, finality depth 20)
- Validates that required fields are present
- Returns a frozen config object

### ACI Processing

The ACI module handles Aeternity's Application Call Interface:

- **Parser** -- extracts event definitions from ACI JSON
- **Hash** -- computes keccak-256 topic hashes for event names
- **Decoder** -- decodes raw event data into typed arguments using the ACI schema
- **Codegen** -- generates TypeScript type definitions from ACI event schemas

### Schema System

`onchainTable` wraps Drizzle's `pgTable` with a brand marker. The schema system:

- Provides Aeternity-specific column helpers (`aeAddress`, `aeAmount`, `aeTxHash`, `aeBlockHash`)
- Re-exports all standard Drizzle column types and index builders
- Tags tables with `ONCHAIN_TABLE_MARKER` for runtime discovery
- Defines internal tables (`_aesync_meta`, `_aesync_contract_state`, `_aesync_checkpoint`)

### Database Layer

Supports two backends:

- **PGlite** -- embedded PostgreSQL for development (no install needed)
- **PostgreSQL** -- standard connection pool for production

The database module handles:
- Creating and connecting to the database
- Running migrations for `onchainTable` definitions
- Shadow table creation for reorg protection
- Checkpoint persistence for sync state

### Shadow Tables

For each `onchainTable`, ae_sync creates a shadow table (`_reorg__<tablename>`) that stores previous row states. When a chain reorganization is detected:

1. The sync engine identifies the common ancestor block
2. `revertToHeight()` restores rows from shadow tables to their pre-reorg state
3. Indexing resumes from the correct height

Shadow rows older than `finalityDepth` blocks are pruned by `pruneFinalized()`.

### Sync Engine

The sync engine coordinates data fetching and processing:

#### Historical Backfill
1. Reads the last checkpoint height for each contract
2. Fetches contract logs from ae_mdw in paginated batches
3. Matches events by topic hash against configured contracts
4. Calls the appropriate event handler functions
5. Persists checkpoint state after each batch

#### Real-time Sync
1. Opens a WebSocket connection to ae_mdw
2. Listens for new key-block notifications
3. Fetches contract logs for each new block
4. Processes events through handlers
5. Updates checkpoint state

#### Factory Tracking
The factory tracker watches for configured factory events and extracts child contract addresses. Newly discovered addresses are added to the sync targets immediately.

### Indexing Engine

The indexing engine manages the handler execution lifecycle:

- **Cache** -- batches writes (inserts, updates, deletes) in memory during handler execution
- **Context** -- provides the `context.db` API to handlers
- **Executor** -- runs handler functions and flushes the cache to the database
- **Batch processing** -- multiple events in the same block are processed together

The cache-and-flush pattern ensures efficient bulk inserts and transactional consistency within each block.

### GraphQL Schema Builder

`buildGraphQLSchema()` takes the discovered tables and generates a complete GraphQL schema:

- Each table becomes a GraphQL object type
- Column types map to GraphQL scalars (`Int`, `Float`, `String`, `Boolean`, `BigInt`, `JSON`)
- Singular queries for primary key lookups
- Plural queries with cursor pagination, ordering, and filtering
- Filter input types with operators (`_not`, `_gt`, `_gte`, `_lt`, `_lte`, `_in`, `_contains`, `_starts_with`)

### HTTP Server

Built on Hono, the server provides:

- `/graphql` -- auto-generated GraphQL API
- `/health` -- health check with sync status for each contract
- `/ready` -- readiness probe (200 when all contracts are in realtime sync)
- Custom routes from `src/api/index.ts`
- CORS middleware and request logging

## Data Flow

1. ae_mdw provides contract event data (HTTP for historical, WebSocket for real-time)
2. The sync engine fetches and matches events to configured contracts
3. Event handlers run with the decoded event data and a database context
4. The indexing cache batches database writes
5. On flush, writes are committed to PostgreSQL in a transaction
6. Shadow table entries are created for reorg safety
7. The GraphQL API reads from the same database for queries
