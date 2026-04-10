import type { Hono } from 'hono'

export default function registerRoutes(app: Hono) {
  app.get('/pairs', (c) => {
    return c.json({ message: 'GET /pairs — list all indexed pairs' })
  })

  app.get('/volume', (c) => {
    return c.json({ message: 'GET /volume — aggregate swap volume' })
  })
}
