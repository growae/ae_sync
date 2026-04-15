import { createConfig } from '@growae/aesync'
import GrowFactoryAci from './abis/GrowFactory.json'
import GrowPairAci from './abis/GrowPair.json'
import GrowRouterAci from './abis/GrowRouter.json'

export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: process.env.AE_MDW_URL ?? 'https://mainnet.aeternity.io/mdw',
    mdwWsUrl:
      process.env.AE_MDW_WS_URL ??
      'wss://mainnet.aeternity.io/mdw/v3/websocket',
    nodeUrl: 'https://mainnet.aeternity.io',

    // Testnet:
    // name: 'testnet',
    // mdwUrl: 'https://testnet.aeternity.io/mdw/v3',
    // mdwWsUrl: 'wss://testnet.aeternity.io/mdw/v3/websocket',
    // nodeUrl: 'https://testnet.aeternity.io',
  },
  database: {
    kind: 'postgres',
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/grow_dex',
  },
  contracts: {
    GrowFactory: {
      aci: GrowFactoryAci,
      address: 'ct_GROW_FACTORY_ADDRESS',
      startHeight: 800_000,
    },
    GrowPair: {
      aci: GrowPairAci,
      factory: {
        contract: 'GrowFactory',
        event: 'PairCreated',
        parameter: 'pair',
      },
    },
    GrowRouter: {
      aci: GrowRouterAci,
      address: 'ct_GROW_ROUTER_ADDRESS',
      startHeight: 800_000,
    },
  },
  port: 42069,
})
