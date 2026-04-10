# aesync serve

Start the HTTP server with GraphQL and custom API routes, but without the sync engine. Serves existing indexed data from the database.

## Usage

```bash
aesync serve [options]
```

## Options

| Option | Default | Description |
|---|---|---|
| `-p, --port <port>` | `42069` | HTTP server port |
| `--hostname <host>` | `localhost` | HTTP server hostname |
| `--config <path>` | - | Path to config file |
| `--schema <path>` | - | Path to schema file |

## What It Does

1. Builds the project (single pass, no file watching)
2. Loads the schema and database connection
3. Starts the HTTP server with GraphQL and custom API routes
4. Does **not** start the sync engine -- only reads from the database

## When to Use

- **Separate API instances** -- run `aesync start` in one container for sync, and `aesync serve` in multiple containers for API scaling
- **Read-only access** -- serve existing data without syncing
- **Development** -- test API routes against a pre-populated database

## Output

```
◆ aesync serve (API-only)

✓ Config and schema loaded
✓ Server listening on http://localhost:42069
  GraphQL: http://localhost:42069/graphql

ℹ Serving existing data only — no sync engine running
```

## Examples

```bash
# Serve on default port
aesync serve

# Custom port and hostname
aesync serve --port 3000 --hostname 0.0.0.0

# In a Docker Compose setup alongside aesync start
# see the Docker guide for full examples
```

## Architecture

In a production setup with separate containers:

```
                    ┌──────────────┐
                    │   ae_mdw     │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ aesync start│  (sync + API)
                    └──────┬───────┘
                           │ writes
                    ┌──────▼───────┐
                    │  PostgreSQL  │
                    └──────┬───────┘
                           │ reads
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼──────┐ ┌──▼──────────┐
       │ aesync     │ │ aesync │ │ aesync      │
       │ serve       │ │ serve   │ │ serve        │
       │ (replica 1) │ │ (rep 2) │ │ (replica 3)  │
       └─────────────┘ └─────────┘ └──────────────┘
```

See the [Docker guide](/guides/docker) for complete deployment examples.
