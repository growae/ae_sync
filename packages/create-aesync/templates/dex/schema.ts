import {
  aeAddress,
  aesyncMeta,
  bigint,
  integer,
  onchainTable,
  text,
} from '@growae/aesync'

export const swapEvent = onchainTable('swap_event', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  pair: aeAddress().notNull(),
  sender: aeAddress().notNull(),
  amountIn: bigint({ mode: 'bigint' }).notNull(),
  amountOut: bigint({ mode: 'bigint' }).notNull(),
  tokenIn: aeAddress().notNull(),
  tokenOut: aeAddress().notNull(),
  ...aesyncMeta(),
})

export const pairState = onchainTable('pair_state', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  pair: aeAddress().notNull(),
  token0: aeAddress().notNull(),
  token1: aeAddress().notNull(),
  reserve0: bigint({ mode: 'bigint' }).notNull(),
  reserve1: bigint({ mode: 'bigint' }).notNull(),
  totalSwaps: integer().notNull().default(0),
  ...aesyncMeta(),
})

export const liquidityEvent = onchainTable('liquidity_event', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  pair: aeAddress().notNull(),
  provider: aeAddress().notNull(),
  type: text().notNull(),
  amount0: bigint({ mode: 'bigint' }).notNull(),
  amount1: bigint({ mode: 'bigint' }).notNull(),
  ...aesyncMeta(),
})
