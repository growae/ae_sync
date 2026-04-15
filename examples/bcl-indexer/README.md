# BCL Indexer

A production-ready [aesync](../../README.md) indexer for the **Bonding Curve Launchpad (BCL)** on Aeternity. Tracks token creation, buy/sell transactions, and price changes, then exposes the data through REST and GraphQL APIs.

## What it indexes

| Contract | Events | Purpose |
|---|---|---|
| **CommunityFactory** | `CreateCommunity` | Discovers new BCL tokens on-chain |
| **AffiliationBondingCurveTokenSale** | `Buy`, `Sell`, `PriceChange` | Records trades and price movements |

### Schema

- **`token`** — BCL token metadata (address, name, DAO, community management)
- **`transaction`** — every buy/sell with amounts, fees, and involved token
- **`price_change`** — price movement history per token
- **`token_day_data`** — daily aggregated volume and price snapshots

## Setup

### Prerequisites

- Node.js >= 18
- PostgreSQL 14+

### Local development

```bash
# Install dependencies (from the aesync monorepo root)
pnpm install

# Start Postgres
docker compose up -d

# Copy env and configure
cp .env.example .env
# Edit .env if needed — defaults point to live mainnet MDW

# Run in dev mode (auto-reload)
pnpm dev
```

### Docker (Postgres only)

```bash
docker compose up -d
```

This starts PostgreSQL for the indexer. The indexer itself connects to the live ae-mdw at `mainnet.aeternity.io`.

### Configuration

Edit `aesync.config.ts` to change:
- Network (mainnet/testnet)
- `startHeight` to begin indexing from a specific block
- Database connection

## API

### REST endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/tokens` | List all indexed tokens |
| `GET` | `/tokens/:address` | Single token details |
| `GET` | `/tokens/:address/transactions?limit=50` | Recent buys/sells for a token |
| `GET` | `/tokens/:address/price-history?limit=50` | Price change history for a token |
| `GET` | `/stats` | Global stats (total tokens, buys, sells, price changes) |
| `GET` | `/health` | Sync status and health check |

### GraphQL

Available at `http://localhost:42069/graphql`. Example queries:

```graphql
# All tokens
{
  tokens(first: 10) {
    items {
      address
      name
      daoAddress
      communityManagementAddress
      createdAtHeight
    }
    pageInfo { hasNextPage endCursor }
  }
}

# Recent transactions for a token
{
  transactions(
    first: 20
    where: { tokenSaleAddress: "ct_..." }
    orderBy: "height"
    orderDirection: DESC
  ) {
    items {
      type
      tokenAmount
      aeAmount
      fee
      txHash
      height
    }
  }
}

# Price history
{
  priceChanges(
    first: 30
    where: { tokenSaleAddress: "ct_..." }
    orderBy: "height"
    orderDirection: DESC
  ) {
    items {
      oldPrice
      newPrice
      txHash
      height
    }
  }
}

# Daily aggregated data
{
  tokenDayDatas(
    first: 30
    where: { tokenSaleAddress: "ct_..." }
    orderBy: "date"
    orderDirection: DESC
  ) {
    items {
      date
      dailyBuyCount
      dailySellCount
      dailyBuyVolume
      dailySellVolume
      price
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                 Aeternity                    │
│                 (mainnet)                    │
└─────────┬───────────────────────────────────┘
          │ blocks + contract logs
┌─────────▼───────────────────────────────────┐
│          mainnet.aeternity.io/mdw            │
│            (live middleware)                  │
└─────────┬───────────────────────────────────┘
          │ HTTP + WebSocket
┌─────────▼───────────────────────────────────┐
│             aesync engine                    │
│  ┌────────────┐  ┌───────────────────────┐   │
│  │  Factory   │  │     TokenSale         │   │
│  │  handler   │  │  handlers (per-token) │   │
│  └────┬───────┘  └────┬──────────────────┘   │
│       └──────────┬────┘                      │
│            ┌─────▼──────┐                    │
│            │  PostgreSQL │                    │
│            └─────┬──────┘                    │
│            ┌─────▼──────┐                    │
│            │  REST API  │                    │
│            │  GraphQL   │                    │
│            └────────────┘                    │
└─────────────────────────────────────────────┘
```

## License

MIT
