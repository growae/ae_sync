# ae-sync dev

Start ae_sync in development mode with hot reload. Uses PGlite by default so no PostgreSQL installation is needed.

## Usage

```bash
ae-sync dev [options]
```

## Options

| Option | Default | Description |
|---|---|---|
| `-p, --port <port>` | `42069` | HTTP server port |
| `--hostname <host>` | `localhost` | HTTP server hostname |
| `--config <path>` | - | Path to config file |
| `--schema <path>` | - | Path to schema file |
| `--mdw-url <url>` | - | Override middleware URL |
| `-v, --verbose` | `false` | Enable verbose logging with sync progress |

## What It Does

1. Builds the project with file watching enabled (hot reload)
2. Loads the config from `src/ae-sync.config.ts`
3. Compiles contract ACIs and generates TypeScript types
4. Creates/migrates database tables and shadow tables
5. Starts the sync engine (historical backfill, then real-time)
6. Starts the HTTP server with GraphQL and custom API routes
7. Watches for file changes and rebuilds automatically

## Output

```
◆ ae-sync dev

✓ Config loaded
  Network: mainnet
  Database: pglite
  Contracts: Token, Factory

✓ Shadow tables ready
✓ Server listening on http://localhost:42069
  GraphQL: http://localhost:42069/graphql
✓ Sync engine started
✓ Backfill complete: Token
✓ Backfill complete: Factory
✓ Realtime sync active
```

With `--verbose`:

```
↻ Sync: 1500 events (342.1/s)
↻ Sync: 3200 events (285.7/s)
```

## Examples

```bash
# Default development server
ae-sync dev

# Custom port
ae-sync dev --port 3000

# Verbose mode with sync progress
ae-sync dev --verbose

# Override middleware URL
ae-sync dev --mdw-url https://testnet.aeternity.io/mdw
```

## Differences from `start`

| Feature | `dev` | `start` |
|---|---|---|
| Hot reload | Yes | No |
| Default hostname | `localhost` | `0.0.0.0` |
| Default database | PGlite | Requires `DATABASE_URL` |
| Log format | Human-readable | JSON |
| File watching | Yes | No |
