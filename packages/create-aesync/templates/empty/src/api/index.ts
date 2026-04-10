import type { Hono } from 'hono'

export default function registerRoutes(app: Hono) {
  app.get('/hello', (c) => {
    return c.json({ message: 'Hello from {{PROJECT_NAME}}!' })
  })
}
