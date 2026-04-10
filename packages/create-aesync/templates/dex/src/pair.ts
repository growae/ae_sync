import type { EventCallbackFn } from '@growae/aesync'
import { liquidityEvent, swapEvent } from '../schema.js'

export const onSwap: EventCallbackFn = async (event, context) => {
  const { args, meta } = event

  await context.db.insert(swapEvent).values({
    pair: meta.contractId,
    sender: args[0] as string,
    amountIn: args[1] as bigint,
    amountOut: args[2] as bigint,
    tokenIn: args[3] as string,
    tokenOut: args[4] as string,
    ...meta,
  })
}

export const onMint: EventCallbackFn = async (event, context) => {
  const { args, meta } = event

  await context.db.insert(liquidityEvent).values({
    pair: meta.contractId,
    provider: args[0] as string,
    type: 'mint',
    amount0: args[1] as bigint,
    amount1: args[2] as bigint,
    ...meta,
  })
}

export const onBurn: EventCallbackFn = async (event, context) => {
  const { args, meta } = event

  await context.db.insert(liquidityEvent).values({
    pair: meta.contractId,
    provider: args[0] as string,
    type: 'burn',
    amount0: args[1] as bigint,
    amount1: args[2] as bigint,
    ...meta,
  })
}
