# Grow DEX Indexer

A production-ready [aesync](../../README.md) indexer for the **Grow DEX** on Aeternity. Tracks pair creation, swaps, liquidity events, and per-day aggregations, then exposes the data through REST and GraphQL APIs.

## What it indexes

| Contract | Events | Purpose |
|---|---|---|
| **GrowFactory** | `PairCreated` | Discovers new trading pairs on-chain |
| **GrowPair** | `Swap`, `Mint`, `Burn`, `Sync` | Records swaps and liquidity, updates reserves |
| **GrowRouter** | `SwapExecuted` | Aggregated router-level swap tracking |

### Schema

- **`token`** — tracked token metadata (address, name, symbol, decimals)
- **`pair`** — trading pair state (reserves, liquidity, creation info)
- **`swap_event`** — every swap with amounts and involved tokens
- **`liquidity_event`** — mint/burn events with provider and amounts
- **`pair_day_data`** — daily aggregated volume and reserve snapshots

## Setup

### Prerequisites

- Node.js >= 18
- PostgreSQL 14+
- A running [ae-mdw](https://github.com/aeternity/ae_mdw) instance (or use the Docker setup below)

### Local development

```bash
# Install dependencies
pnpm install

# Copy env and configure
cp .env.example .env
# Edit .env — set DATABASE_URL and AE_MDW_URL

# Run in dev mode (auto-reload)
pnpm dev
```

### Docker

```bash
docker compose up -d
```

This starts PostgreSQL, ae-mdw, and the indexer. The API is available at `http://localhost:42069`.

### Configuration

Edit `aesync.config.ts` to set:
- Contract addresses (`ct_GROW_FACTORY_ADDRESS`, `ct_GROW_ROUTER_ADDRESS`)
- `startHeight` to begin indexing from a specific block
- Network (mainnet/testnet)

## API

### REST endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/pairs` | List all indexed pairs |
| `GET` | `/pairs/:address` | Single pair details |
| `GET` | `/pairs/:address/swaps?limit=50` | Recent swaps for a pair |
| `GET` | `/tokens` | All tracked tokens |
| `GET` | `/stats` | Global stats (total pairs, swaps, liquidity events) |
| `GET` | `/health` | Sync status and health check |

### GraphQL

Available at `http://localhost:42069/graphql`. Example queries:

```graphql
# All pairs with reserves
{
  pairs(first: 10) {
    items {
      address
      token0
      token1
      reserve0
      reserve1
      totalLiquidity
    }
    pageInfo { hasNextPage endCursor }
  }
}

# Recent swaps for a pair
{
  swapEvents(
    first: 20
    where: { pairAddress: "ct_..." }
    orderBy: "height"
    orderDirection: DESC
  ) {
    items {
      sender
      amountIn
      amountOut
      tokenIn
      tokenOut
      txHash
      height
    }
  }
}

# Daily volume data
{
  pairDayDatas(
    first: 30
    where: { pairAddress: "ct_..." }
    orderBy: "date"
    orderDirection: DESC
  ) {
    items {
      date
      dailyVolumeToken0
      dailyVolumeToken1
      dailyTxCount
      reserveToken0
      reserveToken1
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                 Aeternity                    │
│              (mainnet/testnet)               │
└─────────┬───────────────────────────────────┘
          │ blocks + contract logs
┌─────────▼───────────────────────────────────┐
│               ae-mdw                         │
│         (middleware / indexer)               │
└─────────┬───────────────────────────────────┘
          │ HTTP + WebSocket
┌─────────▼───────────────────────────────────┐
│             aesync engine                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Factory  │  │   Pair   │  │  Router   │  │
│  │ handler  │  │ handlers │  │  handler  │  │
│  └────┬─────┘  └────┬─────┘  └────┬──────┘  │
│       └──────────┬───┘─────────────┘         │
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
