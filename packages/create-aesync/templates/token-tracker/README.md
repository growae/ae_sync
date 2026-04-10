# {{PROJECT_NAME}}

An AEX-9 token tracker built with [ae-sync](https://aesync.dev).

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Project Structure

```
├── ae-sync.config.ts   # Token contract configuration
├── schema.ts           # transferEvent, balanceState tables
├── src/
│   ├── index.ts        # Transfer handler with balance tracking
│   └── api/
│       └── index.ts    # /balances, /transfers endpoints
├── abis/               # AEX-9 Token ACI
└── .env.example        # Environment template
```

## API Endpoints

- `GET /balances` — List token holder balances
- `GET /transfers` — List transfer history
- `GET /graphql` — Auto-generated GraphQL API

## Scripts

- `pnpm dev` — Start dev server with hot reload
- `pnpm start` — Start production server
- `pnpm build` — Build for production
- `pnpm db:migrate` — Run database migrations
- `pnpm db:reset` — Reset database
