# Teilnahmemanagement — Admin-Handbuch

Komplette Bedienungs- und Betriebsanleitung für die FBA-Anwendung.

> **Konventionen**
> - `<id>` = interne UUID (Event, Participant, Certificate, …)
> - URLs in den Beispielen mit `APP_URL = https://teilnahme.fb-akademie.de`
> - Öffentliche Endpunkte (`/anmeldung`, `/portal/...`, `/zertifikat/...`, `/feedback/...`, `/meine-zertifikate`) erfordern **keinen** Login.

---

## Inhalt

1. [System-Überblick (Diagramm)](#1-system-überblick-diagramm)
2. [Rollen und Rechte](#2-rollen-und-rechte)
3. [Setup auf dem Server](#3-setup-auf-dem-server)
4. [Authentifizierung (Login + MS-SSO)](#4-authentifizierung-login--ms-sso)
5. [Veranstaltungs-Flow](#5-veranstaltungs-flow)
6. [Zertifikate & Bescheinigungen](#6-zertifikate--bescheinigungen)
7. [Namensschilder + QR-Portale](#7-namensschilder--qr-portale)
8. [Automatischer 24h-Reminder](#8-automatischer-24h-reminder)
9. [Mail-Versand-Übersicht](#9-mail-versand-übersicht)
10. [Öffentliche URLs](#10-öffentliche-urls)
11. [Token & Secrets](#11-token--secrets)
12. [Troubleshooting](#12-troubleshooting)
13. [Datenmodell-Auszug + DSGVO](#13-datenmodell-auszug--dsgvo)

---

## 1 · System-Überblick (Diagramm)

```
                ┌────────────────────────────────────────────────────────┐
                │                Teilnahmemanagement                     │
                └────────────────────────────────────────────────────────┘
                                       │
        ┌─────────────────┬────────────┴────────────┬──────────────────┐
        ▼                 ▼                         ▼                  ▼
   ┌────────┐      ┌─────────────┐         ┌──────────────┐      ┌──────────┐
   │  ADMIN │      │   STAFF     │         │ TEILNEHMER   │      │  CRON    │
   │  /UI   │      │  (QR-Badge) │         │  (öffentlich)│      │ /15 min  │
   └───┬────┘      └──────┬──────┘         └──────┬───────┘      └────┬─────┘
       │                  │                       │                   │
       │                  ▼                       ▼                   ▼
       │           /portal/staff/<token>     /anmeldung/<id>     /api/cron/
       │           (Picker:                  (Anmeldung)         reminders
       │            heute laufende +                                  │
       │            anstehende Events)                                ▼
       │                  │                                    Versendet
       │                  ▼                                    24h-Reminder
       │           /portal/<eventId>                            an Teilnehmer
       │           (Live-Agenda,
       │            WLAN, Hinweise)
       │
       │
       ├─► /events                         Veranstaltungs-Übersicht
       │      └─► /events/<id>             Detail (Teilnehmer, Aktionen)
       │            ├─► /edit              Stammdaten, TN-Bescheinigungstexte
       │            ├─► /blocks            Anmeldeseite-Builder
       │            ├─► /participants/...  Einzelner Teilnehmer
       │            ├─► /access            Pro-User-Freigaben
       │            ├─► /agenda            Agenda-Editor + A3-PDF-Druck
       │            ├─► /portal            Portal-Inhalte (WLAN, Ankündigung…)
       │            ├─► /certificates      Zertifikate + TN-Bescheinigungen
       │            ├─► /feedback          Feedback-Versand + Auswertung
       │            └─► /mailing           Rundmail an alle Teilnehmer
       │
       ├─► /admin/users                    Benutzer + Rollen
       ├─► /admin/zertifikate              Alle Zertifikate global
       │      └─► /import                  CSV-Import historischer Daten
       ├─► /admin/kompetenzfelder          Zertifikats-Texte zentral
       ├─► /admin/feedback-fragen          Standard-Fragebogen zentral
       ├─► /admin/staff-badges             Mitarbeiter-Stammdaten + Badge-PDF
       ├─► /admin/newsletter, /audit, ...  Bestandsfeatures
       │
       └─► Token-geschützte Public-Routen:
              /zertifikat/<slug>           Validierung Cert (öffentlich)
              /zertifikat                  Eingabefeld zum Tippen
              /meine-zertifikate           Teilnehmer-Portal (OTP per Mail)
              /feedback/<token>            Feedback-Formular
              /portal/<id>                 Event-Portal (öffentlich)
              /portal/staff/<token>        Mitarbeiter-Portal (Token-URL)
```

### Event-Lifecycle (Sequenz)

```
Tag X-30   Event anlegen
            └─ Anmeldeseite öffentlich
            └─ optional iframe ?embed=1 auf fb-akademie.de

Tag X-21   Teilnehmer melden sich an (Bestätigungsmail)
            └─ Anwesenheits-Status REGISTERED/CONFIRMED

Tag X-7    Agenda erstellen
            └─ Portal-Inhalte pflegen (WLAN, Abendveranstaltung)
            └─ Zertifikat-Drafts erzeugen (Z + TN)
            └─ Bulk-Druck PDF unterschreiben/stempeln

Tag X-1    CRON 24h-Reminder
            └─ Mail an alle Teilnehmer mit Portal-Link
            └─ "info@fb-akademie.de für Fragen"

Tag X      SCHULUNG
            └─ Mitarbeiter-Badges scannen → Portal-Picker → /portal/<id>
            └─ Teilnehmer-Badges scannen → /portal/<id> direkt
            └─ Anwesenheit "✓ da / ✗" pro Teilnehmer setzen
            └─ Agenda im Portal live; bei Verzögerung Startzeit überschreiben

Tag X+1    Zertifikate freigeben (RELEASED)
            └─ "Alle freigegebenen per Mail versenden" (Portal-Link, nicht Anhang)
            └─ Feedback-Links versenden
            └─ Teilnehmer holt Cert über /meine-zertifikate (OTP)
            └─ Feedback-Antworten auswerten (Aggregate + Einzeln)
```

---

## 2 · Rollen und Rechte

| Rolle           | Sieht Events     | Schreibrecht     | Buchhaltung | Admin-Bereich |
|-----------------|------------------|------------------|-------------|---------------|
| **ADMIN**       | alle             | alle             | ja          | ja            |
| **ACCOUNTING**  | alle             | nein             | ja          | nein          |
| **EDITOR**      | nur freigegebene | alle (intern)    | nein        | nein          |
| **EVENTMANAGER**| nur freigegebene | nur freigegebene | nein        | nein          |
| **VIEWER**      | nur freigegebene | nein             | nein        | nein          |

- Freigaben pro Event über **„Zugriffe"**-Knopf (`/events/<id>/access`).
- EVENTMANAGER benötigt zusätzlich Häkchen „Schreibrecht" sonst nur lesen.

---

## 3 · Setup auf dem Server

### 3.1 Erst-Installation
```bash
git clone <repo> /opt/teilnahmemanagement
cd /opt/teilnahmemanagement
cp .env.example .env
nano .env                       # alle Variablen ausfüllen (siehe 3.3)
docker compose build
docker compose up -d
docker compose logs -f app
```

`prisma db push` läuft automatisch via Entrypoint — keine manuelle Migration.

### 3.2 Update
```bash
cd /opt/teilnahmemanagement
git pull
docker compose build app cron
docker compose up -d app cron
docker compose logs -f app
```

### 3.3 Environment-Variablen

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `DATABASE_URL` | ✓ | PostgreSQL-Connection-String |
| `SESSION_SECRET` | ✓ | ≥ 48 Zeichen; signiert alle Cookies |
| `APP_URL` | ✓ | Public Base-URL ohne `/` am Ende |
| `APP_NAME` | – | Anzeigename in Mails (Default „Flüssigboden Akademie") |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | – | Mailversand |
| `MAIL_FROM` | – | Absender (z.B. `"FBA <noreply@…>"`) |
| `MAIL_REPLY_TO` | – | Reply-To-Header |
| `MAIL_ADMIN` | – | BCC für Admin-Kopien |
| `MAIL_LOGO_URL` | – | Logo im Mail-Template |
| `BADGE_LOGO_URL` | – | Logo auf Namensschildern |
| `IFRAME_HOSTS` | – | Whitelist für `?embed=1`-iframe |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | – | Microsoft-SSO (siehe 4.3) |
| `CRON_TOKEN` | – | Bearer für `/api/cron/reminders`; ohne → kein 24h-Reminder |
| `RUN_SEED_ON_START` | – | `1` beim Erst-Start für Initial-Admin |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | – | Login für Initial-Admin |

### 3.4 Services in `docker-compose.yml`

- **db** — PostgreSQL
- **app** — Next.js (Port 3000 intern)
- **cron** — Alpine-Sidecar, ruft alle 15 Min. `/api/cron/reminders`

---

## 4 · Authentifizierung (Login + MS-SSO)

### 4.1 Klassischer Login
- E-Mail + Passwort
- TOTP (2FA) erzwungen wenn `User.totpRequired=true` (Default)
- Recovery-Codes im Profil generierbar

### 4.2 2FA-Pflicht pro User
- Schalter in `/admin/users/<id>/edit`
- Nach Erst-MS-Login wird `totpRequired` automatisch auf `false` gesetzt

### 4.3 Microsoft / Entra ID
Login-Button **„Mit Microsoft anmelden"** erscheint sobald `MS_CLIENT_ID` gesetzt.

Setup im Entra Admin Center:

1. **App-Registrierungen → Neue Registrierung**
   - Name: `FBA Teilnahmemanagement`
   - Kontotypen: **„Nur eigene Organisation"**
   - Umleitungs-URI (Web): `<APP_URL>/api/auth/microsoft/callback`
2. **API-Berechtigungen** → Microsoft Graph → Delegiert: `openid`, `email`, `profile` → **Administratorzustimmung erteilen**
3. **Zertifikate & Geheimnisse → Neuer geheimer Clientschlüssel** → Wert sofort kopieren
4. In `.env` setzen + Container neu bauen

Nicht angelegte E-Mails werden abgelehnt (keine Auto-Provisionierung). Andere Tenants werden serverseitig verworfen.

---

## 5 · Veranstaltungs-Flow

### 5.1 Anlegen
`/events/new` → Schulung, Titel, Termine (Tag 1 / optional Tag 2 / Extra-Tage), Zeitspanne, Ort/Webinar-Link, Kapazität.

### 5.2 Anmeldeseite öffentlich
- `/anmeldung/<id>` — Hero, Beschreibung, Agenda-Bullets, Formular
- Page-Builder: `/events/<id>/blocks`
- Embed (nur Formular): `/anmeldung/<id>?embed=1`

### 5.3 Teilnehmer-Operationen
- Eintragen: `/events/<id>/participants/new` oder via öffentliche Anmeldung
- **Anwesenheit** in der Liste: Buttons ✓ / ✗ / – (Schreibrecht erforderlich)
- **Stornieren** mit Checkbox „Teilnehmer per Mail informieren" + optionalem Grund
- **Veranstaltung absagen**: gleiches Pattern, mailt alle aktiven Teilnehmer

### 5.4 Rundmail
`/events/<id>/mailing`:
- Betreff + Body mit Platzhaltern `{firstName} {lastName} {eventTitle} {eventDate}`
- **„Testmail an mich"** → einzeln an den eingeloggten User, Betreff `[TEST]`
- **„An … Teilnehmer senden"** → an alle aktiven mit gültiger Adresse
- BCC an `MAIL_ADMIN` per Checkbox

### 5.5 Agenda
`/events/<id>/agenda`:
- Pro Tag eine Liste mit **Startzeit (Anker) + Dauer in Minuten**
- Alle Folge-Startzeiten werden serverseitig aus Anker + Summe der Dauern berechnet
- **Verzögerung**: Startzeit eines beliebigen Eintrags überschreiben → bekommt „Manuell"-Badge, alle folgenden Punkte verschieben sich ab dort
- „Auto-Cascade wiederherstellen" nimmt Override zurück
- Reihenfolge mit ↑/↓
- **„A3-Plakat (PDF) ↓"** rendert das Programm im FBA-Briefpapier-Design (für Wandaushang)

### 5.6 Event-Portal (öffentlich)
`/portal/<id>` zeigt:
1. Hero (FBA-Logo + Titel + Datum + Ort)
2. **„Jetzt"**-Karte (aktueller Agenda-Punkt) bzw. „Als Nächstes"
3. **Ankündigungen** (📣 amber Callouts)
4. **Info-Karten** (WLAN, Abendveranstaltung, Hinweise, Kontakt…)
5. Programm-Timeline
6. 30s Auto-Refresh

Pflege: **„Portal-Inhalte"** → `/events/<id>/portal` (Icon-Typen, Sichtbarkeit, ↑/↓).

### 5.7 Feedback
`/events/<id>/feedback`:
- Counter (Teilnehmer / versendet / Antworten)
- **„Feedback-Links an alle Teilnehmer senden"** — pro Person 1 Token-Link per Mail
- Aggregat-Auswertung (Histogramme Auswahl, Freitext-Listen) + pro Teilnehmer ausklappbare Antworten
- Frontend „Antworten sind anonym", **intern** über Token jederzeit zuordbar

Standard-Fragebogen zentral: Sidebar → **Feedback-Fragen** → `/admin/feedback-fragen` (13 Fragen vorbelegt, Typen Auswahl/Radio/Checkboxen/Text).

---

## 6 · Zertifikate & Bescheinigungen

### 6.1 Nummern
| Typ | Schema | Beispiel |
|---|---|---|
| Zertifikat | `JJ-INI-FBA/NNN` | `26-LM-FBA/991` |
| Teilnahmebescheinigung | `JJ-TN-INI-JJ/NNN` | `26-TN-SA-26/0` |

INI = Initialen Nachname+Vorname. Counter `certSeqZ` und `certSeqTN` getrennt, persistiert in AppSetting.

### 6.2 Flow
`/events/<id>/certificates`:
- **+ Teilnahmebescheinigung**: 1-Tages-Event → 1 TN; 2-Tages-Event → **2** TN (eine pro Tag, Datum + Body separat)
- **+ Zertifikat(e) (Kompetenzfelder wählen)**: pro Kompetenzfeld 1 Zertifikat (eigene Nummer)
- Status: **DRAFT** → **RELEASED** (→ optional **REVOKED**)
- Drafts vor der Schulung erzeugen + drucken (unterschreiben/stempeln)
- Nach Schulung: freigeben + per Mail versenden (Portal-Link, kein PDF-Anhang)

### 6.3 Druck-Varianten
- **Alle für den Druck (mit Briefkopf)** — FBA-Briefpapier als Hintergrund
- **Alle für den Druck (ohne Hintergrund, für Briefpapier)** — nur Text
- **Nur freigegebene drucken** (+ ohne-Hintergrund-Variante)
- Pro Cert: **PDF** und **PDF (Briefpapier)**
- Validierungs-Footer (Nr. + URL) auf jedem PDF

### 6.4 Versand → Teilnehmer-Portal
Mailversand schickt einen Link auf `/meine-zertifikate`:
1. Teilnehmer gibt seine Adresse ein
2. 6-stelliger OTP (10 Min., max. 5 Versuche)
3. Liste aller freigegebenen Zerts + Validierung + PDF-Download
4. Session 30 Min.

Mail-Aktionen:
- **„jetzt versenden"** pro Cert
- **„📧 Alle freigegebenen senden (X/Y)"** pro Teilnehmer
- **„Alle freigegebenen per Mail versenden"** Event-weit

### 6.5 Validierung (öffentlich)
- `/zertifikat/<slug>` direkter Status (gültig / widerrufen / nicht freigegeben)
- `/zertifikat` Eingabefeld zum Tippen

### 6.6 Globale Übersicht + CSV-Import
- **Alle Zertifikate**: `/admin/zertifikate` — Filter, Suche, **widerrufen** / **löschen** inline
- **CSV-Import** historischer Excel-Daten: `/admin/zertifikate/import` (Z + TN getrennt)
- **24-Monats-Gültigkeit nachtragen**: Knopf auf der Import-Seite ergänzt fehlende `validUntil` aus Ausstellungsdatum + 24 Monate

### 6.7 Zentrale Texte
**Zertifikat-Texte** → `/admin/kompetenzfelder`:
- Allgemein: Titel, Untertitel, Norm-Linie, Bewertungs-Zeile, Gültig-bis-Vorlage, Anrede-Label, Geschäftsführer-Name + Rolle, Gültigkeit in Monaten, Standard-TN-Body
- Kompetenzfelder: ID, Bezeichnung, Bestätigungstext (1:1 aus der bestehenden Vorlage)

### 6.8 TN-Body pro Event
Event bearbeiten → Block „Teilnahmebescheinigung":
- Beschreibungstext (Tag 1 / Eintagesseminar)
- Beschreibungstext (Tag 2) für 2-Tages-Schulungen

---

## 7 · Namensschilder + QR-Portale

### 7.1 Teilnehmer-Badges
Event-Detailseite → Namensschilder → Vorlage wählen.
- Vorderseite: Name + Firma, FBA-Logo
- **Rückseite: QR-Code → `/portal/<eventId>`**
- Duplex drucken, **Bindung lange Seite** (Standard)
- URL-Parameter: `?qr=0` (kein QR), `?flip=short` (Drucker mit Kurzseiten-Spiegelung)

### 7.2 Mitarbeiter-Badges
Sidebar → **Mitarbeiter-Badges** (`/admin/staff-badges`):
- Mitarbeiter werden in der DB gespeichert (Vor-/Nachname, Firma, optionaler Untertitel-Override)
- Status aktiv / archiviert (für historische Kollegen)
- Pro Person Reprint-Knopf, Sammeldruck-Knopf
- **Rückseite hat festen QR-Code → `/portal/staff/<TOKEN>`** — eine einmal gedruckte Karte funktioniert dauerhaft

### 7.3 Staff-Portal-Token
- Beim ersten Mitarbeiter-Badge-PDF in AppSetting `staffPortalToken` automatisch erzeugt (~24 Zeichen URL-safe)
- Sichtbar als „QR-Ziel-URL" auf der Admin-Seite
- **„Token erneuern"** rotiert den Token → alle bisher gedruckten Karten werden ungültig

### 7.4 Mitarbeiter-Portal-Picker
`/portal/staff/<TOKEN>`:
- Liste anstehender Events; heute laufende ganz oben mit „läuft heute"-Badge
- **Kein Auto-Redirect** — Mitarbeiter wählt aktiv aus
- Toggle „auch vergangene anzeigen"

---

## 8 · Automatischer 24h-Reminder

### 8.1 Funktion
Endpoint `/api/cron/reminders` (Bearer `CRON_TOKEN`):
- Findet Events mit `day1Date ∈ [jetzt+18h, jetzt+30h]` und ohne gesetztes `reminder24hSentAt`
- Mailt allen aktiven Teilnehmern mit gültiger Adresse:
  - Begrüßung + Eventtitel + Datum/Zeit/Ort
  - **Button → Schulungs-Portal**
  - Amber-Hinweis: „Bei Fragen unbedingt **info@fb-akademie.de**"
- Setzt `reminder24hSentAt = jetzt` → keine Doppel-Sends

### 8.2 Cron-Container
In `docker-compose.yml` läuft ein Alpine-Sidecar (Service `cron`), das alle 15 Minuten gegen den internen Hostnamen `app` einen HTTP-Call mit dem Token absetzt.

### 8.3 Test
Event-Detailseite → **„Test-Erinnerung an mich"** → schickt **dieselbe** Mail an die eigene Adresse. Setzt das sent-Flag NICHT, der echte Versand bleibt aktiv.

---

## 9 · Mail-Versand-Übersicht

| Auslöser | Empfänger | Endpoint |
|---|---|---|
| Öffentliche Anmeldung | Teilnehmer (Bestätigung) | `/api/public/anmeldungen` |
| Storno einzelner Teilnehmer | dieser Teilnehmer (optional) | `/api/participants/<id>/cancel` |
| Event komplett absagen | alle aktiven Teilnehmer (optional) | `/api/events/<id>/cancel` |
| Rundmail | alle Teilnehmer | `/api/events/<id>/mailing/send` |
| Zertifikat-Versand (Portal-Link) | einzeln/Bulk | `/api/certificates/<id>/send`, `/api/events/<id>/certificates/send-batch` |
| Feedback-Einladung | alle Teilnehmer | `/api/events/<id>/feedback/send` |
| OTP für Teilnehmer-Portal | Anfragende Adresse | `/api/meine-zertifikate/request` |
| 24h-Reminder | aktive Teilnehmer | `/api/cron/reminders` |

Alle Adressen werden vor Übergabe an SMTP geprüft (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`).

---

## 10 · Öffentliche URLs

| Zweck | Muster |
|---|---|
| Anmeldeseite | `/anmeldung/<eventId>` |
| Anmeldeseite (Embed) | `/anmeldung/<eventId>?embed=1` |
| Event-Portal | `/portal/<eventId>` |
| Mitarbeiter-Portal | `/portal/staff/<staffPortalToken>` |
| Cert-Validierung (mit Nummer) | `/zertifikat/<slug>` |
| Cert-Validierung (Eingabe) | `/zertifikat` |
| Feedback-Formular | `/feedback/<token>` |
| Teilnehmer-Portal | `/meine-zertifikate` |

---

## 11 · Token & Secrets

| Token / Secret | Quelle | Zweck | Rotation |
|---|---|---|---|
| `SESSION_SECRET` | `.env` | Signiert Cookies (Login, OTP, Portal, MS-SSO-State) | nur bei Verdacht; invalidiert alle Sessions |
| `CRON_TOKEN` | `.env` | Schützt `/api/cron/reminders` | beliebig |
| `MS_CLIENT_SECRET` | `.env` | Microsoft OAuth | im Entra Admin Center rotieren |
| `staffPortalToken` | AppSetting | URL-Geheimnis Mitarbeiter-Portal | UI „Token erneuern" |
| `certSeqZ`, `certSeqTN` | AppSetting | Counter Zertifikatsnummern | nicht manuell |
| `feedbackQuestions`, `certTexts`, `certKompetenzfelder` | AppSetting | JSON-Inhalte | jeweilige Admin-Seite |
| `CertificateOtp` | DB-Tabelle | 6-stellige Codes, SHA-256 gehasht | auto-Ablauf (10 Min.) |
| `FeedbackInvite.token` | DB-Tabelle | URL-Geheimnis pro Teilnehmer+Event | wird beim Senden erzeugt |

---

## 12 · Troubleshooting

| Symptom | Ursache | Lösung |
|---|---|---|
| MS-Login schlägt fehl | Tenant-ID stimmt nicht | `MS_TENANT_ID` muss exakt die GUID aus Entra sein |
| „Für diese Adresse ist kein Benutzer angelegt" | Kein Match über E-Mail | User vorher in `/admin/users` anlegen |
| Mail-Versand „Invalid to" | Verschlüsselte E-Mail kaputt entschlüsselt oder leer | DB-Eintrag prüfen, Adresse korrigieren |
| Reminder-Mails kommen nicht | `CRON_TOKEN` leer oder cron-Container down | `.env` setzen, `docker compose logs cron` |
| Portal zeigt veraltete Agenda | Mobile-Browser pausiert 30s-Refresh | Seite manuell neu laden |
| PDF zeigt Ränder | Druckdialog skaliert | „Originalgröße / 100 %" |
| Cert-Versand schickt PDF nicht | Bewusst so — Portal-Link statt Anhang | OTP-Login im Teilnehmer-Portal |

---

## 13 · Datenmodell-Auszug + DSGVO

### Wichtige Modelle
- **User** — Login, Rolle, MS-OID, 2FA-Status
- **Event** — Veranstaltung mit Termin, Customizing, Cert-Defaults, Portal-Blöcken, Agenda
- **Participant** — verschlüsseltes PII, Status, Buchhaltung
- **EventAccess** — pro-User-Freigabe für EVENTMANAGER/EDITOR/VIEWER mit `canWrite`
- **EventAgendaItem** — Agenda-Punkt; `startTimeManual` Flag für Verzögerungs-Overrides
- **EventPortalBlock** — Info-Block fürs Portal mit Icon-Typ
- **Certificate** — Zertifikat oder TN; Nummer + Slug + Snapshot in `data` (JSON)
- **CertificateOtp** — OTP-Codes für `/meine-zertifikate`
- **FeedbackInvite + FeedbackResponse** — Token + Antworten
- **Staff** — Mitarbeiter-Stammdaten für wiederverwendbare Badges
- **AppSetting** — Key/Value-Store für globale Konfiguration

### DSGVO
- PII (Name, E-Mail, Telefon, Adresse, Rechnungsanschrift, Notizen) ist mit **AES-256-GCM verschlüsselt**
- Lookups laufen über HMAC-SHA-256-Hashes (`emailHash`)
- Zertifikate enthalten Klartext-Snapshots im `data`-Feld (öffentliche Validierung notwendig)
- **Audit-Log** (`AuditLog`) zeichnet Login, Änderungen, Mailversand, Statusübergänge auf
- Tägliche DB-Backups ausserhalb des Containers organisieren (Postgres-Dump)
