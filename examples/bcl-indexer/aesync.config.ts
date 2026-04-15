import { createConfig } from '@growae/aesync'
import AffiliationBondingCurveTokenSaleAci from './abis/AffiliationBondingCurveTokenSale.aci.json'
import CommunityFactoryAci from './abis/CommunityFactory.aci.json'

export default createConfig({
  network: {
    name: 'mainnet',
    mdwUrl: process.env.AE_MDW_URL ?? 'https://mainnet.aeternity.io/mdw',
    mdwWsUrl:
      process.env.AE_MDW_WS_URL ??
      'wss://mainnet.aeternity.io/mdw/v3/websocket',
    nodeUrl: 'https://mainnet.aeternity.io',
  },
  database: {
    kind: 'postgres',
    connectionString:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/bcl',
  },
  contracts: {
    BclFactory: {
      aci: CommunityFactoryAci,
      address: 'ct_25cqTw85wkF5cbcozmHHUCuybnfH9WaRZXSgEcNNXG9LsCJWTN',
      startHeight: 1_089_546,
    },
    BclTokenSale: {
      aci: AffiliationBondingCurveTokenSaleAci,
      factory: {
        contract: 'BclFactory',
        event: 'CreateCommunity',
        parameter: 'arg2',
      },
    },
  },
  port: 42069,
})
