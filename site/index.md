---
layout: home
hero:
  name: ae_sync
  text: Contract Indexing for Aeternity
  tagline: Index smart contract events from ae_mdw into PostgreSQL with a type-safe schema DSL and auto-generated GraphQL APIs.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/growae/ae_sync

features:
  - icon: "\u26A1"
    title: Ponder-equivalent DX
    details: Define schemas with Drizzle-style tables, write event handlers in TypeScript, and query data through auto-generated GraphQL -- all from a single project.
  - icon: "\uD83D\uDD17"
    title: ae_mdw Built In
    details: Connects directly to the Aeternity middleware for historical backfill and real-time WebSocket sync. No separate node required.
  - icon: "\uD83D\uDCE1"
    title: Auto-generated APIs
    details: Every onchainTable gets a GraphQL query with filtering, pagination, and ordering out of the box. Add custom Hono routes when you need more.
  - icon: "\uD83D\uDD12"
    title: Sophia-native
    details: ACI parsing, event hash computation, and typed event decoding are built in. Column helpers like aeAddress and aeAmount map directly to Sophia types.
---
