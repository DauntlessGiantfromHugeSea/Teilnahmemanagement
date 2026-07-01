# FBA Teilnahmemanagement — Session-Changelog

> Alle Änderungen der letzten Session, geordnet nach Themenblöcken.
> Dateiname für Obsidian-Import: `FBA-Teilnahmemanagement-Changelog.md`
> Branch: `claude/exciting-thompson-62kH8` — Deployment: `git pull && docker compose build app && docker compose up -d app`

---

## 1 · Fragen aus dem Portal (Q&A)

**Datenmodell**
- Neues Feld `EventQuestion.answer String?` — persistiert die Antwort des Admins für den Sammel-Versand.
- Public-Route `/api/portal/[id]/questions` speichert Namen jetzt defensiv: leerer Name wird als `null` gespeichert; Fallback für alte DB-Spalten mit `NOT NULL`.

**Admin-Workflow (`/events/<id>/questions`)**
- Aufgeteilt in zwei Bereiche:
  - **Offene Fragen** — Sammel-Formular mit Checkbox + eigener Antwort-Textarea pro Frage. Sticky-Toolbar oben mit:
    - `💾 Nur speichern` — Antworten in der DB sichern, ohne Mail
    - `✉️ Test an mich` — komplette Sammelmail nur an eigene Admin-Adresse
    - `📧 Sammel-Mail versenden` — eine Mail mit allen ausgewählten Q&A an alle aktiven Teilnehmer
    - Checkbox „Namen mitsenden (falls vorhanden)"
  - **Beantwortet (Historie)** — pro Eintrag: Frage, Name des Einreichers, Zeitstempel Eingereicht/Beantwortet, Antworttext in Lime-Box, interner Vermerk, Aktionen „wieder öffnen" / „löschen".
  - Grüner Hinweis „Alle offenen Fragen beantwortet" wenn Open-Liste leer ist.
- Alter „einzeln versenden"-Flow entfernt.
- Verwaltungs-Aktionen sind gate über `canManageEvent`.

**Fragen-Link-Einladung**
- Endpoint `/api/events/[id]/questions/invite` schickt allen aktiven Teilnehmern eine Einladungs-Mail mit Anker `/portal/<id>#fragen`.
- Test-Endpoint `/api/events/[id]/questions/invite/test` — Mail an eigene Admin-Adresse mit gelbem TEST-Banner.

**Portal-Seite `/portal/<id>`**
- Autorefresh von 20 Sekunden auf 5 Minuten hochgesetzt (Meta-Refresh).
- Frage-Formular funktioniert auch ohne Namensfeld.

---

## 2 · Wissenstest (Offline-Modus)

**Zweck:** PDF-basierte Multiple-Choice-Tests für Schulungen ohne Online-Zugang / als Fallback.

**Datenmodell**
- `Event.offlineMode Boolean` — pro Event schaltbar (Toggle).
- `WissenstestQuestion` (globale Fragenbank):
  - `text`, `options` (JSON-Array), `correctIdx`, `position`, `active`.
- `WissenstestResult` pro Teilnehmer:
  - `code` (6 Zeichen aus klar lesbarem Alphabet, unique), `correctCount`, `totalCount`, `notes`, `gradedAt`, `gradedById`.

**Admin (Sidebar → `Wissenstest-Fragen`, `/admin/wissenstest`)**
- CRUD für Fragen: Text, Optionen zeilenweise, Position, Aktiv-Flag, richtige-Antwort-Index.
- **Beispiel-Test importieren** — Button lädt die 12 Fragen aus dem mitgelieferten PDF „Wissenstest Flüssigboden — Mischplatz, Bodenmanagement & Flüssigbodenherstellung". Idempotent (Duplikate über Fragetext werden übersprungen).

**Pro-Event (`/events/<id>/wissenstest`)**
- Toggle „Offline-Modus für diese Schulung" (kein globales Setting).
- **„📄 Alle als PDF"** — gemergte PDF mit einem Bogen pro Teilnehmer.
- Tabelle mit allen Teilnehmern, Einzel-Download-Link pro Person, Ergebnis-Badge.
- Auswertungsmaske (nur bei aktivem Offline-Modus): Code eingeben → Richtig / Gesamt / Notiz → speichern.

