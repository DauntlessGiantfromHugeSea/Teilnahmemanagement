# Webhook-Spezifikation: Anmeldungseingang

Technische Spezifikation des Endpunkts, der eingehende Anmeldungen (z. B. aus
WordPress / Contact Form 7) entgegennimmt und als Teilnehmer im passenden Event
anlegt.

Diese Datei beschreibt **das Vertragsverhalten** (Request/Response, Parsing,
Fehlerfälle) für die sendende Seite. Die Einrichtungs-Anleitung steht in
`WEBHOOK.md`. Quellen: `src/app/api/public/anmeldungen/route.ts` und
`src/lib/csvImport.ts`.

---

## 1. Endpunkt

| | |
| --- | --- |
| **Methode** | `POST` |
| **Pfad** | `/api/public/anmeldungen` |
| **Beispiel-URL** | `https://teilnahme.fb-akademie.de/api/public/anmeldungen` |
| **Content-Type** | `application/json` **oder** `application/x-www-form-urlencoded` **oder** `multipart/form-data` |

Ein `GET` auf denselben Pfad liefert nur einen Hinweis-JSON
(`{ "ok": true, "hint": "POST mit X-Api-Key Header." }`) und legt nichts an.

---

## 2. Authentifizierung

Der API-Key wird serverseitig aus der Umgebungsvariable `WEBHOOK_API_KEY`
gelesen und **muss mindestens 16 Zeichen** lang sein. Ist die Variable nicht
gesetzt oder kürzer, werden **alle** Anfragen mit `401` abgewiesen.

Der Key kann auf zwei Wegen übergeben werden (in dieser Reihenfolge geprüft):

```
X-Api-Key: <WEBHOOK_API_KEY>
```
oder
```
Authorization: Bearer <WEBHOOK_API_KEY>
```

Der Vergleich erfolgt längen- und zeichenweise (constant-time-artig). Bei
fehlendem oder falschem Key: `401`, ohne dass etwas angelegt wird. HTTPS ist
Pflicht.

---

## 3. Request-Felder

Alle Werte sind Strings. Pro logischem Feld werden mehrere **Aliase** akzeptiert
(der erste nicht-leere Treffer gewinnt). Das erlaubt sowohl die CSV-Spalten-Namen
(`kebab-case`) als auch `camelCase`-Varianten.

| Logisches Feld | Pflicht | Akzeptierte Schlüssel (Aliase) | Bedeutung |
| --- | --- | --- | --- |
| Teilnehmer-Name | **ja** | `participant-name`, `participantName`, `name` | "Nachname, Vorname" oder "Vorname Nachname" |
| Teilnehmer-E-Mail | **ja** | `participant-email`, `participantEmail`, `email` | E-Mail des Teilnehmers |
| Termin/Kurs | **ja** | `training-date`, `trainingDate` | Datum + Bezeichnung **inkl. `(ID: #…)`** — siehe §4 |
| Firma | nein | `company-name`, `companyName`, `company`, `firma` | Firma des Teilnehmers |
| Telefon | nein | `phone-number`, `phoneNumber`, `phone`, `telefon` | Telefon (CF7-Sicherheitswarnung wird entfernt) |
| Rechnungs-Firma | nein | `billing-company-name`, `billingCompanyName`, `billingCompany` | |
| Rechnungs-Empfänger | nein | `billing-name`, `billingName` | |
| Rechnungs-Straße | nein | `billing-street`, `billingStreet` | |
| Rechnungs-PLZ/Ort | nein | `billing-zipcode-city`, `billingZipcodeCity`, `billingZipCity` | |
| Rechnungs-E-Mail | nein | `billing-email`, `billingEmail` | |
| Bemerkungen | nein | `remarks`, `bemerkungen`, `notes` | Freitext, wird als Notiz gespeichert |

Fehlt eines der drei Pflichtfelder (Name, E-Mail, `training-date`), antwortet der
Endpunkt mit `400`. Unbekannte Zusatzfelder werden ignoriert.

---

## 4. Parsing von `training-date`

Aus diesem Feld werden Event, Termine und Buchungsoption abgeleitet. Beispiele:

