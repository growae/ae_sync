# {{PROJECT_NAME}}

An [ae-sync](https://aesync.dev) indexer project.

## Quick Start

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Start development server
pnpm dev
```

## Project Structure

```
├── ae-sync.config.ts   # Contract & network configuration
├── schema.ts           # Database table definitions
├── src/
│   ├── index.ts        # Event handlers
│   └── api/
│       └── index.ts    # Custom API routes
├── abis/               # Sophia contract ACIs
└── .env.example        # Environment template
```

## Scripts

- `pnpm dev` — Start dev server with hot reload
- `pnpm start` — Start production server
- `pnpm build` — Build for production
- `pnpm db:migrate` — Run database migrations
- `pnpm db:reset` — Reset database