**PDF-Layout** (`briefpapier-blank.pdf` als Hintergrund)
- Kopf: Wissenstest-Titel, Schulungstitel + Datum + Schulungs-ID, Teilnehmer-Name + Firma
- Nummerierte Fragen mit leeren Auswahlkästchen
- Am Ende: **großer Code in Firmenfarbe** + Feld „Richtige Antworten: __ / N"

**Codes** werden beim ersten Druck erzeugt und bleiben stabil — mehrfach drucken liefert immer denselben Code.

---

## 3 · Zertifikats-Validierung (`/zertifikat` + `/zertifikat/<slug>`)

**Öffentliche Validierungs-URLs bleiben unverändert** (keine neuen Slugs, keine QR-Neuerzeugung).

**Lookup-Seite `/zertifikat`**
- Hero im Teal-Gradient, Lookup-Feld, Hinweistext „Die Nummer finden Sie auf der Urkunde **unten links**".
- Feature-Kacheln (Echtheit / Gültigkeit / Widerruf) mit Lime-Icons.

**Ergebnis-Seite `/zertifikat/<slug>`**
- Große Headline oben statt kleinem Status-Button — status-abhängig:
  - **Zertifikat ist gültig** — Hero in Firmenfarbe (Teal)
  - **Zertifikat widerrufen** oder **Zertifikat abgelaufen** — Hero rot
  - **Noch nicht freigegeben** — Hero amber
- Untertitel je nach Status
- Karte darunter zeigt: Nummer, Teilnehmer/in, Schulung, Kompetenzfeld, Ausgestellt am, Gültig bis
- Status-Pille unten links in der Karte (kein großes Icon mehr)
- **Kein Download-Button** — PDF nur noch über `/meine-zertifikate` per OTP verfügbar.

**Abgelaufen-Erkennung:** wird aus `validUntilShort` (TT.MM.JJJJ) geparst und rot markiert.

---

## 4 · Rollen & Rechte (RBAC)

**VIEWER + `EventAccess.canWrite = true`** darf jetzt punktuell schreiben:
- Teilnehmer eintragen / bearbeiten
- Anwesenheit setzen
- Teilnehmer stornieren / umbuchen

**VIEWER darf NICHT** (auch mit Grant):
- Event-Metadata bearbeiten
- Seite gestalten (Blocks)
- Namensschilder
- Zertifikate (jedes Sub-Verhalten)
- Feedback (senden + Test)
- Fragen (beantworten, invite, batch)
- Wissenstest (Toggle, PDF, Grade)
- Rundmail
- Agenda
- Portal-Inhalte
- Portal-Link ↗
- Test-Erinnerung
- Veranstaltung absagen
- Event löschen

**Umsetzung:** neuer Helper `canManageEvent(session, eventId)` (ADMIN | EDITOR | EVENTMANAGER-mit-Grant). Alle Management-API-Routen und die betroffenen Sub-Seiten redirecten VIEWER zurück auf `/events/<id>`.

---

## 5 · Impersonation (Support-Login)

**Admin kann sich als beliebigen anderen User anmelden**, um dessen Sicht für Support-Zwecke zu prüfen.

- Button in `/admin/users` neben „Bearbeiten": **👤 Support**
- Session-Payload trägt `impersonatorUid` + `impersonatorName`
- **Sticky-Banner** oben in der Shell (amber): „Support-Modus: Du siehst die App als … — angemeldet durch …" + Button „← Zurück zu meinem Konto"
- Endpoint `POST /api/admin/users/[id]/impersonate` startet, `POST /api/admin/users/impersonate/stop` beendet
- Sicherheit: nur ADMIN, keine Verkettung, deaktivierte Konten nicht impersonierbar, sich selbst nicht, jeder Vorgang im `AuditLog` (Actions `IMPERSONATE_START` / `IMPERSONATE_STOP`)

---

## 6 · Umbuchen — vergangene Events erlaubt

- „Umbuchen"-Dropdown auf `/events/<id>/participants/<pid>` listete früher nur zukünftige Events. Jetzt: **alle nicht-abgesagten Events** inkl. vergangener.
- Vergangene sind mit **`[Archiv]`** markiert und mit einem Hinweis-Text darunter.
- Sortierung: neueste zuerst.

---

## 7 · Veranstaltungs-ID (`externalId`)

- Feld im Event-Formular unter „Titel": editierbare **Veranstaltungs-ID (YYMMNN)**, z. B. `260301` = März 2026, lfd. Nr. 01.
- Wird bei leerem Feld automatisch generiert (Basis = `day1Date`, sonst heute), Sequenz 01–99 pro Monat.
- Eindeutigkeits-Check gegen Konflikte.
- Wird beim Update auch nachträglich vergeben, wenn das Event noch keine hat.
- Fallback als Referenz im Webhook-Versand nutzbar.

