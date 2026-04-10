import { createConfig } from '@growae/aesync'
import PairAci from './abis/Pair.json'
import PairFactoryAci from './abis/PairFactory.json'

export default createConfig({
  network: {
    name: 'testnet',
    mdwUrl: 'https://testnet.aeternity.io/mdw/v3',
    mdwWsUrl: 'wss://testnet.aeternity.io/mdw/v3/websocket',
    nodeUrl: 'https://testnet.aeternity.io',
  },
  contracts: {
    PairFactory: {
      aci: PairFactoryAci,
      address: 'ct_REPLACE_WITH_FACTORY_ADDRESS',
      startHeight: 0,
    },
    DexPair: {
      aci: PairAci,
      factory: {
        contract: 'PairFactory',
        event: 'PairCreated',
        parameter: 'pair',
      },
    },
  },
})
