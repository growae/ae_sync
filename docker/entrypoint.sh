#!/bin/bash
set -e

PG_DATA="/data/postgres"
PG_BIN="/usr/lib/postgresql/16/bin"

if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL data directory..."
    chown -R postgres:postgres "$PG_DATA"
    su - postgres -c "$PG_BIN/initdb -D $PG_DATA --encoding=UTF8 --locale=C"

    # Allow local connections without password for initial setup
    echo "local all all trust" > "$PG_DATA/pg_hba.conf"
    echo "host all all 127.0.0.1/32 md5" >> "$PG_DATA/pg_hba.conf"
    echo "host all all ::1/128 md5" >> "$PG_DATA/pg_hba.conf"

    # Configure PostgreSQL for performance
    cat >> "$PG_DATA/postgresql.conf" <<PGCONF
listen_addresses = 'localhost'
port = 5432
shared_buffers = 128MB
work_mem = 4MB
max_connections = 50
PGCONF

    # Start PostgreSQL temporarily for setup
    su - postgres -c "$PG_BIN/pg_ctl -D $PG_DATA -l /tmp/pg_setup.log start"
    sleep 2

    su - postgres -c "$PG_BIN/psql -c \"CREATE USER aesync WITH PASSWORD 'aesync';\""
    su - postgres -c "$PG_BIN/psql -c \"CREATE DATABASE aesync OWNER aesync;\""
    su - postgres -c "$PG_BIN/psql -c \"GRANT ALL PRIVILEGES ON DATABASE aesync TO aesync;\""

    su - postgres -c "$PG_BIN/pg_ctl -D $PG_DATA stop"
    echo "PostgreSQL initialized successfully."
fi

chown -R postgres:postgres "$PG_DATA"

# Configure AE network if specified
if [ -n "$AE_NETWORK" ]; then
    echo "Configuring for AE network: $AE_NETWORK"
    export AETERNITY_NETWORK="$AE_NETWORK"
fi

echo "Starting supervisord..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/aesync.conf