---

## 8 · Brief auf Briefpapier (`/admin/brief`)

- Neue Admin-Seite zum Drucken eines leeren Briefes auf FBA-Briefpapier.
- Felder: Empfänger (mehrzeilig), Datum, Betreff, Anrede, Brieftext, Grußformel, Unterzeichner-Name + Rolle.
- Erzeugt PDF (`briefpapier-blank.pdf` als Hintergrund) und öffnet in neuem Tab.
- Kein Mailversand, keine DB-Speicherung.

---

## 9 · Feedback

- Feedback-Seite pro Event: **Test-Mail-Button** „✉️ Test an mich" verschickt komplette Feedback-Mail nur an Admin-Adresse (Preview) mit gelbem TEST-Banner.
- Bei 2-Tages-Events zusätzliche Buttons „Nur Tag-1-Teilnehmer" / „Nur Tag-2-Teilnehmer" (filtert nach `dayOption`).
- Fragebogen-Layout modernisiert (Hero, nummerierte Fragen mit Lime-Bubble, großer CTA).
- Danke-Seite mit Lime-Häkchen-Kreis.

---

## 10 · Design-Refresh (FBA-Website-Look)

**Tokens** (`tailwind.config.ts`)
- `accent` (Lime-Palette, Default `#d4ff3d`)
- `ink` (Dark-Navy-Palette, Default `#0a1f2c`)

**CSS-Utilities** (`globals.css`)
- `.fba-cta` — Lime-Pille (primary CTA)
- `.fba-cta-dark`, `.fba-cta-outline` — dunkle/Outline-Varianten
- `.fba-pill` — Eyebrow-Badge (Lime, ink-text, uppercase)
- `.fba-card` — Karte mit `rounded-3xl`
- `.fba-hero` — Teal-Gradient-Hintergrund

**Globale Komponenten**
- `.btn-primary` → **Lime-Pille mit dunklem Ink-Text** (rounded-full)
- `.btn-secondary` → weiße Pille mit dunklem Outline
- `.card` → `rounded-3xl` statt Glass-Blur
- `.input` → `rounded-2xl` mit klaren 1.5px-Borders
- Tabellen, Toasts, Status-Badges an FBA-Palette angeglichen

**Shell (Admin-Layout)**
- Topbar dunkelteal statt frosted glass
- Aktive Nav-Items als Lime-Pillen mit dunklem Text
- Logo invertiert weiß
- Avatar in Lime-Kreis

**Login (`/login`)**
- Zweispaltiges Layout — links Hero „Wissen. Qualität. Flüssigboden." im Teal-Gradient mit Lime-Pille, rechts Login-Karte
- Mobile collapsed auf eine Spalte
- Microsoft-Login als pillenförmiger Outline-Button
- Unbekannte Error-Codes werden 1:1 angezeigt (statt geschluckt) — für MS-SSO-Diagnose.

**Dashboard**
- KPI-Karten mit großen Bold-Zahlen in Ink-Navy + dezentem Lime-Akzent

**Teilnehmer-Portal `/portal/<id>`**
- Hero mit Lime-Pille
- JETZT-Karte mit Lime-Border
- Alle Sections auf `.fba-card`
- Frage-senden-Button als Lime-Pille

**Public-Anmeldung `/anmeldung/<id>`**
- Hero mit `fba-hero`-Gradient
- Datum-Badge als Lime-Pille
- Bold, tracking-tight Headlines

**Meine Zertifikate `/meine-zertifikate`**
- Hero + Lime-CTA
- PDF-Download-Button als Lime-Pille

---

## 11 · Portal-Tag-Logik

- Portal `/portal/<id>` blendet ab Tag 2 die Tag-1-Agenda **automatisch aus** (nur noch Tag 2 sichtbar).
- QR-Codes und Portal-Links bleiben unverändert (`slug` und Route sind stabil).
- Portal-Zeit-Berechnung explizit in `Europe/Berlin` (Container läuft UTC).

**Mitarbeiter-Schulungsportal `/portal/staff/<token>`**
- Filter greift jetzt: Event bleibt sichtbar, solange **Tag 1 ODER Tag 2** heute/in Zukunft liegen. Fix für den Fall, dass Tag 2 einer 2-Tages-Schulung aktuell läuft.

