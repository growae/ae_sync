#!/bin/bash

# Check ae_mdw is responsive
if ! curl -sf http://localhost:4000/v3/status > /dev/null 2>&1; then
    echo "ae_mdw not ready"
    exit 1
fi

# Check aesync health endpoint
if ! curl -sf http://localhost:42069/health > /dev/null 2>&1; then
    echo "aesync not ready"
    exit 1
fi

exit 0
