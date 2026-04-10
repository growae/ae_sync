# Factory Contracts

Factory contracts are a common pattern in DeFi where one contract deploys child contracts (e.g., a DEX factory that creates trading pair contracts). ae_sync supports this pattern natively -- you configure the factory event that creates new contracts, and ae_sync automatically discovers and indexes the child contracts.

## How It Works

1. You define a factory contract with a `factory` field in the config
2. When the factory event fires, ae_sync extracts the new contract address from the event arguments
3. The new address is registered and ae_sync begins indexing events from the child contract

## Configuration

```typescript
import { createConfig } from '@growae/aesync'
import factoryAci from './abis/factory.json'
import pairAci from './abis/pair.json'

export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: 'https://mainnet.aeternity.io/mdw',
  },
  contracts: {
    Factory: {
      address: 'ct_factory...',
      aci: factoryAci,
      startHeight: 800000,
    },
    Pair: {
      aci: pairAci,
      factory: {
        contract: 'Factory',
        event: 'PairCreated',
        parameter: 'pair',
      },
    },
  },
})
```

### Factory Config Fields

| Field | Type | Description |
|---|---|---|
| `contract` | `string` | Name of the factory contract (must match a key in `contracts`) |
| `event` | `string` | Event name that signals a new child contract was created |
| `parameter` | `string` | Name of the event argument containing the new contract address |

Notice that the `Pair` contract does not have an `address` field. Addresses are discovered dynamically when `Factory.PairCreated` events are processed.

## Event Handlers

Write handlers for both the factory events and the child contract events:

```typescript
import type { EventCallbackFn } from '@growae/aesync'
import { pairs, swaps } from './schema'

// Called when the factory creates a new pair
export const Factory_PairCreated: EventCallbackFn = async ({ event, context }) => {
  await context.db.insert(pairs).values({
    address: event.args.pair,
    token0: event.args.token0,
    token1: event.args.token1,
    createdAt: context.network.height,
  })
}

// Called for Swap events on ANY pair contract discovered by the factory
export const Pair_Swap: EventCallbackFn = async ({ event, context }) => {
  await context.db.insert(swaps).values({
    id: `${event.txHash}-${event.logIndex}`,
    pair: event.contractId,
    amountIn: event.args.amount_in,
    amountOut: event.args.amount_out,
    sender: event.args.sender,
    height: context.network.height,
  })
}
```

## Manual Registration

You can also register child contract addresses manually from any event handler using `context.contracts.register()`:

```typescript
export const Registry_ContractAdded: EventCallbackFn = async ({ event, context }) => {
  // Register a new contract address for the "Token" contract type
  context.contracts.register('Token', event.args.contractAddress)
}
```

This is useful when the discovery logic is more complex than a single event parameter.

## Lifecycle

1. During historical backfill, ae_sync processes factory events first and discovers child addresses
2. Child contract events from past blocks are then backfilled
3. During real-time sync, new factory events immediately register child addresses
4. Subsequent blocks containing child contract events are processed normally

Factory tracking state is persisted across restarts -- discovered addresses are stored in the database checkpoint tables.
