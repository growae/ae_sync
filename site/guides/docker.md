# Docker

ae_sync can be deployed with Docker for production environments. There are two main patterns: a single container running both sync and API, or separate containers.

## Single Container

A single container runs `ae-sync start`, which handles both indexing and serving the API.

### Dockerfile

```dockerfile
FROM node:20-slim AS base
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm ae-sync codegen

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./
EXPOSE 42069
CMD ["pnpm", "ae-sync", "start", "--hostname", "0.0.0.0"]
```

### docker-compose.yml

```yaml
services:
  indexer:
    build: .
    ports:
      - "42069:42069"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/aesync
      AE_MDW_URL: https://mainnet.aeternity.io/mdw
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: aesync
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

## Separate Containers

For higher availability, split the sync engine and API server into separate services. This allows you to scale API replicas independently and restart the sync engine without downtime on the API.

### docker-compose.yml

```yaml
services:
  sync:
    build: .
    command: ["pnpm", "ae-sync", "start", "--hostname", "0.0.0.0"]
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/aesync
      AE_MDW_URL: https://mainnet.aeternity.io/mdw
    depends_on:
      db:
        condition: service_healthy

  api:
    build: .
    command: ["pnpm", "ae-sync", "serve", "--hostname", "0.0.0.0"]
    ports:
      - "42069:42069"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/aesync
    depends_on:
      db:
        condition: service_healthy
    deploy:
      replicas: 2

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: aesync
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

The `ae-sync serve` command starts the HTTP server with GraphQL and custom routes but does not run the sync engine. It reads from the same database that the sync container writes to.

## Health Checks

Use the built-in health endpoints in your orchestration:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:42069/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

The `/ready` endpoint returns HTTP 200 only when all contracts have completed backfill and are in real-time sync mode. Use this for Kubernetes readiness probes.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes (production) | PostgreSQL connection string |
| `AE_MDW_URL` | No | Override ae_mdw HTTP URL |
| `AE_MDW_WS_URL` | No | Override ae_mdw WebSocket URL |
| `AE_NODE_URL` | No | Override Aeternity node URL |

## Production Tips

- Always use PostgreSQL (not PGlite) in production
- Set `DATABASE_URL` as an environment variable rather than hardcoding in config
- Use `--hostname 0.0.0.0` to bind to all interfaces inside containers
- The `ae-sync start` command requires `DATABASE_URL` to be set and will exit if it's missing
- Monitor the `/health` endpoint for sync status and event processing metrics
