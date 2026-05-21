#!/bin/sh
set -e

echo "[entrypoint] Warte auf Datenbank ..."
# Einfacher Retry-Loop fuer Prisma migrate deploy
for i in 1 2 3 4 5 6 7 8 9 10; do
  if npx --no-install prisma migrate deploy; then
    echo "[entrypoint] Migrationen angewendet."
    break
  fi
  echo "[entrypoint] DB noch nicht bereit, versuche es in 3s erneut ($i/10) ..."
  sleep 3
done

# Optional: Admin idempotent anlegen (laeuft jedes Mal, ist no-op wenn vorhanden)
if [ "${RUN_SEED_ON_START}" = "1" ]; then
  echo "[entrypoint] Admin-User wird sichergestellt ..."
  node /app/scripts/create-admin.cjs || true
fi

exec "$@"
