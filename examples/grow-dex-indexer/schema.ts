import {
  aeAddress,
  aeAmount,
  aeBlockHash,
  aeTxHash,
  bigint,
  index,
  integer,
  onchainTable,
  text,
} from '@growae/aesync'

export const token = onchainTable('token', {
  address: aeAddress('address').primaryKey(),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  decimals: integer('decimals').notNull(),
  totalSupply: aeAmount('total_supply'),
})

export const pair = onchainTable(
  'pair',
  {
    address: aeAddress('address').primaryKey(),
    token0: aeAddress('token0').notNull(),
    token1: aeAddress('token1').notNull(),
    reserve0: aeAmount('reserve0').notNull().default('0'),
    reserve1: aeAmount('reserve1').notNull().default('0'),
    totalLiquidity: aeAmount('total_liquidity').notNull().default('0'),
    createdAtHeight: integer('created_at_height').notNull(),
    createdAtTx: aeTxHash('created_at_tx').notNull(),
  },
  (table) => [
    index('pair_token0_idx').on(table.token0),
    index('pair_token1_idx').on(table.token1),
  ],
)

export const swapEvent = onchainTable(
  'swap_event',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    pairAddress: aeAddress('pair_address').notNull(),
    sender: aeAddress('sender').notNull(),
    tokenIn: aeAddress('token_in').notNull(),
    tokenOut: aeAddress('token_out').notNull(),
    amountIn: aeAmount('amount_in').notNull(),
    amountOut: aeAmount('amount_out').notNull(),
    height: integer('height').notNull(),
    blockHash: aeBlockHash('block_hash').notNull(),
    txHash: aeTxHash('tx_hash').notNull(),
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('swap_pair_idx').on(table.pairAddress),
    index('swap_height_idx').on(table.height),
  ],
)

export const liquidityEvent = onchainTable(
  'liquidity_event',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    pairAddress: aeAddress('pair_address').notNull(),
    provider: aeAddress('provider').notNull(),
    type: text('type').notNull(), // 'mint' | 'burn'
    amount0: aeAmount('amount0').notNull(),
    amount1: aeAmount('amount1').notNull(),
    liquidity: aeAmount('liquidity').notNull().default('0'),
    height: integer('height').notNull(),
    txHash: aeTxHash('tx_hash').notNull(),
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('liq_pair_idx').on(table.pairAddress),
    index('liq_height_idx').on(table.height),
  ],
)

export const pairDayData = onchainTable(
  'pair_day_data',
  {
    id: text('id').primaryKey(), // `${pairAddress}-${date}`
    pairAddress: aeAddress('pair_address').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    dailyVolumeToken0: aeAmount('daily_volume_token0').notNull().default('0'),
    dailyVolumeToken1: aeAmount('daily_volume_token1').notNull().default('0'),
    dailyTxCount: integer('daily_tx_count').notNull().default(0),
    reserveToken0: aeAmount('reserve_token0').notNull().default('0'),
    reserveToken1: aeAmount('reserve_token1').notNull().default('0'),
  },
  (table) => [
    index('pdd_pair_idx').on(table.pairAddress),
    index('pdd_date_idx').on(table.date),
  ],
)