```
16.06.2026 - 17.06.2026 Basisschulung + Technologieschulung 'Geoponton und Fernwärme' (ID: #260603)
18.03.2026 Basisschulung (ID: #260301)
17.06.2026 Technologieschulung 'Geoponton und Fernwärme' (ID: #260602)
```

**Regeln:**

1. **Event-ID (Pflicht):** Aus dem Muster `ID:\s*#?(\d+)` wird `#<ziffern>`
   extrahiert (z. B. `#260603`). Dies ist der eindeutige Schlüssel
   (`Event.externalId`). **Fehlt eine ID, wird die Anmeldung mit `422`
   abgelehnt.**
2. **Termine:** Ein Datumsbereich am Anfang (`dd.mm.yyyy - dd.mm.yyyy`) setzt
   `day1Date` und `day2Date`. Ein einzelnes Datum (`dd.mm.yyyy`) setzt nur
   `day1Date`. Format ist strikt `TT.MM.JJJJ`.
3. **Schulungstyp:** `Basisschulung` (case-insensitive) → `hasBasis`,
   `Technologieschulung` → `hasTechno`. Ein Thema in Anführungszeichen nach
   `Technologieschulung` (z. B. `'Geoponton und Fernwärme'`) wird als Titel
   übernommen.
4. **Buchungsoption (`dayOption`):**
   - beide Daten gesetzt → `BOTH`
   - nur Basis → `DAY_1`
   - nur Technologie → `DAY_2`
   - sonst (Fallback) → `DAY_1`

### Event- und Training-Anlage

- Existiert ein Event mit der `externalId` bereits, wird die Anmeldung diesem
  Event zugeordnet.
- Andernfalls wird automatisch ein **Training** (anhand des abgeleiteten Titels;
  Preise 0) und ein **Event** (`format = PRESENCE`, mit Datum/Daten) neu
  angelegt. Preise und Format können nachträglich im Tool angepasst werden.

---

## 5. Weitere Normalisierung

- **Name:** `"Nachname, Vorname"` → wird am Komma getrennt. Ohne Komma gilt das
  letzte Wort als Nachname, der Rest als Vorname (keine Titel-Erkennung).
- **E-Mail:** wird `trim`+`toLowerCase`. Über einen Blind-Index-Hash erfolgt die
  Dublettenprüfung.
- **Telefon:** ein vorangestellter Contact-Form-7-Hinweis
  (`(Sicherheitswarnung: …)`) wird entfernt.
- Sensible Felder (Name, E-Mail, Adresse, Telefon, Notizen) werden vor dem
  Speichern AES-256-GCM-verschlüsselt.

---

## 6. Duplikatserkennung

Eine Anmeldung gilt als Duplikat, wenn im **selben Event** bereits ein
Teilnehmer mit **derselben E-Mail** (gleicher `emailHash`) existiert. Dann wird
**kein** neuer Datensatz angelegt; es wird die ID des vorhandenen Teilnehmers
zurückgegeben (HTTP `200`, `status: "duplicate"`).

---

## 7. Antworten

### Erfolg

**`201 Created`** — neu angelegt:

```json
{
  "ok": true,
  "status": "created",
  "participantId": "clxxx…",
  "eventId": "clxxx…",
  "message": "Angelegt"
}
```

**`200 OK`** — Duplikat (bereits vorhanden):

```json
{
  "ok": true,
  "status": "duplicate",
  "participantId": "clxxx…",
  "eventId": "clxxx…",
  "message": "Bereits vorhanden (gleiche E-Mail im Event)"
}
```

### Fehler

Fehlerantworten haben das Format `{ "ok": false, "error": "<Text>" }`.

| Status | Bedeutung | Auslöser |
| --- | --- | --- |
| `400` | Bad Request | Body nicht lesbar **oder** Pflichtfeld (`participant-name` / `participant-email` / `training-date`) fehlt |
| `401` | Unauthorized | API-Key fehlt, ist falsch oder `WEBHOOK_API_KEY` ist nicht/zu kurz konfiguriert |
| `422` | Unprocessable Entity | Datenfehler beim Anlegen, v. a. **keine Event-ID in `training-date`** |

---

## 8. Audit