---

## 12 · Zertifikate-Bulk-Aktionen

- Kompetenzfeld-Auswahl-Popover „+ Zertifikat(e) mit Kompetenzfeld …" (Bulk + pro Zeile):
  - `z-index: 50`, `max-height: 70vh` / `50vh`
  - **absolute Positionierung** (statt inline expand) für die Per-Zeile-Version
  - Parent-Karten auf `overflow-visible` gestellt (`overflow-hidden` schnitt alles ab)
- Header zählt „(N verfügbar)" für Klarheit.

---

## 13 · Export-Toolbar

- „alle wählen / keine / Standard"-Buttons in `/exports/participants` funktionierten nicht (Next.js App Router mochte das inline `<script dangerouslySetInnerHTML>` mit `document.currentScript` nicht).
- Fix: neuer Client-Component `ExportToolbarScript` mit sauberem `useEffect`-Handler.

---

## 14 · Mail-Test-Endpoints (Übersicht)

Alle produktiven Mail-Aktionen haben jetzt Preview-/Test-Buttons, die nur an die eigene Admin-Adresse gehen (mit gelbem TEST-Banner in der Mail):

| Aktion | Test-Endpoint |
|---|---|
| Q&A-Fragen-Link-Einladung | `/api/events/[id]/questions/invite/test` |
| Q&A-Sammel-Antwort | `/api/events/[id]/questions/send-batch` mit `mode=test` |
| Feedback-Einladung | `/api/events/[id]/feedback/send/test` |
| 24 h-Reminder | `/api/events/[id]/reminder/test` (schon vorhanden) |

---

## 15 · Deployment-Notizen

- **Neue Schema-Felder** benötigen ein `db push` beim ersten Deploy:
  - `Event.offlineMode`
  - `EventQuestion.answer`
  - `WissenstestQuestion` (neue Tabelle)
  - `WissenstestResult` (neue Tabelle)

```bash
git pull origin claude/exciting-thompson-62kH8
docker compose exec app npx prisma db push
docker compose build app && docker compose up -d app
```

- Bei bereits laufenden Deployments ohne diese Änderungen: alle vorhandenen Portal-Links, QR-Codes, Zertifikats-Slugs, `staffPortalToken`, Feedback-Tokens und OTP-Flows bleiben funktional (kein Breaking Change).

---

## 16 · Datei-Übersicht der Änderungen

**Neue Dateien**
- `src/lib/eventId.ts` — Auto-Generator YYMMNN
- `src/lib/letterPdf.ts` — Brief-PDF-Renderer
- `src/lib/wissenstest.ts`, `src/lib/wissenstestPdf.ts` — Wissenstest-Kernlogik + PDF
- `src/components/ExportToolbarScript.tsx` — Client-Handler für Export-Toolbar
- `src/app/admin/wissenstest/page.tsx`, `src/app/admin/brief/page.tsx` — Admin-Seiten
- `src/app/events/[id]/wissenstest/page.tsx` — Event-Sicht Wissenstest
- Diverse `/api/…` Routes (Q&A-Batch, Wissenstest-CRUD/PDF/Grade/Toggle, Impersonate, Brief, Q&A-Invite + Test, Feedback-Test)

**Wesentlich geänderte Dateien**
- `prisma/schema.prisma` — neue Modelle + Felder
- `src/lib/rbac.ts` — VIEWER-Write, `canManageEvent`
- `src/lib/session.ts` — Impersonation-Payload
- `src/components/Shell.tsx` — dunkelteal Nav, Impersonation-Banner, neue Sidebar-Einträge
- `src/app/globals.css`, `tailwind.config.ts` — Lime/Ink-Design
- `src/app/events/[id]/page.tsx` — Aktions-Gates auf `canManage`
- `src/app/exports/participants/page.tsx` — Toolbar-Fix
- `src/app/zertifikat/[slug]/page.tsx`, `src/app/zertifikat/page.tsx` — Validation-Redesign
- Alle Sub-Event-Pages (Feedback, Fragen, Wissenstest, Agenda, Portal, Mailing, Blocks, Edit) — canManage-Gate
- Alle Management-API-Routen — `canManageEvent`

---

*Ende — bei Fragen einfach zurück in den Chat mit „Was hast du bei X geändert?" — kann alles im Detail nachziehen.*
