import {
  type SQL,
  type Table,
  and,
  asc,
  desc,
  getTableColumns,
  gt,
  lt,
} from 'drizzle-orm'
import type { DrizzleInstance } from '../database/types.js'

export function encodeCursor(value: unknown): string {
  return btoa(JSON.stringify(value))
}

export function decodeCursor(cursor: string): unknown {
  return JSON.parse(atob(cursor))
}

function findPrimaryKeyColumn(table: Table) {
  const cols = getTableColumns(table)
  for (const [key, col] of Object.entries(cols)) {
    if (col.primary) {
      return { key, column: col }
    }
  }
  return null
}

export interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

export interface Page<T> {
  items: T[]
  pageInfo: PageInfo
}

export interface PaginateArgs {
  first?: number | null
  after?: string | null
  orderBy?: string | null
  orderDirection?: string | null
  where?: SQL
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 1000

export async function paginateQuery(
  table: Table,
  db: DrizzleInstance,
  args: PaginateArgs,
): Promise<Page<Record<string, unknown>>> {
  const first = Math.min(args.first ?? DEFAULT_LIMIT, MAX_LIMIT)
  const direction = args.orderDirection === 'desc' ? 'desc' : 'asc'
  const pkInfo = findPrimaryKeyColumn(table)
  const cols = getTableColumns(table)

  const conditions: (SQL | undefined)[] = []

  if (args.where) {
    conditions.push(args.where)
  }

  if (args.after && pkInfo) {
    const cursorValue = decodeCursor(args.after)
    if (direction === 'desc') {
      conditions.push(lt(pkInfo.column as any, cursorValue))
    } else {
      conditions.push(gt(pkInfo.column as any, cursorValue))
    }
  }

  let query = db.select().from(table).$dynamic()

  if (conditions.length > 0) {
    query = query.where(and(...conditions))
  }

  const orderByKey = args.orderBy ?? pkInfo?.key
  if (orderByKey) {
    const orderCol = cols[orderByKey]
    if (orderCol) {
      query = query.orderBy(
        direction === 'desc' ? desc(orderCol) : asc(orderCol),
      )
    }
  }

  const results: Record<string, unknown>[] = await query.limit(first + 1)
  const hasNextPage = results.length > first
  const items = hasNextPage ? results.slice(0, first) : results

  const lastItem = items.at(-1)
  const endCursor =
    lastItem && pkInfo ? encodeCursor(lastItem[pkInfo.key]) : null

  return { items, pageInfo: { hasNextPage, endCursor } }
}
