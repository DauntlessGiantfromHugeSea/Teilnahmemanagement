# Posteingang / Ticket-System

Kundenmails aus einem oder mehreren Postfächern laufen als **Tickets** ins Tool.
Jedes Ticket hat eine Referenz (`FBA-7K2M9-4XQ1P`), die in Betreff und Fußzeile jeder
Antwort steht — dadurch landen Rückantworten automatisch wieder im selben Vorgang.

Neben dem Mailverlauf zeigt jedes Ticket, **bei welchen Schulungen der Absender
angemeldet ist oder war**, inklusive Rechnungsstatus und Zertifikaten.

---

## 1. Überblick

```
   Kunde                IMAP                  Tool                      SMTP
  ────────   ──────────────────────   ──────────────────────   ───────────────────
  schreibt → schulung@fb-akademie.de → /api/cron/mail-ingest → Ticket FBA-XXXXX-XXXXX
             info@fb-akademie.de        (alle 2 Min.)           ↓
                                                              /posteingang
                                                                ↓ Antwort
  erhält   ←──────────────────────────────────────────────── Betreff "… [FBA-…]"
  antwortet → zurück ins selbe Ticket (Message-ID oder Referenz)
```

Gelesen wird **nur** — es werden keine Mails verschoben, gelöscht oder als gelesen
markiert. Die Postfächer bleiben parallel in Outlook/Webmail ganz normal nutzbar.

## 2. Zuordnung eingehender Mails

Beim Import wird in dieser Reihenfolge geprüft:

1. **`In-Reply-To` / `References`** treffen eine bereits bekannte Message-ID → selbes Ticket.
2. **Referenz im Betreff oder Text** (`FBA-7K2M9-4XQ1P`) → selbes Ticket.
   Greift auch dann, wenn jemand eine komplett neue Mail schreibt und die Nummer zitiert.
3. Sonst → **neues Ticket**.

Übersprungen werden: bereits importierte Message-IDs, Mails vom eigenen Postfach
(eigene Antwortkopien) sowie Automaten-Mails (Abwesenheitsnotizen, Bounces,
`Auto-Submitted`-Header, `no-reply@…`).

## 3. Postfächer einrichten

**Administration → Postfächer** (`/admin/postfaecher`).

| Feld | Beispiel (All-Inkl/Kasserver) |
| --- | --- |
| E-Mail-Adresse | `schulung@fb-akademie.de` |
| Bezeichnung | `Schulung` |
| Absendername | `FB-Akademie Schulung` |
| IMAP-Server | `w020deb9.kasserver.com` |
| Port / SSL | `993` / ja |
| IMAP-Benutzer | `m07f3b68` oder die volle Adresse |
| IMAP-Passwort | Postfach-Passwort |
| Ordner | `INBOX` |

SMTP bleibt leer, wenn über dieselben Zugangsdaten bzw. die globale `SMTP_*`-Konfiguration
verschickt werden soll. Absender ist in jedem Fall die Adresse des Postfachs.

Mit **„Verbindung testen"** werden IMAP-Login (und falls konfiguriert SMTP) direkt geprüft.

> Beim ersten Abruf wird **nicht** das ganze Archiv importiert: Das Postfach startet bei der
> aktuellen UID und liest ab diesem Zeitpunkt mit. Bestehende Mails bleiben unangetastet.

Passwörter liegen mit `FIELD_ENCRYPTION_KEY` verschlüsselt in der Datenbank und werden
nie an den Browser ausgeliefert.

## 4. Abruf einrichten (Cron)

Der Abruf läuft über denselben Token wie die Erinnerungsmails:

```bash
# .env
CRON_TOKEN=<openssl rand -hex 32>
```

```cron
*/2 * * * * curl -fsS -H "Authorization: Bearer $CRON_TOKEN" \
  https://teilnahme.fb-akademie.de/api/cron/mail-ingest > /dev/null
```

Pro Lauf werden maximal 50 Mails je Postfach geholt; der Rest kommt beim nächsten Durchlauf.
**„Jetzt abholen"** in der Postfach-Verwaltung stößt denselben Vorgang von Hand an.

## 5. Arbeiten mit Tickets

`/posteingang` — Liste mit Filtern nach Status, Postfach und Zuständigkeit.
Die Suche findet Referenzen und E-Mail-Adressen (letztere über den Blind-Index;
Betreffe sind verschlüsselt und deshalb nicht serverseitig durchsuchbar).

**Status** laufen weitgehend von selbst:

| Status | wird gesetzt, wenn |
| --- | --- |
| Neu | Mail ist eingegangen, noch nichts passiert |
| In Bearbeitung | manuell, oder Kunde antwortet auf ein erledigtes Ticket |
| Wartet auf Kunde | automatisch nach dem Versand einer Antwort |
| Erledigt | manuell |

