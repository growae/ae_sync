import {
  aeAddress,
  aesyncMeta,
  bigint,
  integer,
  onchainTable,
} from '@growae/aesync'

export const transferEvent = onchainTable('transfer_event', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  from: aeAddress().notNull(),
  to: aeAddress().notNull(),
  value: bigint({ mode: 'bigint' }).notNull(),
  ...aesyncMeta(),
})

export const balanceState = onchainTable('balance_state', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  account: aeAddress().notNull(),
  balance: bigint({ mode: 'bigint' }).notNull(),
  ...aesyncMeta(),
})
