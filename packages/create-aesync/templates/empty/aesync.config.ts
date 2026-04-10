import { createConfig } from '@growae/aesync'
import MyContractAci from './abis/MyContract.json'

export default createConfig({
  network: {
    name: 'testnet',
    mdwUrl: 'https://testnet.aeternity.io/mdw/v3',
    mdwWsUrl: 'wss://testnet.aeternity.io/mdw/v3/websocket',
    nodeUrl: 'https://testnet.aeternity.io',
  },
  contracts: {
    MyContract: {
      aci: MyContractAci,
      address: 'ct_REPLACE_WITH_YOUR_CONTRACT_ADDRESS',
      startHeight: 0,
    },
  },
})
