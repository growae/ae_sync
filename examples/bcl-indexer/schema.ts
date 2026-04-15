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

export const token = onchainTable(
  'token',
  {
    address: aeAddress('address').primaryKey(),
    name: text('name').notNull(),
    daoAddress: aeAddress('dao_address').notNull(),
    communityManagementAddress: aeAddress(
      'community_management_address',
    ).notNull(),
    createdAtHeight: integer('created_at_height').notNull(),
    createdAtTx: aeTxHash('created_at_tx').notNull(),
  },
  (table) => [index('token_name_idx').on(table.name)],
)

export const transaction = onchainTable(
  'transaction',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tokenSaleAddress: aeAddress('token_sale_address').notNull(),
    type: text('type').notNull(), // 'buy' | 'sell'
    tokenAmount: aeAmount('token_amount').notNull(),
    aeAmount: aeAmount('ae_amount').notNull(),
    fee: aeAmount('fee'),
    height: integer('height').notNull(),
    blockHash: aeBlockHash('block_hash').notNull(),
    txHash: aeTxHash('tx_hash').notNull(),
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('tx_token_sale_idx').on(table.tokenSaleAddress),
    index('tx_height_idx').on(table.height),
  ],
)

export const priceChange = onchainTable(
  'price_change',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    tokenSaleAddress: aeAddress('token_sale_address').notNull(),
    oldPrice: aeAmount('old_price').notNull(),
    newPrice: aeAmount('new_price').notNull(),
    height: integer('height').notNull(),
    txHash: aeTxHash('tx_hash').notNull(),
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  },
  (table) => [index('pc_token_sale_idx').on(table.tokenSaleAddress)],
)

export const tokenDayData = onchainTable(
  'token_day_data',
  {
    id: text('id').primaryKey(), // `${tokenSaleAddress}-${date}`
    tokenSaleAddress: aeAddress('token_sale_address').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    dailyBuyCount: integer('daily_buy_count').notNull().default(0),
    dailySellCount: integer('daily_sell_count').notNull().default(0),
    dailyBuyVolume: aeAmount('daily_buy_volume').notNull().default('0'),
    dailySellVolume: aeAmount('daily_sell_volume').notNull().default('0'),
    price: aeAmount('price').notNull().default('0'),
  },
  (table) => [
    index('tdd_token_sale_idx').on(table.tokenSaleAddress),
    index('tdd_date_idx').on(table.date),
  ],
)
