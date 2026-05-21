# Deployment per Docker

Diese Anleitung beschreibt, wie du die Plattform auf deinem Server mit
Docker + Docker Compose betreibst, inklusive HTTPS via Reverse-Proxy.

## 1. Voraussetzungen auf dem Server

- Linux-Server (Ubuntu/Debian empfohlen) mit Root-/sudo-Zugriff
- Docker Engine + Docker Compose Plugin
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER  # neu einloggen danach
  ```
- Geoeffnete Ports: 80 + 443 (fuer den Reverse-Proxy). Die App selbst lauscht
  nur intern auf 127.0.0.1:3000.

## 2. Code auf den Server

```bash
git clone <DEIN_REPO_URL> /opt/teilnahmemanagement
cd /opt/teilnahmemanagement
git checkout claude/training-invitation-platform-4e1MM
```

## 3. .env anlegen

```bash
cp .env.docker.example .env

# Secrets generieren
echo "FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 48)" >> .env
# danach in .env die CHANGE_ME-Platzhalter ueberschreiben/entfernen
# und POSTGRES_PASSWORD setzen!
```

Wichtig:
- `FIELD_ENCRYPTION_KEY` ist der **Schluessel zu allen verschluesselten Daten**.
  Geht er verloren, sind die personenbezogenen Daten in der DB nicht mehr
  entschluesselbar. **Backup an einem zweiten, sicheren Ort.**
- `SESSION_SECRET` signiert die Login-Cookies. Rotation = alle User werden ausgeloggt.

## 4. Bauen und Starten

```bash
docker compose build
docker compose up -d
docker compose logs -f app
```

Beim ersten Hochfahren:
1. Postgres startet und ist nach ein paar Sekunden bereit.
2. Der App-Container fuehrt `prisma migrate deploy` aus (Schema anlegen).
3. Bei `RUN_SEED_ON_START=1` wird der Initial-Admin angelegt.
4. Der Server lauscht auf 127.0.0.1:3000.

Nach erfolgreichem ersten Start in der `.env` `RUN_SEED_ON_START=0` setzen
und neustarten:
```bash
docker compose up -d
```

## 5. HTTPS via Reverse-Proxy

Die App bindet bewusst nur an `127.0.0.1:3000`. Davor gehoert ein Reverse-Proxy
mit TLS. Beispiel **Caddy** (am einfachsten - Zertifikate vollautomatisch):

`/etc/caddy/Caddyfile`:
```
teilnahme.deine-domain.de {
    reverse_proxy 127.0.0.1:3000
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        Referrer-Policy strict-origin-when-cross-origin
    }
}
```

Setup:
```bash
sudo apt install -y caddy
sudo systemctl reload caddy
```

Caddy holt automatisch ein Let's-Encrypt-Zertifikat fuer die Domain.

**Alternative: nginx**
```nginx
server {
    listen 443 ssl http2;
    server_name teilnahme.deine-domain.de;
    ssl_certificate     /etc/letsencrypt/live/teilnahme.deine-domain.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/teilnahme.deine-domain.de/privkey.pem;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

Sobald HTTPS aktiv ist, in `.env` `APP_URL` auf die Domain setzen und
neustarten:
```bash
docker compose up -d
```

## 6. Updates einspielen

```bash
cd /opt/teilnahmemanagement
git pull
docker compose build app
docker compose up -d app
```
Migrationen werden beim Start automatisch angewendet.

## 7. Backups

Verschluesselte DB (alle PII sind doppelt geschuetzt - per AES im Feld und
optional auf Storage-Ebene).

```bash
# DB-Dump
docker compose exec -T db pg_dump -U tm teilnahmemanagement | gzip > /backup/tm-$(date +%F).sql.gz

# Restore
gunzip -c /backup/tm-2026-05-21.sql.gz | docker compose exec -T db psql -U tm -d teilnahmemanagement
```

Wichtig: **Backup des `FIELD_ENCRYPTION_KEY` getrennt aufbewahren** (z.B. Passwortmanager).
Ohne den Key sind die DB-Backups wertlos.

## 8. Nuetzliche Befehle

```bash
# Logs
docker compose logs -f app
docker compose logs -f db

# Admin-User nachtraeglich anlegen / Passwort neu setzen
docker compose exec app node /app/scripts/create-admin.cjs

# Prisma-Studio (lokaler Port-Forward, nicht auf prod offen lassen)
docker compose exec app npx prisma studio

# Container neu starten
docker compose restart app
```

## 9. Sicherheits-Checkliste

- [ ] `.env` hat 600er Rechte: `chmod 600 .env`
- [ ] DB-Port nicht nach aussen exponiert (siehe docker-compose: nur intern)
- [ ] HTTPS aktiv, HSTS-Header gesetzt
- [ ] `RUN_SEED_ON_START=0` nach Erst-Setup
- [ ] Initial-Admin-Passwort sofort nach erstem Login geaendert
- [ ] 2FA fuer alle Konten aktiv (erfolgt automatisch durch Pflicht-Setup)
- [ ] DB- und ENV-Backups getrennt voneinander aufbewahren
- [ ] Server-Updates regelmaessig: `sudo unattended-upgrades`
