import { createConfig } from '@growae/aesync'
import TokenAci from './abis/Token.json'

export default createConfig({
  network: {
    name: 'testnet',
    mdwUrl: 'https://testnet.aeternity.io/mdw/v3',
    mdwWsUrl: 'wss://testnet.aeternity.io/mdw/v3/websocket',
    nodeUrl: 'https://testnet.aeternity.io',
  },
  contracts: {
    Token: {
      aci: TokenAci,
      address: 'ct_REPLACE_WITH_TOKEN_ADDRESS',
      startHeight: 0,
    },
  },
})
