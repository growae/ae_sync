# Stage 1: ae_mdw binaries
FROM aeternity/ae_mdw:latest AS mdw

# Stage 2: Build ae_sync
FROM node:20-slim AS builder

RUN corepack enable pnpm

WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.build.json ./packages/core/
COPY packages/client/package.json packages/client/tsconfig.json packages/client/tsconfig.build.json ./packages/client/

RUN pnpm install --frozen-lockfile

COPY packages/core/src ./packages/core/src
COPY packages/client/src ./packages/client/src
RUN pnpm run build

# Stage 3: Runtime
FROM ubuntu:22.04

LABEL org.opencontainers.image.source="https://github.com/growae/ae_sync"
LABEL org.opencontainers.image.description="ae_sync — contract indexing framework for Aeternity"
LABEL org.opencontainers.image.licenses="MIT"

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    gnupg2 lsb-release curl ca-certificates supervisor \
    libssl3 libsodium23 libgmp10 libncurses6 \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update && apt-get install -y --no-install-recommends \
    postgresql-16 nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY --from=mdw /home/aeternity/ae_mdw /home/aeternity/ae_mdw
COPY --from=mdw /home/aeternity/node /home/aeternity/node

WORKDIR /app
COPY --from=builder /build/packages/core/dist ./dist
COPY --from=builder /build/packages/core/package.json ./package.json
COPY --from=builder /build/node_modules ./node_modules

COPY docker/supervisord.conf /etc/supervisor/conf.d/aesync.conf
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/healthcheck.sh /healthcheck.sh
RUN chmod +x /entrypoint.sh /healthcheck.sh

RUN mkdir -p /data/mnesia /data/mdw.db /data/postgres

EXPOSE 42069
# ae_mdw ports (uncomment if needed)
# EXPOSE 4000 4001
# AE node port (uncomment if needed)
# EXPOSE 3013

VOLUME ["/data/mnesia", "/data/mdw.db", "/data/postgres"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD /healthcheck.sh

ENTRYPOINT ["/entrypoint.sh"]
