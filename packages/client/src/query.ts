import type { HttpTransport } from './http.js'
import type { QueryResult } from './types.js'

interface WhereClause {
  column: string
  op: string
  value: unknown
}

interface OrderByClause {
  column: string
  direction: 'asc' | 'desc'
}

export interface QueryBuilder<T = Record<string, unknown>> {
  where(column: string, op: string, value: unknown): QueryBuilder<T>
  orderBy(column: string, direction?: 'asc' | 'desc'): QueryBuilder<T>
  limit(n: number): QueryBuilder<T>
  offset(n: number): QueryBuilder<T>
  execute(): Promise<QueryResult<T>>
}

export interface QueryProxy {
  sql<T = Record<string, unknown>>(
    query: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>
}

function buildSql(
  table: string,
  wheres: WhereClause[],
  orders: OrderByClause[],
  limitVal?: number,
  offsetVal?: number,
): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  let sql = `SELECT * FROM "${table}"`

  if (wheres.length > 0) {
    const conditions = wheres.map((w) => {
      params.push(w.value)
      return `"${w.column}" ${w.op} $${params.length}`
    })
    sql += ` WHERE ${conditions.join(' AND ')}`
  }

  if (orders.length > 0) {
    const orderClauses = orders.map(
      (o) => `"${o.column}" ${o.direction.toUpperCase()}`,
    )
    sql += ` ORDER BY ${orderClauses.join(', ')}`
  }

  if (limitVal !== undefined) {
    sql += ` LIMIT ${limitVal}`
  }

  if (offsetVal !== undefined) {
    sql += ` OFFSET ${offsetVal}`
  }

  return { sql, params }
}

export function createQueryProxy(transport: HttpTransport): QueryProxy {
  return {
    async sql<T = Record<string, unknown>>(
      query: string,
      params: unknown[] = [],
    ): Promise<QueryResult<T>> {
      return transport.post<QueryResult<T>>('/sql', { sql: query, params })
    },

    from<T = Record<string, unknown>>(table: string): QueryBuilder<T> {
      const wheres: WhereClause[] = []
      const orders: OrderByClause[] = []
      let limitVal: number | undefined
      let offsetVal: number | undefined

      const builder: QueryBuilder<T> = {
        where(column: string, op: string, value: unknown) {
          wheres.push({ column, op, value })
          return builder
        },
        orderBy(column: string, direction: 'asc' | 'desc' = 'asc') {
          orders.push({ column, direction })
          return builder
        },
        limit(n: number) {
          limitVal = n
          return builder
        },
        offset(n: number) {
          offsetVal = n
          return builder
        },
        async execute(): Promise<QueryResult<T>> {
          const built = buildSql(table, wheres, orders, limitVal, offsetVal)
          return transport.post<QueryResult<T>>('/sql', {
            sql: built.sql,
            params: built.params,
          })
        },
      }

      return builder
    },
  }
}
