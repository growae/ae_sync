import type { Hono } from 'hono'

export default function registerRoutes(app: Hono) {
  app.get('/balances', (c) => {
    return c.json({ message: 'GET /balances — list token balances' })
  })

  app.get('/transfers', (c) => {
    return c.json({ message: 'GET /transfers — list transfer history' })
  })
}
