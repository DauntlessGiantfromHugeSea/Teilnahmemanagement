#!/bin/sh
# Diagnose fuer "weisse Seite, laedt ewig".
#
# Nur lesend - aendert nichts. Auf dem Server im Projektverzeichnis
# ausfuehren:
#
#   cd /opt/teilnahmemanagement && sh scripts/diagnose.sh
#
# Die Ausgabe zeigt der Reihe nach, wo die Anfrage haengen bleibt:
# Container, Anwendung, Datenbank oder der Proxy davor.

set -u
line() { printf '\n══════ %s ══════\n' "$1"; }

line "1. Container-Status"
# Laeuft die App ueberhaupt? 'Restarting' oder staendig neue Uptime =
# Absturzschleife, dann ist Abschnitt 3 die wichtigste Ausgabe.
docker compose ps 2>&1 || docker-compose ps 2>&1

line "2. Ressourcen"
# Wenn MEM% bei ~100 liegt, wird der Container vom Kernel getoetet (OOM)
# und neu gestartet - das sieht im Browser wie endloses Laden aus.
docker stats --no-stream 2>&1 | head -10
printf '\n-- Arbeitsspeicher des Hosts --\n'
free -h 2>&1
printf '\n-- Plattenplatz --\n'
df -h / 2>&1
printf '\n-- Wurde ein Prozess wegen Speichermangel getoetet? --\n'
(dmesg 2>/dev/null | grep -i -m5 "out of memory\|oom-kill") || echo "keine OOM-Meldung gefunden (oder dmesg nicht lesbar)"

line "3. Log der Anwendung (letzte 60 Zeilen)"
# Bleibt hier '[entrypoint] Warte auf Datenbank ...' stehen, haengt das
# Schema-Update - dann startet der Webserver nie. Siehe Abschnitt 5.
docker compose logs --tail=60 app 2>&1 || docker-compose logs --tail=60 app 2>&1

line "4. Antwortet die Anwendung direkt?"
# Umgeht Proxy und Internet. Antwortet das hier schnell, aber im Browser
# nicht, liegt das Problem an Caddy/nginx oder am Netz davor.
for path in /login /dashboard; do
  printf '%-12s ' "$path"
  docker compose exec -T app sh -c \
    "curl -sS -o /dev/null -m 25 -w 'HTTP %{http_code} nach %{time_total}s\n' http://127.0.0.1:3000$path" \
    2>&1 || echo "keine Antwort innerhalb von 25s"
done

line "5. Datenbank: Verbindungen, Wartezustaende, Sperren"
# 'idle in transaction' oder eine gesetzte wait_event_type bei vielen
# Zeilen bedeutet: Anfragen warten auf eine Sperre. Genau das laesst
# Seiten unbegrenzt laden.
docker compose exec -T db psql -U "${POSTGRES_USER:-tm}" -d "${POSTGRES_DB:-teilnahmemanagement}" -c \
"select count(*) as verbindungen,
        count(*) filter (where state = 'active')              as aktiv,
        count(*) filter (where state = 'idle in transaction') as haengend,
        (select setting from pg_settings where name = 'max_connections') as maximum
   from pg_stat_activity;" 2>&1

docker compose exec -T db psql -U "${POSTGRES_USER:-tm}" -d "${POSTGRES_DB:-teilnahmemanagement}" -c \
"select pid, state, wait_event_type, wait_event,
        left(regexp_replace(query, '\s+', ' ', 'g'), 70) as abfrage,
        now() - query_start as laeuft_seit
   from pg_stat_activity
  where datname is not null and pid <> pg_backend_pid()
  order by query_start
  limit 15;" 2>&1

line "6. Welcher Stand ist ausgecheckt?"
git rev-parse --abbrev-ref HEAD 2>&1
git log --oneline -3 2>&1
printf '\nZertifikats-Code vorhanden? '
[ -d src/app/admin/zertifikate ] && echo "ja" || echo "NEIN - dieser Stand hat die Zertifikate nicht"

line "Fertig"
echo "Diese Ausgabe komplett kopieren und zurueckschicken."
