# createConfig

Creates and validates an ae_sync configuration object. This is the main entry point for configuring your indexer.

## Import

```typescript
import { createConfig } from '@growae/aesync'
```

## Usage

```typescript
import { createConfig } from '@growae/aesync'
import tokenAci from './abis/token.json'

export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: 'https://mainnet.aeternity.io/mdw',
  },
  contracts: {
    Token: {
      address: 'ct_2AfnEfCSZCTEkxL5Goi4Jh8LfGHHBPAyC4ZCBMhzjKLdpsbTY',
      aci: tokenAci,
      startHeight: 800000,
    },
  },
})
```

## Parameters

### `CreateConfigParameters`

```typescript
interface CreateConfigParameters {
  network: NetworkConfig
  database?: Partial<DatabaseConfig>
  contracts: Record<string, ContractConfig>
  finalityDepth?: number
  port?: number
}
```

### `NetworkConfig`

| Property | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Network identifier (`"mainnet"`, `"testnet"`, etc.) |
| `mdwUrl` | `string` | Yes | ae_mdw HTTP API base URL |
| `mdwWsUrl` | `string` | No | ae_mdw WebSocket URL for real-time sync |
| `nodeUrl` | `string` | No | Aeternity node URL |

### `DatabaseConfig`

| Property | Type | Default | Description |
|---|---|---|---|
| `kind` | `"postgres" \| "pglite"` | `"pglite"` | Database backend |
| `connectionString` | `string` | - | PostgreSQL connection string |
| `directory` | `string` | `".ae-sync/pglite"` | PGlite data directory |
| `poolConfig` | `{ max?: number }` | - | Connection pool settings |

### `ContractConfig`

| Property | Type | Required | Description |
|---|---|---|---|
| `aci` | `object` | No* | Compiled ACI JSON |
| `source` | `string` | No* | Sophia source code |
| `fileSystem` | `Record<string, string>` | No | Additional Sophia files for includes |
| `address` | `string` | No** | Deployed contract address |
| `factory` | `FactoryConfig` | No | Factory contract configuration |
| `startHeight` | `number` | No | Block height to start indexing from |
| `endHeight` | `number` | No | Block height to stop indexing at |

\* Either `aci` or `source` should be provided.
\*\* Required unless using `factory` for dynamic address discovery.

### `FactoryConfig`

| Property | Type | Description |
|---|---|---|
| `contract` | `string` | Parent factory contract name |
| `event` | `string` | Event that signals child contract creation |
| `parameter` | `string` | Event argument containing the new address |

### Optional Parameters

| Property | Type | Default | Description |
|---|---|---|---|
| `finalityDepth` | `number` | `20` | Number of blocks before considering data final |
| `port` | `number` | `42069` | HTTP server port |

## Return Type

Returns a frozen `AeSyncConfig` object:

```typescript
interface AeSyncConfig {
  network: NetworkConfig
  database: DatabaseConfig
  contracts: Record<string, ContractConfig>
  finalityDepth: number
  port: number
}
```

## Environment Variable Fallbacks

`createConfig` checks for environment variables as fallbacks:

| Config Path | Environment Variable |
|---|---|
| `network.mdwUrl` | `AE_MDW_URL` |
| `network.mdwWsUrl` | `AE_MDW_WS_URL` |
| `network.nodeUrl` | `AE_NODE_URL` |
| `database.connectionString` | `DATABASE_URL` |

Environment variables take effect only when the corresponding config value is empty or not provided.

## Validation

`createConfig` validates the configuration and throws an error if:
- `network.name` is missing
- `network.mdwUrl` is missing (and `AE_MDW_URL` is not set)
- No contracts are defined
- A factory contract references a non-existent parent contract
