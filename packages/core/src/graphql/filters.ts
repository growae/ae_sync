import {
  type SQL,
  and,
  eq,
  gt,
  gte,
  inArray,
  like,
  lt,
  lte,
  ne,
} from 'drizzle-orm'
import type { Column } from 'drizzle-orm'

const SUFFIXES = [
  '_starts_with',
  '_contains',
  '_not',
  '_gte',
  '_lte',
  '_gt',
  '_lt',
  '_in',
] as const

function parseFilterKey(
  key: string,
  columnNames: string[],
): { column: string; op: string } | null {
  if (columnNames.includes(key)) return { column: key, op: 'eq' }

  for (const suffix of SUFFIXES) {
    if (key.endsWith(suffix)) {
      const column = key.slice(0, -suffix.length)
      if (columnNames.includes(column)) {
        return { column, op: suffix.slice(1) }
      }
    }
  }
  return null
}

function applyOperator(col: Column, op: string, value: unknown): SQL {
  switch (op) {
    case 'eq':
      return eq(col as any, value)
    case 'not':
      return ne(col as any, value)
    case 'gt':
      return gt(col as any, value)
    case 'gte':
      return gte(col as any, value)
    case 'lt':
      return lt(col as any, value)
    case 'lte':
      return lte(col as any, value)
    case 'in':
      return inArray(col as any, value as any[])
    case 'contains':
      return like(col as any, `%${value}%`)
    case 'starts_with':
      return like(col as any, `${value}%`)
    default:
      return eq(col as any, value)
  }
}

export function buildWhereConditions(
  columns: Record<string, Column>,
  where: Record<string, unknown>,
): SQL | undefined {
  const columnNames = Object.keys(columns)
  const conditions: SQL[] = []

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue

    const parsed = parseFilterKey(key, columnNames)
    if (!parsed) continue

    const col = columns[parsed.column]
    if (!col) continue

    conditions.push(applyOperator(col, parsed.op, value))
  }

  if (conditions.length === 0) return undefined
  return and(...conditions)
}
