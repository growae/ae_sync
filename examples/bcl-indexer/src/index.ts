import { aesync } from 'aesync:registry'
import { onCreateCommunity } from './factory.js'
import { onBuy, onPriceChange, onSell } from './token-sale.js'

aesync.on('BclFactory:CreateCommunity', onCreateCommunity)
aesync.on('BclTokenSale:Buy', onBuy)
aesync.on('BclTokenSale:Sell', onSell)
aesync.on('BclTokenSale:PriceChange', onPriceChange)
