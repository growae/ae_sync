import {
  bigint,
  integer,
  jsonb,
  text,
  timestamp,
} from 'drizzle-orm/pg-core/columns'
import { primaryKey } from 'drizzle-orm/pg-core/primary-keys'
import { pgTable } from 'drizzle-orm/pg-core/table'

/** Framework key-value metadata (schema version, config hash, etc.) */
export const aesyncMeta = pgTable('_aesync_meta', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/** Per-contract sync progress tracking. */
export const aesyncContractState = pgTable(
  '_aesync_contract_state',
  {
    contractId: text('contract_id').notNull(),
    contractName: text('contract_name').notNull(),
    lastCursor: text('last_cursor'),
    lastHeight: integer('last_height'),
    eventsProcessed: bigint('events_processed', { mode: 'bigint' }),
    status: text('status').notNull().default('pending'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.contractId, table.contractName] })],
)

/** Block-level checkpoint for crash recovery. */
export const aesyncCheckpoint = pgTable('_aesync_checkpoint', {
  height: integer('height').primaryKey(),
  blockHash: text('block_hash').notNull(),
  eventsCount: integer('events_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
