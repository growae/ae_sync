import type { EventCallbackFn } from '@growae/aesync'
import { eq, sql } from 'drizzle-orm'
import { liquidityEvent, pair, pairDayData, swapEvent } from '../schema.js'

function dateFromTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/**
 * GrowPair:Swap handler.
 *
 * ACI: Swap(sender, amount0In, amount1In, amount0Out, amount1Out, to)
 */
export const onSwap: EventCallbackFn = async ({ event, context }) => {
  const sender = event.args[0] as string
  const amount0In = BigInt(event.args[1] as string | bigint)
  const amount1In = BigInt(event.args[2] as string | bigint)
  const amount0Out = BigInt(event.args[3] as string | bigint)
  const amount1Out = BigInt(event.args[4] as string | bigint)
  const _to = event.args[5] as string

  const tokenIn = amount0In > 0n ? 'token0' : 'token1'
  const tokenOut = amount0Out > 0n ? 'token0' : 'token1'
  const amountIn = amount0In > 0n ? amount0In : amount1In
  const amountOut = amount0Out > 0n ? amount0Out : amount1Out

  await context.db.insert(swapEvent).values({
    pairAddress: event.contractId,
    sender,
    tokenIn,
    tokenOut,
    amountIn: amountIn.toString(),
    amountOut: amountOut.toString(),
    height: event.height,
    blockHash: event.blockHash,
    txHash: event.txHash,
    timestamp: event.blockTime,
  })

  const date = dateFromTimestamp(event.blockTime)
  const dayId = `${event.contractId}-${date}`

  await context.db.execute(sql`
    INSERT INTO pair_day_data (id, pair_address, date, daily_volume_token0, daily_volume_token1, daily_tx_count, reserve_token0, reserve_token1)
    VALUES (${dayId}, ${event.contractId}, ${date}, ${amount0In.toString()}, ${amount1In.toString()}, 1, '0', '0')
    ON CONFLICT (id) DO UPDATE SET
      daily_volume_token0 = (CAST(pair_day_data.daily_volume_token0 AS numeric) + ${amount0In.toString()})::text,
      daily_volume_token1 = (CAST(pair_day_data.daily_volume_token1 AS numeric) + ${amount1In.toString()})::text,
      daily_tx_count = pair_day_data.daily_tx_count + 1
  `)
}

/**
 * GrowPair:Mint handler.
 *
 * ACI: Mint(sender, amount0, amount1)
 */
export const onMint: EventCallbackFn = async ({ event, context }) => {
  const provider = event.args[0] as string
  const amount0 = event.args[1] as string | bigint
  const amount1 = event.args[2] as string | bigint

  await context.db.insert(liquidityEvent).values({
    pairAddress: event.contractId,
    provider,
    type: 'mint',
    amount0: amount0.toString(),
    amount1: amount1.toString(),
    liquidity: '0',
    height: event.height,
    txHash: event.txHash,
    timestamp: event.blockTime,
  })
}

/**
 * GrowPair:Burn handler.
 *
 * ACI: Burn(sender, amount0, amount1, to)
 */
export const onBurn: EventCallbackFn = async ({ event, context }) => {
  const provider = event.args[0] as string
  const amount0 = event.args[1] as string | bigint
  const amount1 = event.args[2] as string | bigint

  await context.db.insert(liquidityEvent).values({
    pairAddress: event.contractId,
    provider,
    type: 'burn',
    amount0: amount0.toString(),
    amount1: amount1.toString(),
    liquidity: '0',
    height: event.height,
    txHash: event.txHash,
    timestamp: event.blockTime,
  })
}

/**
 * GrowPair:Sync handler.
 *
 * ACI: Sync(reserve0, reserve1)
 * Updates pair reserves to reflect current on-chain state.
 */
export const onSync: EventCallbackFn = async ({ event, context }) => {
  const reserve0 = event.args[0] as string | bigint
  const reserve1 = event.args[1] as string | bigint

  await context.db
    .update(pair)
    .set({
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
    })
    .where(eq(pair.address, event.contractId))

  const date = dateFromTimestamp(event.blockTime)
  const dayId = `${event.contractId}-${date}`

  await context.db.execute(sql`
    INSERT INTO pair_day_data (id, pair_address, date, daily_volume_token0, daily_volume_token1, daily_tx_count, reserve_token0, reserve_token1)
    VALUES (${dayId}, ${event.contractId}, ${date}, '0', '0', 0, ${reserve0.toString()}, ${reserve1.toString()})
    ON CONFLICT (id) DO UPDATE SET
      reserve_token0 = ${reserve0.toString()},
      reserve_token1 = ${reserve1.toString()}
  `)
}
