import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'

export function corsMiddleware(): MiddlewareHandler {
  return cors({ origin: '*', maxAge: 86400 })
}

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const start = Date.now()
    await next()
    const duration = Date.now() - start
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`)
  }
}
