# API Routes

ae_sync automatically generates a GraphQL API from your schema, but you can also define custom HTTP endpoints using Hono routes.

## Setup

Create `src/api/index.ts` in your project. ae_sync discovers this file automatically and mounts your routes alongside the built-in GraphQL endpoint.

```typescript
// src/api/index.ts
import { Hono } from 'hono'

const api = new Hono()

api.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

export default api
```

## Route Registration

Export route and middleware arrays that ae_sync will mount on the server:

```typescript
// src/api/index.ts

export const routes = [
  {
    method: 'GET',
    path: '/api/stats',
    handler: async (c: any) => {
      return c.json({ pairs: 42, volume: '1000000' })
    },
  },
  {
    method: 'GET',
    path: '/api/tokens/:address',
    handler: async (c: any) => {
      const address = c.req.param('address')
      return c.json({ address, name: 'MyToken' })
    },
  },
]

export const middleware = []
```

## Using Hono

ae_sync uses [Hono](https://hono.dev/) as its HTTP framework. All Hono features are available in your API routes:

### Path Parameters

```typescript
{
  method: 'GET',
  path: '/api/pairs/:pairAddress/swaps',
  handler: async (c) => {
    const pairAddress = c.req.param('pairAddress')
    // query your database
    return c.json({ swaps: [] })
  },
}
```

### Query Parameters

```typescript
{
  method: 'GET',
  path: '/api/search',
  handler: async (c) => {
    const q = c.req.query('q')
    const limit = parseInt(c.req.query('limit') || '10')
    return c.json({ query: q, limit, results: [] })
  },
}
```

### POST Endpoints

```typescript
{
  method: 'POST',
  path: '/api/webhook',
  handler: async (c) => {
    const body = await c.req.json()
    // process webhook
    return c.json({ received: true })
  },
}
```

## Middleware

Add middleware that runs on all routes:

```typescript
export const middleware = [
  async (c: any, next: () => Promise<void>) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start
    c.header('X-Response-Time', `${ms}ms`)
  },
]
```

## Accessing the Database

Your API routes share the same database instance as the indexing engine. You can import your schema tables and use Drizzle queries directly:

```typescript
import { eq } from 'drizzle-orm'
import { tokens, pairs } from '../schema'

export const routes = [
  {
    method: 'GET',
    path: '/api/tokens',
    handler: async (c) => {
      // Use the database connection from the server context
      const results = await db.select().from(tokens).limit(100)
      return c.json(results)
    },
  },
]
```

## Built-in Endpoints

ae_sync provides these endpoints out of the box:

| Endpoint | Description |
|---|---|
| `GET /graphql` | GraphQL API (GET for queries) |
| `POST /graphql` | GraphQL API (POST for mutations/complex queries) |
| `GET /health` | Health check with sync status |
| `GET /ready` | Readiness probe (returns 200 when all contracts reach realtime sync) |

The `/health` endpoint returns:

```json
{
  "status": "healthy",
  "ready": true,
  "contracts": [
    {
      "name": "Token",
      "status": "realtime",
      "eventsProcessed": 15234,
      "lastHeight": 920100
    }
  ]
}
```