Jede erfolgreiche Verarbeitung schreibt einen Audit-Eintrag mit Aktion
`WEBHOOK_ANMELDUNG` (Felder `source: "webhook"`, `status`, `eventId`). Als Actor
wird der älteste Admin-Account verwendet. Sichtbar im Tool unter
**Verwaltung → Verlauf**.

---

## 9. Beispiele

### JSON

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

### Form-encoded

```bash
curl -X POST https://teilnahme.fb-akademie.de/api/public/anmeldungen \
  -H "X-Api-Key: $WEBHOOK_API_KEY" \
  --data-urlencode "participant-name=Max Mustermann" \
  --data-urlencode "participant-email=max@example.com" \
  --data-urlencode "training-date=18.03.2026 Basisschulung (ID: #260301)"
```

---

## 10. Newsletter-Webhook

Ein zweiter, generischer Webhook nimmt Newsletter-Anmeldungen entgegen (z. B.
aus einem separaten CF7-Formular). Quelle:
`src/app/api/public/newsletter/route.ts`, `src/lib/newsletter.ts`.

| | |
| --- | --- |
| **Methode / Pfad** | `POST /api/public/newsletter` |
| **Content-Type** | `application/json`, `application/x-www-form-urlencoded` oder `multipart/form-data` |
| **Auth** | identisch zu §2 — **derselbe** `WEBHOOK_API_KEY` (`X-Api-Key` oder `Authorization: Bearer`) |

Ein `GET` liefert nur einen Hinweis-JSON mit den Feldnamen.

### Felder

| Logisches Feld | Pflicht | Akzeptierte Schlüssel (Aliase) | Bedeutung |
| --- | --- | --- | --- |
| E-Mail | **ja** | `your-email`, `email`, `e-mail`, `mail`, `newsletter-email` | muss ein `@` enthalten |
| Vorname | nein | `first-name`, `firstName`, `vorname`, `your-firstname` | |
| Nachname | nein | `last-name`, `lastName`, `nachname`, `your-lastname` | |
| Voller Name | nein | `your-name`, `name` | wird gesplittet, falls Vor-/Nachname fehlen (1. Wort = Vorname, Rest = Nachname) |
| Firma | nein | `company`, `firma`, `company-name` | |
| Tags | nein | `tags`, `tag` | Komma-getrennt oder Array |
| Quelle | nein | `source`, `_source` | Default `cf7` |
| Einwilligungs-URL | nein | `page-url`, `_url`, `referer` | Beleg für Consent (sonst `Referer`-Header) |

Die Einwilligungs-IP wird aus dem `X-Forwarded-For`-Header (erste Adresse)
übernommen.

### Verhalten

- **Immer Double-Opt-In (DSGVO):** Es wird kein bestätigter Abonnent angelegt,
  sondern eine **Bestätigungsmail** verschickt. Erst nach Klick auf den Link ist
  die Person aktiv.
- **Idempotent über E-Mail** (`emailHash`):
  - existiert noch nicht → neuer Eintrag, Status `pending`
  - existiert als `PENDING`/`UNSUBSCRIBED`/`BOUNCED` → erneutes Opt-In, Status `reactivated`
  - existiert bereits als `SUBSCRIBED` → keine neue Mail, Status `already_subscribed`
- Name, E-Mail und Firma werden verschlüsselt gespeichert.

### Antworten

| Status | Body | Bedeutung |
| --- | --- | --- |
| `201` | `{ "ok": true, "status": "pending" \| "reactivated" \| "already_subscribed" }` | Erfolgreich verarbeitet |
| `400` | `{ "ok": false, "error": … }` | Body nicht lesbar oder E-Mail fehlt/ungültig |
| `401` | `{ "ok": false, "error": … }` | API-Key fehlt/falsch |
| `422` | `{ "ok": false, "error": … }` | Verarbeitung fehlgeschlagen |

### Beispiel

```bash
curl -X POST https://teilnahme.fb-akademie.de/api/public/newsletter \
  -H "X-Api-Key: $WEBHOOK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "interessent@example.com",
    "first-name": "Erika",
    "last-name": "Beispiel",
    "company": "Beispiel GmbH",
    "tags": "fernwaerme,basis",
    "source": "website-footer"
  }'
```
