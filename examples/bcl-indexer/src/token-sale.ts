import type { EventCallbackFn } from '@growae/aesync'
import { sql } from 'drizzle-orm'
import { priceChange, transaction } from '../schema.js'

function dateFromTimestamp(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/**
 * BclTokenSale:Buy handler.
 *
 * ACI: Buy(int, int, int)
 * Decoded args: arg0 = token amount, arg1 = AE cost, arg2 = fee
 */
export const onBuy: EventCallbackFn = async ({ event, context }) => {
  const tokenAmount = BigInt(event.args.arg0 as string | bigint)
  const aeCost = BigInt(event.args.arg1 as string | bigint)
  const fee = BigInt(event.args.arg2 as string | bigint)

  await context.db.insert(transaction).values({
    tokenSaleAddress: event.contractId,
    type: 'buy',
    tokenAmount: tokenAmount.toString(),
    aeAmount: aeCost.toString(),
    fee: fee.toString(),
    height: event.height,
    blockHash: event.blockHash,
    txHash: event.txHash,
    timestamp: event.blockTime,
  })

  const date = dateFromTimestamp(event.blockTime)
  const dayId = `${event.contractId}-${date}`

  await context.db.execute(sql`
    INSERT INTO token_day_data (id, token_sale_address, date, daily_buy_count, daily_sell_count, daily_buy_volume, daily_sell_volume, price)
    VALUES (${dayId}, ${event.contractId}, ${date}, 1, 0, ${tokenAmount.toString()}, '0', '0')
    ON CONFLICT (id) DO UPDATE SET
      daily_buy_count = token_day_data.daily_buy_count + 1,
      daily_buy_volume = (CAST(token_day_data.daily_buy_volume AS numeric) + ${tokenAmount.toString()})::text
  `)
}

/**
 * BclTokenSale:Sell handler.
 *
 * ACI: Sell(int, int)
 * Decoded args: arg0 = token amount, arg1 = AE returned
 */
export const onSell: EventCallbackFn = async ({ event, context }) => {
  const tokenAmount = BigInt(event.args.arg0 as string | bigint)
  const aeReturn = BigInt(event.args.arg1 as string | bigint)

  await context.db.insert(transaction).values({
    tokenSaleAddress: event.contractId,
    type: 'sell',
    tokenAmount: tokenAmount.toString(),
    aeAmount: aeReturn.toString(),
    fee: null,
    height: event.height,
    blockHash: event.blockHash,
    txHash: event.txHash,
    timestamp: event.blockTime,
  })

  const date = dateFromTimestamp(event.blockTime)
  const dayId = `${event.contractId}-${date}`

  await context.db.execute(sql`
    INSERT INTO token_day_data (id, token_sale_address, date, daily_buy_count, daily_sell_count, daily_buy_volume, daily_sell_volume, price)
    VALUES (${dayId}, ${event.contractId}, ${date}, 0, 1, '0', ${tokenAmount.toString()}, '0')
    ON CONFLICT (id) DO UPDATE SET
      daily_sell_count = token_day_data.daily_sell_count + 1,
      daily_sell_volume = (CAST(token_day_data.daily_sell_volume AS numeric) + ${tokenAmount.toString()})::text
  `)
}

/**
 * BclTokenSale:PriceChange handler.
 *
 * ACI: PriceChange(int, int)
 * Decoded args: arg0 = old price, arg1 = new price
 */
export const onPriceChange: EventCallbackFn = async ({ event, context }) => {
  const oldPrice = BigInt(event.args.arg0 as string | bigint)
  const newPrice = BigInt(event.args.arg1 as string | bigint)

  await context.db.insert(priceChange).values({
    tokenSaleAddress: event.contractId,
    oldPrice: oldPrice.toString(),
    newPrice: newPrice.toString(),
    height: event.height,
    txHash: event.txHash,
    timestamp: event.blockTime,
  })

  const date = dateFromTimestamp(event.blockTime)
  const dayId = `${event.contractId}-${date}`

  await context.db.execute(sql`
    INSERT INTO token_day_data (id, token_sale_address, date, daily_buy_count, daily_sell_count, daily_buy_volume, daily_sell_volume, price)
    VALUES (${dayId}, ${event.contractId}, ${date}, 0, 0, '0', '0', ${newPrice.toString()})
    ON CONFLICT (id) DO UPDATE SET
      price = ${newPrice.toString()}
  `)
}
