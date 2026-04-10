import type { EventCallbackFn } from '@growae/aesync'
import { pair } from '../schema.js'

/**
 * GrowFactory:PairCreated handler.
 *
 * ACI: PairCreated(token0: address, token1: address, pair: address)
 */
export const onPairCreated: EventCallbackFn = async ({ event, context }) => {
  const token0 = event.args[0] as string
  const token1 = event.args[1] as string
  const pairAddress = event.args[2] as string

  await context.db.insert(pair).values({
    address: pairAddress,
    token0,
    token1,
    reserve0: '0',
    reserve1: '0',
    totalLiquidity: '0',
    createdAtHeight: event.height,
    createdAtTx: event.txHash,
  })

  context.contracts.register('GrowPair', pairAddress)
}
