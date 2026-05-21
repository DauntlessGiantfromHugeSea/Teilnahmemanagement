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

Erwartete Felder (gleiche Namen wie die CSV-Spalten):

| Feld                      | Pflicht | Beschreibung                                                                  |
| ------------------------- | ------- | ----------------------------------------------------------------------------- |
| `participant-name`        | ja      | "Nachname, Vorname" oder "Vorname Nachname"                                   |
| `participant-email`       | ja      | E-Mail des Teilnehmers                                                        |
| `training-date`           | ja      | inkl. `(ID: #260603)` - daraus werden Event und Termine erkannt               |
| `company-name`            | nein    | Firma des Teilnehmers                                                         |
| `phone-number`            | nein    | Telefon                                                                       |
| `billing-company-name`    | nein    | Rechnungsfirma                                                                |
| `billing-name`            | nein    | Rechnungs-Empfaenger                                                          |
| `billing-street`          | nein    | Strasse                                                                       |
| `billing-zipcode-city`    | nein    | PLZ + Ort                                                                     |
| `billing-email`           | nein    | Rechnungs-E-Mail                                                              |
| `remarks`                 | nein    | Bemerkungen                                                                   |

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

Vorgehen mit *CF7 to Webhook*:

1. Plugin installieren und aktivieren.
2. CF7-Formular oeffnen -> Reiter **Webhook**.
3. **Send to URL**: `https://teilnahme.fb-akademie.de/api/public/anmeldungen`
4. **Send as**: `JSON` (empfohlen) oder `Form Data`.
5. **Headers**: `X-Api-Key: <dein WEBHOOK_API_KEY>`
6. Bei *Send as JSON* die CF7-Tag-Namen so wie sie heissen abschicken
   (das Plugin nimmt im Default alle Felder mit). Falls die Tag-Namen
   abweichen, im Plugin-Mapping auf die Feldnamen aus der Tabelle oben
   umbenennen.
7. Speichern.

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
