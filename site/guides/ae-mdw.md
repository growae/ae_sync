# ae_mdw Integration

aesync uses the [Aeternity Middleware (ae_mdw)](https://github.com/aeternity/ae_mdw) as its data source. ae_mdw is a caching and indexing layer that sits between your application and the Aeternity node, providing a REST API for querying blockchain data.

## How aesync Uses ae_mdw

aesync connects to ae_mdw in two ways:

1. **HTTP API** -- for historical backfill, fetching contract logs, calls, and AEX-9 transfers
2. **WebSocket** -- for real-time event streaming after backfill is complete

### Historical Sync

During backfill, aesync queries the ae_mdw HTTP API to fetch contract events in batches:

```
GET /v3/contracts/{contract_id}/logs?limit=100&direction=forward
```

It paginates through results using ae_mdw's cursor-based pagination until all historical events are processed.

### Real-time Sync

After backfill, aesync opens a WebSocket connection to ae_mdw:

```
ws://mainnet.aeternity.io/mdw/v3/websocket
```

It subscribes to key-block events and polls for new contract logs on each new block.

## Configuration

### Network Config

```typescript
import { createConfig } from '@growae/aesync'

export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: 'https://mainnet.aeternity.io/mdw',
    mdwWsUrl: 'wss://mainnet.aeternity.io/mdw/v3/websocket',
    nodeUrl: 'https://mainnet.aeternity.io',
  },
  // ...
})
```

| Field | Required | Description |
|---|---|---|
| `mdwUrl` | Yes | Base URL for the ae_mdw HTTP API |
| `mdwWsUrl` | No | WebSocket URL for real-time sync (derived from `mdwUrl` if omitted) |
| `nodeUrl` | No | Aeternity node URL (for direct node queries if needed) |

### Common Network URLs

**Mainnet:**
```typescript
network: {
  name: 'mainnet',
  mdwUrl: 'https://mainnet.aeternity.io/mdw',
}
```

**Testnet:**
```typescript
network: {
  name: 'testnet',
  mdwUrl: 'https://testnet.aeternity.io/mdw',
}
```

## ae_mdw Data Types

aesync's MDW client provides typed interfaces for the common ae_mdw response shapes:

### Contract Logs

Contract logs contain emitted events. aesync fetches these to find events matching your configured contracts:

```typescript
interface MdwContractLog {
  contract_id: string
  data: string
  event_hash: string
  ext_caller_contract_id: string
  log_idx: number
  block_hash: string
  block_time: number
  height: number
  micro_index: number
  call_txi: number
}
```

### Contract Calls

Direct contract calls (entrypoint invocations):

```typescript
interface MdwContractCall {
  contract_id: string
  caller_id: string
  function: string
  arguments: unknown[]
  result: unknown
  height: number
  block_hash: string
  call_txi: number
}
```

### AEX-9 Transfers

Fungible token transfers following the AEX-9 standard:

```typescript
interface MdwAex9Transfer {
  sender: string
  recipient: string
  amount: number
  contract_id: string
  height: number
  block_hash: string
  call_txi: number
  log_idx: number
  micro_index: number
}
```

## Pagination

ae_mdw uses cursor-based pagination. aesync provides helpers to paginate through results:

```typescript
import { paginateAll, paginateWithLimit } from '@growae/aesync'

// Fetch all results (careful with large datasets)
const allLogs = await paginateAll(mdwClient, '/v3/contracts/ct_.../logs')

// Fetch up to N items
const recentLogs = await paginateWithLimit(
  mdwClient,
  '/v3/contracts/ct_.../logs',
  { limit: 1000 },
)
```

## Error Handling

aesync handles ae_mdw connection errors with automatic retries and exponential backoff. The MDW client throws typed errors:

| Error Class | When |
|---|---|
| `MdwConnectionError` | Cannot connect to ae_mdw |
| `MdwHttpError` | ae_mdw returns a non-2xx status code |
| `MdwTimeoutError` | Request exceeds the configured timeout |

## Self-hosted ae_mdw

For production deployments with high throughput, consider running your own ae_mdw instance. Point aesync to your local instance:

```typescript
network: {
  name: 'mainnet',
  mdwUrl: 'http://localhost:4000',
  mdwWsUrl: 'ws://localhost:4001/v3/websocket',
  nodeUrl: 'http://localhost:3013',
}
```

See the [ae_mdw documentation](https://github.com/aeternity/ae_mdw) for deployment instructions.
