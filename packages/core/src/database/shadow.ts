import { sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core/table'
import type { Database } from './types.js'

function shadowName(tableName: string): string {
  return `_reorg__${tableName}`
}

/**
 * Creates shadow tables and PL/pgSQL triggers for every user table.
 * Shadow tables store row snapshots so chain reorgs can be undone.
 */
export async function createShadowTables(
  db: Database,
  userTables: Record<string, PgTable>,
): Promise<void> {
  for (const table of Object.values(userTables)) {
    const config = getTableConfig(table)
    const shadow = shadowName(config.name)

    await db.qb.execute(
      sql.raw(`
      CREATE TABLE IF NOT EXISTS "${shadow}" (
        operation_id BIGSERIAL PRIMARY KEY,
        operation TEXT NOT NULL,
        checkpoint_height INT NOT NULL,
        row_data JSONB
      )
    `),
    )

    await db.qb.execute(
      sql.raw(`
      CREATE INDEX IF NOT EXISTS "${shadow}_height_idx"
        ON "${shadow}" (checkpoint_height)
    `),
    )

    const fnName = `_reorg_trigger_${config.name}`

    await db.qb.execute(
      sql.raw(`
      CREATE OR REPLACE FUNCTION "${fnName}"()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          INSERT INTO "${shadow}" (operation, checkpoint_height, row_data)
          VALUES ('INSERT', current_setting('aesync.checkpoint_height')::int, row_to_json(NEW));
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          INSERT INTO "${shadow}" (operation, checkpoint_height, row_data)
          VALUES ('UPDATE', current_setting('aesync.checkpoint_height')::int, row_to_json(OLD));
          RETURN NEW;
        ELSIF TG_OP = 'DELETE' THEN
          INSERT INTO "${shadow}" (operation, checkpoint_height, row_data)
          VALUES ('DELETE', current_setting('aesync.checkpoint_height')::int, row_to_json(OLD));
          RETURN OLD;
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `),
    )

    const triggerName = `_reorg_trg_${config.name}`
    await db.qb.execute(
      sql.raw(`
      DROP TRIGGER IF EXISTS "${triggerName}" ON "${config.name}"
    `),
    )
    await db.qb.execute(
      sql.raw(`
      CREATE TRIGGER "${triggerName}"
      AFTER INSERT OR UPDATE OR DELETE ON "${config.name}"
      FOR EACH ROW EXECUTE FUNCTION "${fnName}"()
    `),
    )
  }
}

/**
 * Reverts all changes made above `forkHeight` by replaying
 * shadow entries in reverse order.
 */
export async function revertToHeight(
  db: Database,
  userTables: Record<string, PgTable>,
  forkHeight: number,
): Promise<void> {
  for (const table of Object.values(userTables)) {
    const config = getTableConfig(table)
    const shadow = shadowName(config.name)

    const pkCols = config.columns.filter((c) => c.primary).map((c) => c.name)

    if (pkCols.length === 0 && config.primaryKeys.length > 0) {
      for (const pk of config.primaryKeys) {
        for (const col of pk.columns) {
          pkCols.push(col.name)
        }
      }
    }

    const triggerName = `_reorg_trg_${config.name}`
    await db.qb.execute(
      sql.raw(`ALTER TABLE "${config.name}" DISABLE TRIGGER "${triggerName}"`),
    )

    try {
      const entries = await db.qb.execute<{
        operation_id: string
        operation: string
        checkpoint_height: number
        row_data: Record<string, unknown> | null
      }>(
        sql.raw(`
        SELECT operation_id, operation, checkpoint_height, row_data
        FROM "${shadow}"
        WHERE checkpoint_height > ${forkHeight}
        ORDER BY operation_id DESC
      `),
      )

      for (const entry of entries.rows) {
        const data = entry.row_data
        if (!data) continue

        switch (entry.operation) {
          case 'INSERT': {
            if (pkCols.length === 0) break
            const where = pkCols
              .map((pk) => `"${pk}" = '${String(data[pk])}'`)
              .join(' AND ')
            await db.qb.execute(
              sql.raw(`DELETE FROM "${config.name}" WHERE ${where}`),
            )
            break
          }
          case 'UPDATE': {
            if (pkCols.length === 0) break
            const setClauses = Object.entries(data)
              .filter(([k]) => !pkCols.includes(k))
              .map(([k, v]) =>
                v === null ? `"${k}" = NULL` : `"${k}" = '${String(v)}'`,
              )
              .join(', ')
            const whereClause = pkCols
              .map((pk) => `"${pk}" = '${String(data[pk])}'`)
              .join(' AND ')
            if (setClauses) {
              await db.qb.execute(
                sql.raw(
                  `UPDATE "${config.name}" SET ${setClauses} WHERE ${whereClause}`,
                ),
              )
            }
            break
          }
          case 'DELETE': {
            const cols = Object.keys(data)
              .map((k) => `"${k}"`)
              .join(', ')
            const vals = Object.values(data)
              .map((v) => (v === null ? 'NULL' : `'${String(v)}'`))
              .join(', ')
            await db.qb.execute(
              sql.raw(
                `INSERT INTO "${config.name}" (${cols}) VALUES (${vals})`,
              ),
            )
            break
          }
        }
      }

      await db.qb.execute(
        sql.raw(
          `DELETE FROM "${shadow}" WHERE checkpoint_height > ${forkHeight}`,
        ),
      )
    } finally {
      await db.qb.execute(
        sql.raw(`ALTER TABLE "${config.name}" ENABLE TRIGGER "${triggerName}"`),
      )
    }
  }
}

/**
 * Removes shadow entries at or below `finalizedHeight` since
 * those blocks can no longer be reverted.
 */
export async function pruneFinalized(
  db: Database,
  userTables: Record<string, PgTable>,
  finalizedHeight: number,
): Promise<void> {
  for (const table of Object.values(userTables)) {
    const config = getTableConfig(table)
    const shadow = shadowName(config.name)
    await db.qb.execute(
      sql.raw(
        `DELETE FROM "${shadow}" WHERE checkpoint_height <= ${finalizedHeight}`,
      ),
    )
  }
}
