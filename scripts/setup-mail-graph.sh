#!/bin/sh
# Stellt den Mailversand auf Microsoft Graph um.
#
#   bash scripts/setup-mail-graph.sh info@fb-akademie.de ["Anzeigename"]
#
# Das Skript ist wiederholbar: vorhandene Zeilen werden ersetzt, nicht
# angehaengt. Dadurch entstehen keine Dubletten, egal wie oft es laeuft.
# Geheimnisse werden weder gelesen noch ausgegeben - es setzt nur die vier
# Variablen des Versandwegs. Die MS_*-Zugangsdaten muessen bereits stehen.
set -eu

ENV_FILE=".env"
SENDER="${1:-}"
DISPLAY_NAME="${2:-FB-Akademie}"

if [ -z "$SENDER" ]; then
  echo "Aufruf: bash scripts/setup-mail-graph.sh <absender@domain.de> [\"Anzeigename\"]" >&2
  exit 2
fi
case "$SENDER" in
  *@*.*) : ;;
  *) echo "FEHLER: '$SENDER' sieht nicht wie eine E-Mail-Adresse aus." >&2; exit 2 ;;
esac
if [ ! -f "$ENV_FILE" ]; then
  echo "FEHLER: $ENV_FILE nicht gefunden. Das Skript muss im Projektverzeichnis laufen." >&2
  exit 2
fi

# --- Voraussetzungen pruefen -------------------------------------------------
fehlt=""
for key in MS_TENANT_ID MS_CLIENT_ID MS_CLIENT_SECRET; do
  wert=$(grep "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2-)
  [ -n "$wert" ] || fehlt="$fehlt $key"
done
if [ -n "$fehlt" ]; then
  echo "FEHLER: Diese Microsoft-Zugangsdaten fehlen oder sind leer:$fehlt" >&2
  echo "Ohne sie kann ueber Graph nicht verschickt werden." >&2
  exit 1
fi

# --- Sicherungskopie ---------------------------------------------------------
# Eindeutiger Name, damit zwei Laeufe in derselben Sekunde nicht die erste
# - und damit unveraenderte - Sicherung ueberschreiben.
BACKUP="${ENV_FILE}.vor-graph-$(date +%Y%m%d-%H%M%S)"
n=1
while [ -e "$BACKUP" ]; do
  BACKUP="${ENV_FILE}.vor-graph-$(date +%Y%m%d-%H%M%S)-${n}"
  n=$((n + 1))
done
cp "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP"

# --- Setzen oder ersetzen, nie doppelt ---------------------------------------
set_env() {
  key="$1"
  val="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    grep -v "^${key}=" "$ENV_FILE" > "${ENV_FILE}.tmp"
    mv "${ENV_FILE}.tmp" "$ENV_FILE"
  fi
  printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
}

set_env MAIL_TRANSPORT    "graph"
set_env MAIL_GRAPH_SENDER "$SENDER"
set_env MAIL_FROM         "$DISPLAY_NAME <$SENDER>"
set_env MAIL_REPLY_TO     "$SENDER"
chmod 600 "$ENV_FILE"

# --- Ergebnis zeigen (ohne Geheimnisse) --------------------------------------
echo "Sicherung: $BACKUP"
echo
echo "Gesetzt:"
for key in MAIL_TRANSPORT MAIL_GRAPH_SENDER MAIL_FROM MAIL_REPLY_TO; do
  printf '  %-18s %s\n' "$key" "$(grep "^${key}=" "$ENV_FILE" | cut -d= -f2-)"
done
echo
echo "Microsoft-Zugangsdaten (nur Laengen):"
for key in MS_TENANT_ID MS_CLIENT_ID MS_CLIENT_SECRET; do
  wert=$(grep "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2-)
  printf '  %-18s %d Zeichen\n' "$key" "${#wert}"
done

# --- Dubletten melden --------------------------------------------------------
dup=$(grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | sort | uniq -d | tr -d '=' | tr '\n' ' ')
if [ -n "$dup" ]; then
  echo
  echo "HINWEIS: doppelte Eintraege in $ENV_FILE: $dup"
  echo "Compose nimmt jeweils den letzten Wert. Aufraeumen mit:"
  echo "  tac $ENV_FILE | awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{if(s[\$1]++)next}1' | tac > .env.tmp && mv .env.tmp $ENV_FILE"
fi

echo
echo "Naechste Schritte:"
echo "  docker compose config >/dev/null && docker compose up -d app cron"
echo "  bash scripts/check-mail-graph.sh"
