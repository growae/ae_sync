# {{PROJECT_NAME}}

A DEX indexer built with [ae-sync](https://aesync.dev).

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Project Structure

```
├── ae-sync.config.ts   # Factory + Pair contract configuration
├── schema.ts           # swapEvent, pairState, liquidityEvent tables
├── src/
│   ├── factory.ts      # PairCreated event handler
│   ├── pair.ts         # Swap, Mint, Burn event handlers
│   └── api/
│       └── index.ts    # /pairs, /volume endpoints
├── abis/               # PairFactory & Pair ACIs
└── .env.example        # Environment template
```

## API Endpoints

- `GET /pairs` — List all indexed pairs
- `GET /volume` — Aggregate swap volume
- `GET /graphql` — Auto-generated GraphQL API

## Scripts

- `pnpm dev` — Start dev server with hot reload
- `pnpm start` — Start production server
- `pnpm build` — Build for production
- `pnpm db:migrate` — Run database migrations
- `pnpm db:reset` — Reset database
