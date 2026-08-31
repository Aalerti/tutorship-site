#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example to .env and fill production values first." >&2
  exit 1
fi

git pull --ff-only --recurse-submodules
git submodule update --init --recursive

docker compose --env-file .env build
docker compose --env-file .env up -d
docker compose --env-file .env exec -T backend npm run prisma:seed
docker compose --env-file .env ps
