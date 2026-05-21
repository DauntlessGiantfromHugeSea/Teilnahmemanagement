# FB-Akademie Teilnahmemanagement

Web-Plattform zum Verwalten von Schulungs-Anmeldungen mit Rollen, 2FA, Feld-Verschluesselung,
Kommentaren, Audit-Log und Buchhaltungs-Dashboard.

## Features

- **Login + Pflicht-2FA (TOTP)** mit Recovery-Codes (Google Authenticator, Authy, 1Password, ...).
- **Rollen**: `ADMIN`, `EDITOR` (Schreibrechte), `ACCOUNTING` (Buchhaltung), `VIEWER` (Leserechte).
- **Pro-Event-Zugriffsrechte**: Admin kann Veranstaltungen einzelnen Usern freigeben (lesend oder schreibend).
- **Feldverschluesselung** (AES-256-GCM) fuer alle PII: Namen, E-Mail, Anschrift, Telefon, Notizen, Kommentare, RE-Notizen, Audit-Diffs.
  E-Mail zusaetzlich als deterministischer Blind-Index fuer Suche.
- **Schulungen** mit drei Preisen: Nur Tag 1 / Nur Tag 2 / Beide Tage.
- **Veranstaltungen** binden eine Schulung an Termine.
- **Teilnehmer** mit Buchungsoption, individuellem Rabatt (in %), Status und automatischer Endbetrags-Berechnung.
- **Buchhaltungs-Dashboard**: Filter nach Status (offen/gestellt/bezahlt/storniert) und Veranstaltung,
  Inline-Statuswechsel, Summen-KPIs.
- **Kommentare** pro Teilnehmer (verschluesselt).
- **Audit-Log/Verlauf**: pro Teilnehmer und global, mit verschluesselten Diffs.
- **Branding**: FB-Akademie-Logo eingebunden.

## Schnellstart

```bash
# 1) Abhaengigkeiten
npm install

# 2) Secrets generieren
echo "FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 48)" >> .env
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/teilnahmemanagement"' >> .env

# 3) Datenbank aufsetzen
npx prisma migrate dev --name init

# 4) Admin anlegen (optional via ENV ueberschreiben)
SEED_ADMIN_EMAIL=admin@fb-akademie.de \
SEED_ADMIN_PASSWORD='ChangeMe!2026' \
  npm run db:seed

# 5) Starten
npm run dev
# http://localhost:3000
```

Beim ersten Login wird die **2FA-Einrichtung erzwungen** (QR-Code scannen, Code bestaetigen,
Recovery-Codes speichern).

## Sicherheits-Hinweise

- `FIELD_ENCRYPTION_KEY` (64 hex chars) verschluesselt PII in der DB. **Verlust des Keys = Verlust der Daten.**
  Backup an einem getrennten, sicheren Ort aufbewahren.
- `SESSION_SECRET` signiert Session-Cookies; bei Rotation werden alle Sessions ungueltig.
- Cookies werden im Produktivbetrieb mit `Secure` gesetzt &mdash; HTTPS Pflicht.
- Passwoerter sind mit bcrypt (cost 12) gehasht.

## Rollen-Logik

| Rolle      | Schulungen | Veranstaltungen | Teilnehmer eintragen | Buchhaltung | User-Verwaltung |
|------------|------------|-----------------|----------------------|-------------|-----------------|
| ADMIN      | ja         | alle            | ja                   | ja          | ja              |
| EDITOR     | ja         | freigegebene    | ja (freigegeben)     | -           | -               |
| ACCOUNTING | -          | alle            | -                    | ja          | -               |
| VIEWER     | -          | freigegebene    | -                    | -           | -               |

## Architektur

- **Next.js 14 (App Router)** + React Server Components.
- **Prisma + PostgreSQL**.
- **jose** fuer signierte JWT-Cookies (Session + Pending-2FA).
- **otplib** fuer TOTP, **qrcode** fuer Setup-QR.
- **bcryptjs** fuer Passwoerter, **node:crypto** AES-256-GCM fuer Feldverschluesselung.
- **Tailwind CSS** fuer das UI.

## Endbetrags-Berechnung

```
basis      = Schulung.priceDay1 | priceDay2 | priceBoth   (je nach dayOption)
endbetrag  = round(basis * (10000 - discountBps) / 10000)
```

`discountBps` werden in Basispunkten gespeichert (1000 = 10,00 %), so dass Rabatte
zwei Nachkommastellen unterstuetzen ohne Float-Rundungsfehler.
