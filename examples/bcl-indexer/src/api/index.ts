import { db } from 'aesync:api'
import { aesync } from 'aesync:registry'
import { desc, eq, sql } from 'drizzle-orm'
import { priceChange, token, transaction } from '../../schema.js'

aesync.get('/tokens', async (c: any) => {
  const tokens = await db.select().from(token)
  return c.json(tokens)
})

aesync.get('/tokens/:address', async (c: any) => {
  const address = c.req.param('address')
  const result = await db
    .select()
    .from(token)
    .where(eq(token.address, address))
    .limit(1)
  if (!result[0]) return c.json({ error: 'Token not found' }, 404)
  return c.json(result[0])
})

aesync.get('/tokens/:address/transactions', async (c: any) => {
  const address = c.req.param('address')
  const limit = Number(c.req.query('limit') ?? 50)
  const txs = await db
    .select()
    .from(transaction)
    .where(eq(transaction.tokenSaleAddress, address))
    .orderBy(desc(transaction.height))
    .limit(Math.min(limit, 200))
  return c.json(txs)
})

aesync.get('/tokens/:address/price-history', async (c: any) => {
  const address = c.req.param('address')
  const limit = Number(c.req.query('limit') ?? 50)
  const prices = await db
    .select()
    .from(priceChange)
    .where(eq(priceChange.tokenSaleAddress, address))
    .orderBy(desc(priceChange.height))
    .limit(Math.min(limit, 200))
  return c.json(prices)
})

aesync.get('/stats', async (c: any) => {
  const [tokenCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(token)
  const [buyCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transaction)
    .where(eq(transaction.type, 'buy'))
  const [sellCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transaction)
    .where(eq(transaction.type, 'sell'))
  const [priceChangeCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(priceChange)

  return c.json({
    totalTokens: tokenCount?.count ?? 0,
    totalBuys: buyCount?.count ?? 0,
    totalSells: sellCount?.count ?? 0,
    totalPriceChanges: priceChangeCount?.count ?? 0,
  })
})
