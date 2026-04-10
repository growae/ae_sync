# ae-sync start

Start ae_sync in production mode. Runs the sync engine and HTTP server. Requires `DATABASE_URL` to be set.

## Usage

```bash
ae-sync start [options]
```

## Options

| Option | Default | Description |
|---|---|---|
| `-p, --port <port>` | `42069` | HTTP server port |
| `--hostname <host>` | `0.0.0.0` | HTTP server hostname |
| `--config <path>` | - | Path to config file |
| `--schema <path>` | - | Path to schema file |

## Requirements

- `DATABASE_URL` environment variable must be set to a PostgreSQL connection string
- The command will exit with an error if `DATABASE_URL` is not set

## What It Does

1. Validates that `DATABASE_URL` is set
2. Builds the project (single pass, no file watching)
3. Creates/migrates database tables and shadow tables
4. Starts the sync engine (historical backfill, then real-time)
5. Starts the HTTP server with GraphQL and custom API routes
6. Outputs structured JSON logs

## Output

All logs are JSON-formatted for production log aggregation:

```json
{"time":"2025-01-15T10:00:00.000Z","level":"info","msg":"Starting ae-sync in production mode"}
{"time":"2025-01-15T10:00:01.000Z","level":"info","msg":"Config loaded","network":"mainnet","database":"postgres","contracts":["Token"]}
{"time":"2025-01-15T10:00:02.000Z","level":"info","msg":"Server started","port":42069,"hostname":"0.0.0.0"}
{"time":"2025-01-15T10:00:02.000Z","level":"info","msg":"Sync engine started"}
{"time":"2025-01-15T10:05:00.000Z","level":"info","msg":"Backfill complete","contract":"Token"}
{"time":"2025-01-15T10:05:01.000Z","level":"info","msg":"Realtime sync active"}
```

## Examples

```bash
# Production start
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb ae-sync start

# Custom port
DATABASE_URL=postgresql://... ae-sync start --port 8080

# With Docker
docker run -e DATABASE_URL=postgresql://... my-indexer ae-sync start
```

## Graceful Shutdown

`ae-sync start` handles `SIGINT` and `SIGTERM` signals for graceful shutdown:

1. Stops the sync engine
2. Stops the HTTP server
3. Closes the database connection
4. Exits with code 0
