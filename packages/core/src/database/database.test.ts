import { sql } from 'drizzle-orm'
import { integer, text } from 'drizzle-orm/pg-core/columns'
import { pgTable } from 'drizzle-orm/pg-core/table'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  aesyncCheckpoint,
  aesyncContractState,
  aesyncMeta,
} from '../schema/internal.js'
import { createPGliteDatabase } from './pglite.js'
import { createShadowTables, pruneFinalized, revertToHeight } from './shadow.js'
import type { Database } from './types.js'

const testUsers = pgTable('test_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  age: integer('age'),
})

let db: Database

beforeEach(async () => {
  db = await createPGliteDatabase('memory://')
})

afterEach(async () => {
  await db.close()
})

describe('PGlite database', () => {
  it('creates an in-memory database', () => {
    expect(db).toBeDefined()
    expect(db.qb).toBeDefined()
    expect(db.raw).toBeDefined()
  })

  it('ping returns true', async () => {
    expect(await db.ping()).toBe(true)
  })

  it('supports transactions', async () => {
    await db.migrate({ testUsers })

    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
      )
      const rows = await tx.execute<{ id: string; name: string }>(
        sql`SELECT id, name FROM "test_users"`,
      )
      return rows.rows
    })

    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('Alice')
  })
})

describe('schema migration', () => {
  it('creates user tables', async () => {
    await db.migrate({ testUsers })

    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Bob', 25)`,
    )
    const rows = await db.qb.execute<{ id: string; name: string; age: number }>(
      sql`SELECT * FROM "test_users"`,
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.name).toBe('Bob')
    expect(rows.rows[0]!.age).toBe(25)
  })

  it('creates internal tables', async () => {
    await db.migrate({ aesyncMeta, aesyncContractState, aesyncCheckpoint })

    await db.qb.execute(
      sql`INSERT INTO "_aesync_meta" (key, value) VALUES ('version', '"1.0"')`,
    )
    const rows = await db.qb.execute<{ key: string; value: string }>(
      sql`SELECT * FROM "_aesync_meta"`,
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.key).toBe('version')
  })

  it('is idempotent (IF NOT EXISTS)', async () => {
    await db.migrate({ testUsers })
    await db.migrate({ testUsers })

    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Carol', 28)`,
    )
    const rows = await db.qb.execute<{ id: string }>(
      sql`SELECT * FROM "test_users"`,
    )
    expect(rows.rows).toHaveLength(1)
  })
})

describe('shadow tables', () => {
  beforeEach(async () => {
    await db.migrate({ testUsers })
  })

  it('creates shadow table and trigger', async () => {
    await createShadowTables(db, { testUsers })

    const tables = await db.qb.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE tablename = '_reorg__test_users'`,
    )
    expect(tables.rows).toHaveLength(1)

    const triggers = await db.qb.execute<{ trigger_name: string }>(
      sql`SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'test_users'`,
    )
    expect(triggers.rows.length).toBeGreaterThan(0)
  })

  it('records INSERT operations in shadow table', async () => {
    await createShadowTables(db, { testUsers })

    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )

    const shadow = await db.qb.execute<{
      operation: string
      checkpoint_height: number
    }>(sql`SELECT operation, checkpoint_height FROM "_reorg__test_users"`)
    expect(shadow.rows).toHaveLength(1)
    expect(shadow.rows[0]!.operation).toBe('INSERT')
    expect(shadow.rows[0]!.checkpoint_height).toBe(100)
  })

  it('records UPDATE operations in shadow table', async () => {
    await createShadowTables(db, { testUsers })

    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )
    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(
      sql`UPDATE "test_users" SET name = 'Alicia' WHERE id = '1'`,
    )

    const shadow = await db.qb.execute<{ operation: string }>(
      sql`SELECT operation FROM "_reorg__test_users" ORDER BY operation_id`,
    )
    expect(shadow.rows).toHaveLength(2)
    expect(shadow.rows[1]!.operation).toBe('UPDATE')
  })

  it('records DELETE operations in shadow table', async () => {
    await createShadowTables(db, { testUsers })

    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )
    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(sql`DELETE FROM "test_users" WHERE id = '1'`)

    const shadow = await db.qb.execute<{ operation: string }>(
      sql`SELECT operation FROM "_reorg__test_users" ORDER BY operation_id`,
    )
    expect(shadow.rows).toHaveLength(2)
    expect(shadow.rows[1]!.operation).toBe('DELETE')
  })
})

describe('revertToHeight', () => {
  beforeEach(async () => {
    await db.migrate({ testUsers })
    await createShadowTables(db, { testUsers })
  })

  it('undoes INSERTs above fork height', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )
    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('2', 'Bob', 25)`,
    )

    await revertToHeight(db, { testUsers }, 100)

    const rows = await db.qb.execute<{ id: string }>(
      sql`SELECT * FROM "test_users"`,
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.id).toBe('1')
  })

  it('undoes UPDATEs above fork height', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )
    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(
      sql`UPDATE "test_users" SET name = 'Alicia', age = 31 WHERE id = '1'`,
    )

    await revertToHeight(db, { testUsers }, 100)

    const rows = await db.qb.execute<{ name: string; age: number }>(
      sql`SELECT name, age FROM "test_users" WHERE id = '1'`,
    )
    expect(rows.rows[0]!.name).toBe('Alice')
    expect(rows.rows[0]!.age).toBe(30)
  })

  it('undoes DELETEs above fork height', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )
    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(sql`DELETE FROM "test_users" WHERE id = '1'`)

    await revertToHeight(db, { testUsers }, 100)

    const rows = await db.qb.execute<{ id: string; name: string }>(
      sql`SELECT * FROM "test_users"`,
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]!.name).toBe('Alice')
  })

  it('cleans up shadow entries after revert', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '101'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )

    await revertToHeight(db, { testUsers }, 100)

    const shadow = await db.qb.execute<{ operation_id: string }>(
      sql`SELECT * FROM "_reorg__test_users"`,
    )
    expect(shadow.rows).toHaveLength(0)
  })
})

describe('pruneFinalized', () => {
  beforeEach(async () => {
    await db.migrate({ testUsers })
    await createShadowTables(db, { testUsers })
  })

  it('removes shadow entries at or below finalized height', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )
    await db.qb.execute(sql`SET aesync.checkpoint_height = '200'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('2', 'Bob', 25)`,
    )

    await pruneFinalized(db, { testUsers }, 150)

    const shadow = await db.qb.execute<{ checkpoint_height: number }>(
      sql`SELECT checkpoint_height FROM "_reorg__test_users"`,
    )
    expect(shadow.rows).toHaveLength(1)
    expect(shadow.rows[0]!.checkpoint_height).toBe(200)
  })

  it('removes all entries when finalized height is high', async () => {
    await db.qb.execute(sql`SET aesync.checkpoint_height = '100'`)
    await db.qb.execute(
      sql`INSERT INTO "test_users" (id, name, age) VALUES ('1', 'Alice', 30)`,
    )

    await pruneFinalized(db, { testUsers }, 1000)

    const shadow = await db.qb.execute<{ operation_id: string }>(
      sql`SELECT * FROM "_reorg__test_users"`,
    )
    expect(shadow.rows).toHaveLength(0)
  })
})

describe('close', () => {
  it('closes the database connection', async () => {
    const tempDb = await createPGliteDatabase('memory://')
    expect(await tempDb.ping()).toBe(true)
    await tempDb.close()
  })
})
