import { type Table, eq, getTableColumns } from 'drizzle-orm'
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLFloat,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLScalarType,
  GraphQLSchema,
  GraphQLString,
  Kind,
} from 'graphql'
import type { DrizzleInstance } from '../database/types.js'
import { buildWhereConditions } from './filters.js'
import { paginateQuery } from './pagination.js'

export const BigIntScalar = new GraphQLScalarType({
  name: 'BigInt',
  description: 'Arbitrary precision integer, serialized as string',
  serialize(value) {
    return String(value)
  },
  parseValue(value) {
    return BigInt(value as string | number)
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING || ast.kind === Kind.INT) {
      return BigInt(ast.value)
    }
    return null
  },
})

function parseLiteralToJSON(ast: any): unknown {
  switch (ast.kind) {
    case Kind.STRING:
      return ast.value
    case Kind.INT:
      return Number.parseInt(ast.value, 10)
    case Kind.FLOAT:
      return Number.parseFloat(ast.value)
    case Kind.BOOLEAN:
      return ast.value
    case Kind.NULL:
      return null
    case Kind.LIST:
      return (ast.values as any[]).map(parseLiteralToJSON)
    case Kind.OBJECT: {
      const obj: Record<string, unknown> = {}
      for (const field of ast.fields as any[]) {
        obj[field.name.value] = parseLiteralToJSON(field.value)
      }
      return obj
    }
    default:
      return null
  }
}

export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize(value) {
    return value
  },
  parseValue(value) {
    return value
  },
  parseLiteral: parseLiteralToJSON,
})

const OrderDirectionEnum = new GraphQLEnumType({
  name: 'OrderDirection',
  values: {
    ASC: { value: 'asc' },
    DESC: { value: 'desc' },
  },
})

const PageInfoType = new GraphQLObjectType({
  name: 'PageInfo',
  fields: {
    hasNextPage: { type: new GraphQLNonNull(GraphQLBoolean) },
    endCursor: { type: GraphQLString },
  },
})

function mapColumnToGraphQLType(column: any): GraphQLScalarType {
  const ct = column.columnType as string

  if (ct.includes('BigInt') || ct.includes('BigSerial')) return BigIntScalar
  if (
    ct.includes('Integer') ||
    ct.includes('Serial') ||
    ct.includes('SmallInt')
  )
    return GraphQLInt
  if (ct.includes('Real') || ct.includes('DoublePrecision')) return GraphQLFloat
  if (ct.includes('Boolean')) return GraphQLBoolean
  if (ct.includes('Json')) return JSONScalar
  if (ct.includes('Numeric')) return GraphQLString
  if (ct.includes('Text') || ct.includes('Varchar') || ct.includes('Char'))
    return GraphQLString
  if (ct.includes('Timestamp') || ct.includes('Date')) return GraphQLString

  switch (column.dataType as string) {
    case 'bigint':
      return BigIntScalar
    case 'number':
      return GraphQLFloat
    case 'boolean':
      return GraphQLBoolean
    case 'json':
      return JSONScalar
    default:
      return GraphQLString
  }
}

function isStringColumn(column: any): boolean {
  const ct = column.columnType as string
  return ct.includes('Text') || ct.includes('Varchar') || ct.includes('Char')
}

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1)
}

function pluralize(str: string): string {
  if (str.endsWith('s')) return `${str}es`
  if (str.endsWith('y') && !/[aeiou]y$/i.test(str))
    return `${str.slice(0, -1)}ies`
  return `${str}s`
}

function buildFilterInputType(
  typeName: string,
  cols: Record<string, any>,
): GraphQLInputObjectType {
  return new GraphQLInputObjectType({
    name: `${typeName}Filter`,
    fields: () => {
      const fields: Record<string, { type: any }> = {}
      for (const [colName, col] of Object.entries(cols)) {
        const gqlType = mapColumnToGraphQLType(col)
        fields[colName] = { type: gqlType }
        fields[`${colName}_not`] = { type: gqlType }
        fields[`${colName}_gt`] = { type: gqlType }
        fields[`${colName}_gte`] = { type: gqlType }
        fields[`${colName}_lt`] = { type: gqlType }
        fields[`${colName}_lte`] = { type: gqlType }
        fields[`${colName}_in`] = {
          type: new GraphQLList(new GraphQLNonNull(gqlType)),
        }
        if (isStringColumn(col)) {
          fields[`${colName}_contains`] = { type: GraphQLString }
          fields[`${colName}_starts_with`] = { type: GraphQLString }
        }
      }
      return fields
    },
  })
}

function findPrimaryKey(cols: Record<string, any>) {
  for (const [key, col] of Object.entries(cols)) {
    if (col.primary) return { key, column: col }
  }
  return null
}

export function buildGraphQLSchema(
  tables: Record<string, Table>,
  db: DrizzleInstance,
): GraphQLSchema {
  const queryFields: Record<string, any> = {}

  for (const [tableKey, table] of Object.entries(tables)) {
    const cols = getTableColumns(table)
    const typeName = toPascalCase(tableKey)
    const singularName = toCamelCase(tableKey)
    const listName = pluralize(singularName)

    const objectType = new GraphQLObjectType({
      name: typeName,
      fields: () => {
        const fields: Record<string, { type: any }> = {}
        for (const [colName, col] of Object.entries(cols)) {
          const gqlType = mapColumnToGraphQLType(col)
          fields[colName] = {
            type: col.notNull ? new GraphQLNonNull(gqlType) : gqlType,
          }
        }
        return fields
      },
    })

    const pageType = new GraphQLObjectType({
      name: `${typeName}Page`,
      fields: {
        items: {
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(objectType)),
          ),
        },
        pageInfo: { type: new GraphQLNonNull(PageInfoType) },
      },
    })

    const filterType = buildFilterInputType(typeName, cols)
    const pkInfo = findPrimaryKey(cols)

    if (pkInfo) {
      queryFields[singularName] = {
        type: objectType,
        args: {
          [pkInfo.key]: {
            type: new GraphQLNonNull(mapColumnToGraphQLType(pkInfo.column)),
          },
        },
        resolve: async (_parent: unknown, args: Record<string, unknown>) => {
          const result = await db
            .select()
            .from(table)
            .where(eq(pkInfo.column as any, args[pkInfo.key]))
            .limit(1)
          return (result as unknown[])[0] ?? null
        },
      }
    }

    queryFields[listName] = {
      type: pageType,
      args: {
        first: { type: GraphQLInt },
        after: { type: GraphQLString },
        orderBy: { type: GraphQLString },
        orderDirection: { type: OrderDirectionEnum },
        where: { type: filterType },
      },
      resolve: async (_parent: unknown, args: Record<string, any>) => {
        const whereCondition = args.where
          ? buildWhereConditions(cols as Record<string, any>, args.where)
          : undefined
        return paginateQuery(table, db, {
          first: args.first,
          after: args.after,
          orderBy: args.orderBy,
          orderDirection: args.orderDirection,
          where: whereCondition,
        })
      },
    }
  }

  return new GraphQLSchema({
    query: new GraphQLObjectType({
      name: 'Query',
      fields: queryFields,
    }),
  })
}
