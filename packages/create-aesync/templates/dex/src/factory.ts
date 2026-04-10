import type { EventCallbackFn } from '@growae/aesync'
import { pairState } from '../schema.js'

export const onPairCreated: EventCallbackFn = async (event, context) => {
  const { args, meta } = event

  await context.db.insert(pairState).values({
    pair: args[0] as string,
    token0: args[1] as string,
    token1: args[2] as string,
    reserve0: 0n,
    reserve1: 0n,
    totalSwaps: 0,
    ...meta,
  })
}
