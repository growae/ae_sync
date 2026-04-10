# GraphQL API

aesync automatically generates a GraphQL API from your `onchainTable` definitions. Every table gets query operations with filtering, pagination, and ordering -- no configuration required.

## Endpoint

The GraphQL endpoint is available at:

```
http://localhost:42069/graphql
```

Both GET and POST requests are supported.

## Auto-generated Queries

For each `onchainTable`, aesync generates two queries:

### Singular Query (by primary key)

Fetches a single record by its primary key:

```graphql
query {
  transfer(id: "th_abc123") {
    id
    from
    to
    amount
    height
  }
}
```

The singular query name is the camelCase version of the table name.

### Plural Query (list with pagination)

Fetches multiple records with filtering, ordering, and cursor-based pagination:

```graphql
query {
  transfers(first: 10, orderBy: "height", orderDirection: DESC) {
    items {
      id
      from
      to
      amount
      height
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Pagination

All plural queries use cursor-based pagination:

| Argument | Type | Description |
|---|---|---|
| `first` | `Int` | Number of items to return (default varies) |
| `after` | `String` | Cursor for the next page |

Use `pageInfo` to navigate:

```graphql
query {
  transfers(first: 20) {
    items { id }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

To fetch the next page:

```graphql
query {
  transfers(first: 20, after: "eyJpZCI6IjEwMCJ9") {
    items { id }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

## Ordering

| Argument | Type | Values | Description |
|---|---|---|---|
| `orderBy` | `String` | Any column name | Column to sort by |
| `orderDirection` | `OrderDirection` | `ASC`, `DESC` | Sort direction |

```graphql
query {
  swaps(first: 50, orderBy: "height", orderDirection: DESC) {
    items {
      id
      amountIn
      amountOut
      height
    }
  }
}
```

## Filtering

Every column generates multiple filter arguments in the `where` input:

| Suffix | Operator | Example |
|---|---|---|
| (none) | `=` | `where: { from: "ak_..." }` |
| `_not` | `!=` | `where: { status_not: "closed" }` |
| `_gt` | `>` | `where: { height_gt: 900000 }` |
| `_gte` | `>=` | `where: { height_gte: 900000 }` |
| `_lt` | `<` | `where: { amount_lt: "1000" }` |
| `_lte` | `<=` | `where: { amount_lte: "1000" }` |
| `_in` | `IN` | `where: { from_in: ["ak_a...", "ak_b..."] }` |
| `_contains` | `LIKE %...%` | `where: { name_contains: "token" }` (text columns only) |
| `_starts_with` | `LIKE ...%` | `where: { name_starts_with: "AE" }` (text columns only) |

### Combined Filters

Multiple filters are combined with AND:

```graphql
query {
  transfers(
    where: {
      from: "ak_sender..."
      height_gte: 900000
      height_lt: 910000
    }
    orderBy: "height"
    orderDirection: DESC
  ) {
    items {
      id
      to
      amount
      height
    }
  }
}
```

## Scalar Types

| GraphQL Type | PostgreSQL Types |
|---|---|
| `String` | `TEXT`, `VARCHAR`, `CHAR`, `NUMERIC`, `TIMESTAMP`, `DATE` |
| `Int` | `INTEGER`, `SERIAL`, `SMALLINT` |
| `Float` | `REAL`, `DOUBLE PRECISION` |
| `Boolean` | `BOOLEAN` |
| `BigInt` | `BIGINT`, `BIGSERIAL` (serialized as string) |
| `JSON` | `JSON`, `JSONB` |

## Usage with `graphqlMiddleware`

The GraphQL API is mounted automatically by the CLI commands. If you need to use it programmatically:

```typescript
import { graphqlMiddleware, buildGraphQLSchema } from '@growae/aesync'

// Mount on a Hono app
const gqlApp = graphqlMiddleware(schema, db)
app.route('/graphql', gqlApp)
```

`graphqlMiddleware` accepts:
1. A record of tables (`Record<string, Table>`)
2. A Drizzle database instance

It builds the GraphQL schema and handles both GET and POST requests with the standard `query` and `variables` parameters.
