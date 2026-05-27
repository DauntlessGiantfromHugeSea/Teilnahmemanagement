# Webhook: Anmeldungen direkt aus WordPress

Statt CSVs manuell zu exportieren und hochzuladen, kann WordPress jede neue
Anmeldung direkt an die App schicken. Die Anmeldung landet sofort als
Teilnehmer im richtigen Event.

## 1. API-Key setzen

In `.env` auf dem Server einen langen Zufalls-Key ergaenzen, z.B.:

```bash
openssl rand -hex 32
```

Dann in `.env`:

```
WEBHOOK_API_KEY=ab12cd34...   # mindestens 16 Zeichen
```

Container neu starten:

```bash
docker compose up -d app
```

## 2. Endpoint

```
POST https://teilnahme.fb-akademie.de/api/public/anmeldungen
Header:  X-Api-Key: <der Wert von WEBHOOK_API_KEY>
Body:    application/json   ODER   application/x-www-form-urlencoded
```

Erwartete Felder. Mindestens **eines** der drei Event-Felder
(`event-id`, `external-id` oder `training-date`) ist Pflicht:

| Feld                      | Pflicht   | Beschreibung                                                            |
| ------------------------- | --------- | ----------------------------------------------------------------------- |
| `participant-name`        | ja        | "Nachname, Vorname" oder "Vorname Nachname"                             |
| `participant-email`       | ja        | E-Mail des Teilnehmers                                                  |
| `event-id`                | (1 von 3) | interne Event-Id (cuid) - empfohlen fuer einzelne CF7-Formulare         |
| `external-id`             | (1 von 3) | "#260603" - Event muss bereits existieren                               |
| `training-date`           | (1 von 3) | inkl. `(ID: #260603)` - legt fehlende Events automatisch an             |
| `day-option`              | nein      | `DAY_1`, `DAY_2` oder `BOTH` - bei Mehrtages-Event                      |
| `company-name`            | nein      | Firma des Teilnehmers                                                   |
| `phone-number`            | nein      | Telefon                                                                 |
| `billing-company-name`    | nein      | Rechnungsfirma                                                          |
| `billing-name`            | nein      | Rechnungs-Empfaenger                                                    |
| `billing-street`          | nein      | Strasse                                                                 |
| `billing-zipcode-city`    | nein      | PLZ + Ort                                                               |
| `billing-email`           | nein      | Rechnungs-E-Mail                                                        |
| `remarks`                 | nein      | Bemerkungen                                                             |

Bei erfolgreichem Anlegen schickt das System automatisch:

- eine **Anmeldebestaetigung** an die E-Mail des Teilnehmers
- eine **Admin-Benachrichtigung** an `MAIL_ADMIN` (falls gesetzt)

(siehe SMTP-Setup in `.env.docker.example`)

Antwort:

```json
{
  "ok": true,
  "status": "created",
  "participantId": "clxxx...",
  "eventId": "clxxx...",
  "message": "Angelegt"
}
```

- `201 Created`  -> neu angelegt
- `200 OK` mit `status: "duplicate"` -> war schon vorhanden (gleiche Mail im Event)
- `400` Pflichtfeld fehlt
- `401` API-Key falsch
- `422` Datenfehler (z.B. keine Event-ID im `training-date`)

## 3. WordPress mit Contact Form 7 anbinden

Du nutzt bereits **CF7 + Flamingo**. Fuer das Webhook brauchst du
zusaetzlich ein Plugin, das CF7-Submissions als HTTP-POST weiterleitet.
Bewaehrt:

- **CF7 to Webhook** (kostenlos, https://wordpress.org/plugins/cf7-to-webhook/)
- alternativ: **WP Webhooks** oder ein Zapier/Make-Zap

Vorgehen mit *CF7 to Webhook* fuer **ein** bestimmtes Event:

1. Event-Id im Tool kopieren: `/events` oeffnen, gewuenschtes Event waehlen,
   die Id steht in der URL (`/events/<id>`).
2. Im CF7-Formular ein **verstecktes Feld** hinzufuegen, das genau diese Id
   mitschickt. Mit "Contact Form 7 Hidden Field"- oder per Standard-Tag:
   ```
   [hidden event-id default:clxxxxxxxxxxxxxxxxxxxxxx]
   ```
3. Sicherstellen, dass das Formular folgende Tag-Namen hat (umbenennen oder
   im Plugin mappen):
   - `participant-name`
   - `participant-email`
   - `company-name`         (optional)
   - `phone-number`         (optional)
   - `billing-company-name`, `billing-name`, `billing-street`,
     `billing-zipcode-city`, `billing-email`  (optional)
4. Plugin installieren und aktivieren.
5. CF7-Formular oeffnen -> Reiter **Webhook**.
6. **Send to URL**: `https://teilnahme.fb-akademie.de/api/public/anmeldungen`
7. **Send as**: `JSON` (empfohlen) oder `Form Data`.
8. **Headers**: `X-Api-Key: <dein WEBHOOK_API_KEY>`
9. Speichern.

Test-Submission machen und im Tool unter **Verwaltung -> Verlauf** die
Aktion `WEBHOOK_ANMELDUNG` pruefen. Im Audit-Eintrag steht
`status: created` oder `status: duplicate`.

## 4. Sicherheit

- Der API-Key wird im `X-Api-Key` Header uebertragen (HTTPS Pflicht).
- Bei falschem oder fehlendem Key gibt der Endpoint `401` zurueck und
  legt nichts an.
- Es gibt **kein** Rate-Limit. Da der Key nur server-seitig im WP-Plugin
  liegt, ist das fuer einen geschlossenen Anwendungsfall ok. Bei Bedarf
  laesst sich der Caddy davor mit `@webhook header X-Api-Key ...` und
  einer `rate_limit`-Direktive haerten.

## 5. Manueller Test mit curl

Variante A - Event ueber interne Id (empfohlen fuer einzelne Formulare):

```bash
curl -X POST https://teilnahme.fb-akademie.de/api/public/anmeldungen \
  -H "X-Api-Key: $WEBHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event-id": "clxxxxxxxxxxxxxxxxxxxxxx",
    "participant-name": "Mustermann, Max",
    "participant-email": "max@example.com",
    "company-name": "Beispiel GmbH"
  }'
```

Variante B - klassisch ueber training-date (legt Event ggf. an):

```bash
curl -X POST https://teilnahme.fb-akademie.de/api/public/anmeldungen \
  -H "X-Api-Key: $WEBHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "participant-name": "Mustermann, Max",
    "participant-email": "max@example.com",
    "training-date": "18.03.2026 - 19.03.2026 Basisschulung + Technologieschulung (ID: #260303)",
    "company-name": "Beispiel GmbH",
    "billing-email": "rechnung@beispiel.de"
  }'
```

## 6. Mailing-Test

Als Admin eingeloggt:

```bash
curl -X POST https://teilnahme.fb-akademie.de/api/admin/mail/test \
  -H "Cookie: <Session-Cookie>" \
  -H "Content-Type: application/json" \
  -d '{ "to": "deine-adresse@example.com" }'
```

Antwort `{"ok":true,"messageId":"..."}` = SMTP funktioniert.
