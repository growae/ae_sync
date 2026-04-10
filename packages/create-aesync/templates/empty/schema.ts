import {
  aeAddress,
  aesyncMeta,
  bigint,
  integer,
  onchainTable,
  text,
} from '@growae/aesync'

export const transferEvent = onchainTable('transfer_event', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  from: aeAddress().notNull(),
  to: aeAddress().notNull(),
  value: bigint({ mode: 'bigint' }).notNull(),
  ...aesyncMeta(),
})
