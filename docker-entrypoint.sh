#!/bin/sh
set -e

PRISMA_BIN="/app/node_modules/prisma/build/index.js"

echo "[entrypoint] Warte auf Datenbank und wende Schema an ..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if node "$PRISMA_BIN" db push --skip-generate --accept-data-loss; then
    echo "[entrypoint] Datenbank-Schema aktuell."
    break
  fi
  echo "[entrypoint] DB noch nicht bereit, neuer Versuch in 3s ($i/10) ..."
  sleep 3
done

# Optional: Admin idempotent anlegen (laeuft jedes Mal, ist no-op wenn vorhanden)
if [ "${RUN_SEED_ON_START}" = "1" ]; then
  echo "[entrypoint] Admin-User wird sichergestellt ..."
  node /app/scripts/create-admin.cjs || true
fi

exec "$@"
