#!/bin/bash
set -e
REPO="https://raw.githubusercontent.com/irulgood/v7/main/"
if [ -f "./api/install-api.sh" ]; then
  bash ./api/install-api.sh
else
  curl -L -k -sS "${REPO}api/install-api.sh" -o /tmp/install-api.sh
  bash /tmp/install-api.sh
fi