In der Ticket-Ansicht gibt es zusätzlich **interne Notizen** (werden nie verschickt),
Priorität, Zuweisung an einen Benutzer und rechts das **Kontaktprofil**: Name, Firma,
Telefon, Newsletter-Status, weitere Tickets derselben Adresse und die Schulungshistorie,
getrennt nach „kommend/laufend" und „vergangen", jeweils verlinkt auf den Teilnehmer-Datensatz.

Das Matching läuft ausschließlich über den HMAC-Blind-Index der E-Mail-Adresse — es
funktioniert also auch, obwohl alle Adressen verschlüsselt gespeichert sind.

**Zugriff**: `ADMIN`, `EDITOR` und `EVENTMANAGER`. Buchhaltung und Betrachter sehen den
Menüpunkt nicht. Postfächer anlegen darf nur `ADMIN`.

## 6. Signatur

Jeder Benutzer pflegt unter **Mein Konto → Meine E-Mail-Signatur** (`/account/signatur`)
Grußformel, Name, Titel, Firma, Telefon, Mobil/WhatsApp, Fax, E-Mail, Website, Anschrift
und LinkedIn. Leere Felder fallen auf den Benutzernamen bzw. die Login-Adresse zurück,
die Signatur lässt sich komplett abschalten.

Logo, Akzentfarbe, Fußzeile und Rechtstexte sind davon getrennt und gelten firmenweit:
**Administration → Mail-Design** (`/admin/mail-design`).

| Einstellung | Bedeutung |
| --- | --- |
| Logo | Upload (landet in der Media-Library) oder externe URL, plus Breite in Pixeln |
| Akzentfarbe | Kopfbereich der Mail, Icons und Links der Signatur |
| Fußzeile | Firmenname, Kontakt-E-Mail, optional Telefon — **unabhängig vom Postfach**, aus dem geantwortet wird |
| Rechtsangaben | eine Zeile je Angabe (Amtsgericht, Geschäftsführer, …) |
| Vertraulichkeitshinweis | deutsch und englisch |

Rechts auf der Seite steht eine Live-Vorschau einer Beispielantwort. Gespeichert wird alles
in der AppSetting `mail.signature.company`; die Standardwerte stehen in
`src/lib/mailSignature.ts`.

> Ein hochgeladenes Logo liegt unter `/uploads/…`. Für den Mailversand wird daraus
> automatisch eine absolute URL auf Basis von `APP_URL` — diese Variable muss also korrekt
> gesetzt sein, sonst sehen Empfänger kein Logo.

Die Vorschau („Vorschau im neuen Tab" bzw. „Vorschau" im Antwortfeld) rendert exakt das
HTML, das verschickt wird — keine Nachbildung.

## 7. Sicherheit

- Betreffe, Mailtexte, Adressen, Anhangsnamen und Postfach-Passwörter sind AES-256-GCM
  feldverschlüsselt (wie die übrigen PII der Anwendung).
- Eingehendes HTML wird serverseitig bereinigt (Script-, Style-, iframe-, Event-Handler-
  und `javascript:`-Entfernung) **und** zusätzlich nur in einem `<iframe sandbox>` ohne
  `allow-scripts`/`allow-same-origin` angezeigt.
- Zitierte Vorgänger-Mails werden beim Import abgeschnitten, damit der Verlauf lesbar bleibt.

## 8. Konfiguration

| Variable | Pflicht | Bedeutung |
| --- | --- | --- |
| `CRON_TOKEN` | ja | Bearer-Token für `/api/cron/mail-ingest` |
| `TICKET_REF_PREFIX` | nein | Präfix der Referenz, Default `FBA` |
| `FIELD_ENCRYPTION_KEY` | ja | verschlüsselt Inhalte und Postfach-Passwörter |
| `SMTP_*` | nein | Fallback-Versand, wenn ein Postfach kein eigenes SMTP hat |

Nach dem Update einmalig das Schema aktualisieren:

```bash
npx prisma db push      # oder: npx prisma migrate deploy
```

## 9. Smoke-Test

`scripts/test-tickets.ts` prüft den gesamten Weg (Import → Ticket → Referenz-Zuordnung →
Kontaktprofil) gegen eine **leere Testdatenbank**:

```bash
createdb tm_test
DATABASE_URL="postgresql://…/tm_test" npx prisma db push
DATABASE_URL="postgresql://…/tm_test" FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  npx tsx scripts/test-tickets.ts
```

Niemals gegen die Produktionsdatenbank laufen lassen — das Skript schreibt.
