# Contracts

Contracts are defined in `aesync.config.ts` and tell aesync which on-chain contracts to index, where to find their ACI (Application Call Interface), and which block range to scan.

## Basic Contract

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

## Contract Options

Each contract entry accepts the following fields:

### `aci`

The compiled ACI JSON for the contract. aesync uses this to:
- Compute event topic hashes
- Decode event arguments into typed values
- Generate TypeScript type definitions

You can export the ACI from the Sophia compiler or the Aeternity Explorer.

### `source`

An alternative to `aci` -- provide the Sophia source directly and aesync will compile it:

```typescript
contracts: {
  Token: {
    source: `contract Token =
      datatype event = Transfer(address, address, int)
      entrypoint balance(addr: address) : int = ...`,
    address: 'ct_...',
  },
}
```

### `fileSystem`

When using `source`, provide additional Sophia files for includes:

```typescript
contracts: {
  Token: {
    source: tokenSource,
    fileSystem: {
      'library.aes': librarySource,
    },
    address: 'ct_...',
  },
}
```

### `address`

The deployed contract address (`ct_...`). Required for standard contracts. Omitted when using [factory contracts](/guides/factory-contracts) where addresses are discovered dynamically.

### `startHeight`

The block height to begin indexing from. Defaults to 0 (genesis). Setting this to the deployment height avoids scanning blocks where the contract didn't exist:

```typescript
contracts: {
  Token: {
    address: 'ct_...',
    aci: tokenAci,
    startHeight: 800000, // deployed at this height
  },
}
```

### `endHeight`

Optional upper bound to stop indexing. Useful for contracts that were replaced or deprecated:

```typescript
contracts: {
  OldToken: {
    address: 'ct_old...',
    aci: tokenAci,
    startHeight: 500000,
    endHeight: 800000,
  },
}
```

### `factory`

Configuration for [factory contracts](/guides/factory-contracts) that create child contracts dynamically.

## Multiple Contracts

Index several contracts in one project:

```typescript
export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: 'https://mainnet.aeternity.io/mdw',
  },
  contracts: {
    Token: {
      address: 'ct_token...',
      aci: tokenAci,
      startHeight: 800000,
    },
    Router: {
      address: 'ct_router...',
      aci: routerAci,
      startHeight: 810000,
    },
    Factory: {
      address: 'ct_factory...',
      aci: factoryAci,
      startHeight: 810000,
    },
  },
})
```

Each contract gets its own sync state and backfill progress. Event handlers are matched by the `ContractName_EventName` naming convention.

## ACI Format

The ACI JSON follows the standard Aeternity compiler output. The key parts aesync uses are the event definitions:

```json
{
  "contract": {
    "name": "Token",
    "event": {
      "variant": [
        { "Transfer": ["address", "address", "int"] },
        { "Approval": ["address", "address", "int"] }
      ]
    }
  }
}
```

aesync computes keccak-256 hashes of event names and uses the type definitions to decode logged event arguments from ae_mdw responses.
