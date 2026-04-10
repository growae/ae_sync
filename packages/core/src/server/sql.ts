import { sql as rawSql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { DrizzleInstance } from '../database/types.js'

export function sqlRoutes(db: DrizzleInstance): Hono {
  const app = new Hono()

  app.post('/sql', async (c) => {
    const body = await c.req.json<{ sql: string; params?: unknown[] }>()

    const trimmed = body.sql.trim().toUpperCase()
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return c.json({ error: 'Only SELECT queries are allowed' }, 403)
    }

    try {
      const result = await db.execute(rawSql.raw(body.sql))
      return c.json({
        rows: result,
        rowCount: Array.isArray(result) ? result.length : 0,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return c.json({ error: message }, 400)
    }
  })

  return app
}
