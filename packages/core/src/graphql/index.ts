import type { Table } from 'drizzle-orm'
import { createYoga } from 'graphql-yoga'
import { Hono } from 'hono'
import type { DrizzleInstance } from '../database/types.js'
import { buildGraphQLSchema } from './schema.js'

export { buildGraphQLSchema, BigIntScalar, JSONScalar } from './schema.js'
export { encodeCursor, decodeCursor, paginateQuery } from './pagination.js'
export type { Page, PageInfo, PaginateArgs } from './pagination.js'
export { buildWhereConditions } from './filters.js'

export function graphqlMiddleware(
  tables: Record<string, Table>,
  db: DrizzleInstance,
): Hono {
  const schema = buildGraphQLSchema(tables, db)
  const yoga = createYoga({ schema, graphqlEndpoint: '/' })

  const app = new Hono()
  app.all('*', async (c) => {
    const response = await yoga.fetch(c.req.raw)
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  })

  return app
}
