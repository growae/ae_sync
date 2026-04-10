import { desc, eq, sql } from 'drizzle-orm'
import type { Hono } from 'hono'
import {
  liquidityEvent,
  pair,
  pairDayData,
  swapEvent,
  token,
} from '../../schema.js'

export default function registerRoutes(app: Hono) {
  app.get('/pairs', async (c) => {
    const db = c.get('db')
    const pairs = await db.select().from(pair)
    return c.json(pairs)
  })

  app.get('/pairs/:address', async (c) => {
    const db = c.get('db')
    const address = c.req.param('address')
    const result = await db
      .select()
      .from(pair)
      .where(eq(pair.address, address))
      .limit(1)
    if (!result[0]) return c.json({ error: 'Pair not found' }, 404)
    return c.json(result[0])
  })

  app.get('/pairs/:address/swaps', async (c) => {
    const db = c.get('db')
    const address = c.req.param('address')
    const limit = Number(c.req.query('limit') ?? 50)
    const swaps = await db
      .select()
      .from(swapEvent)
      .where(eq(swapEvent.pairAddress, address))
      .orderBy(desc(swapEvent.height))
      .limit(Math.min(limit, 200))
    return c.json(swaps)
  })

  app.get('/tokens', async (c) => {
    const db = c.get('db')
    const tokens = await db.select().from(token)
    return c.json(tokens)
  })

  app.get('/stats', async (c) => {
    const db = c.get('db')

    const [pairCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(pair)
    const [swapCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(swapEvent)
    const [liquidityCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(liquidityEvent)

    return c.json({
      totalPairs: pairCount?.count ?? 0,
      totalSwaps: swapCount?.count ?? 0,
      totalLiquidityEvents: liquidityCount?.count ?? 0,
    })
  })
}
