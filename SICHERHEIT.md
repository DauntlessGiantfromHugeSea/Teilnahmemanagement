# Sicherheit — Stand und offene Punkte

Dieses Dokument hält fest, was nach dem Sicherheits-Audit geändert wurde und was
beim Betrieb zu tun bleibt. Es ersetzt keine Prüfung, sondern beschreibt den
aktuellen Stand.

---

## 1. Was beim Deploy einmalig zu tun ist

Die Änderungen wirken teils erst, wenn die Umgebung mitzieht.

**Alle melden sich einmal neu an.** Die Sitzungs-Cookies tragen jetzt ihren
Verwendungszweck und den Widerrufsstand des Kontos. Alte Cookies erfüllen das
nicht und werden abgewiesen. Das passiert einmal beim Deploy, danach nicht mehr.

**Schema aktualisieren.** Vier neue Felder am Benutzer (`sessionEpoch`,
`twoFaFailedCount`, `twoFaLockedUntil`, `totpPendingSecret`). Der Container macht
das beim Start selbst (`prisma db push` im Entrypoint); bei Handbetrieb:

```bash
npx prisma db push
```

**Cron-Aufrufe prüfen.** `/api/cron/reminders` und `/api/cron/mail-ingest`
nehmen den Token nur noch im Header:

```
Authorization: Bearer <CRON_TOKEN>
```

Der Cron-Container in `docker-compose.yml` macht das bereits so. Ein externer
Watchdog mit `?token=…` bekommt ab jetzt 403 und muss umgestellt werden.

**`MS_GRAPH_MAILBOXES` setzen.** Nur Postfächer in dieser Liste dürfen die
tenantweiten Microsoft-Zugangsdaten verwenden. `docker-compose.yml` bringt
`schulung@fb-akademie.de info@fb-akademie.de` als Vorgabe mit; wer eine eigene
`.env` pflegt, muss die Variable dort setzen, sonst bleibt der Abruf stehen und
meldet das im Postfach-Status.

**`SEED_ADMIN_PASSWORD` für Neuinstallationen.** Es gibt kein Standardpasswort
mehr. Ohne gesetztes Passwort (mindestens 12 Zeichen) legt das Seeding kein
Konto an. Bestehende Installationen sind nicht betroffen.

---

## 2. Was geändert wurde

### Anmeldung und Sitzung

| Was | Vorher | Jetzt |
| --- | --- | --- |
| Token-Typen | Sitzung, 2FA-Zwischenstand und Portal-Token teilten ein Geheimnis ohne Typkennung — ein Zwischenstand ging als Sitzung durch | Jedes Token trägt seinen Zweck als `aud`, die Prüfung verlangt ihn (`src/lib/authAudience.ts`) |
| Rollenentzug, Kontosperre | wirkte erst nach bis zu 8 Stunden | wirkt sofort: Rolle und Status kommen bei jedem Zugriff frisch aus der Datenbank, `sessionEpoch` entwertet alte Cookies |
| Passwortwechsel | andere Sitzungen liefen weiter | beendet alle Sitzungen des Kontos, die eigene wird erneuert |
| 2FA-Einrichtung aufrufen | das bloße Rendern erzeugte ein neues Geheimnis und schaltete 2FA ab | der neue Schlüssel ist ein Kandidat (`totpPendingSecret`); übernommen wird er erst nach einem gültigen Code |
| 2FA-Pflicht umgehen | der Zwischenstand nach reinem Passwortlogin erlaubte, einen vorhandenen Faktor durch einen eigenen zu ersetzen | der Zwischenstand unterscheidet „Erst-Einrichtung" und „Faktor vorhanden"; nur Ersteres öffnet die Einrichtung, geprüft in Middleware **und** Route |
| Code raten | unbegrenzt | fünf Fehlversuche, dann 15 Minuten gesperrt — gemeinsam für TOTP, E-Mail-Code und Recovery-Codes |
| Recovery-Codes | standen als `?codes=` in der URL | kurzlebiges `httpOnly`-Cookie, Anzeige einmalig |
| Microsoft-SSO | verknüpfte jede Identität mit passender Adresse und schaltete `totpRequired` dauerhaft ab | verknüpft nur aus freigegebenen Tenants (`MS_LINK_TENANTS`), private Microsoft-Konten nie; `totpRequired` bleibt unangetastet |

### Posteingang

- **Absenderbindung** beim Einhängen eingehender Mails (siehe `POSTEINGANG.md`, Abschnitt 2).
- **Größenschranke** von 512 KB vor der HTML-Bereinigung; die Bereinigung läuft außerdem
  in zwei Durchläufen statt in 38.
- **Kontaktprofil** respektiert Veranstaltungsfreigaben.
- **Postfach-Freigabeliste** für den Rückfall auf tenantweite Graph-Zugangsdaten.

### Uploads

- Der Dateityp wird aus dem **Inhalt** bestimmt (Signatur am Dateianfang), nicht aus
  Content-Type und Dateiname des Hochladenden.
- **SVG ist nicht mehr zugelassen** — SVG ist ein aktives Dokument und darf Skripte
  enthalten. Erlaubt sind JPEG, PNG, WebP, GIF.
- Die Endung ergibt sich aus dem erkannten Typ.
- Die angekündigte Größe wird geprüft, **bevor** der Body eingelesen wird.
- Ersetzte Dateien (Unterschrift, Logo, Veranstaltungsbilder) werden gelöscht.
- Obergrenze für das gesamte Verzeichnis über `UPLOADS_MAX_TOTAL_MB` (Vorgabe 2 GB).

### Zertifikate und Export

- Widerrufen, Versenden und Löschen verlangen jetzt `canManageEvent` statt
  `canWriteEvent` — dieselbe Berechtigung, die die Oberfläche für diese Aktionen
  voraussetzt.
- **Neue** Zertifikate bekommen einen Zufallsanteil im Slug. Bereits ausgestellte
  behalten ihre Adresse: sie steht als QR-Code auf gedruckten Urkunden.
- CSV-Exporte (Newsletter, Mitarbeiter) entschärfen Formelpräfixe (`=`, `+`, `-`, `@`).

### Anwendungsweit

- **Content-Security-Policy** für alle Seiten, dazu `X-Content-Type-Options: nosniff`
  und `Referrer-Policy`. Die Header kommen jetzt nur noch aus `src/middleware.ts`;
  die doppelte Definition in `next.config.mjs` ist entfallen (zwei CSP-Header
  verschärfen sich gegenseitig und hätten die konfigurierten Einbettungen blockiert).
- **EDITOR** ist jetzt durchgängig global zuständig. Vorher durfte die Rolle eine
  Veranstaltung anlegen und ihre Detailseite anschließend nicht öffnen.

---

## 3. Was bewusst offen bleibt

**`script-src` enthält noch `'unsafe-inline'`.** Mehrere Seiten bringen kleine
Inline-Skripte mit (Druckansicht, Summen in der Buchhaltung). Gegen eingeschleustes
Inline-Script schützt die Richtlinie deshalb nicht; der Weg nach draußen — Nachladen
von fremden Servern, Umlenken von Formularen — ist zu. Der nächste Schritt wäre eine
Nonce-Variante, die jedes dieser Skripte umstellt.

**Bestehende Zertifikats-Adressen bleiben erratbar.** Die Prüfseite zeigt Vor- und
Nachnamen. Wer eine Nummer kennt, kann die Nachbarn durchprobieren. Die Adressen zu
ändern würde gedruckte QR-Codes unbrauchbar machen. Zu entscheiden wäre, ob auf der
Prüfseite überhaupt Namen stehen müssen — eine Echtheitsprüfung ginge auch mit
Namenseingabe und Ja/Nein-Antwort.

**Application Access Policy im Microsoft-Tenant.** `MS_GRAPH_MAILBOXES` ist die
Absicherung, die die Anwendung selbst durchsetzen kann. Die Berechtigung
`Mail.ReadWrite` gilt im Tenant trotzdem für alle Postfächer. Die Einschränkung auf
die beiden Servicepostfächer gehört zusätzlich in den Tenant — Anleitung in
`POSTEINGANG.md`, Abschnitt 3a.

**Kein Rate-Limit auf dem ersten Faktor.** Das Audit hat das ausdrücklich nicht als
Schwachstelle gewertet (bcrypt mit Kostenfaktor 12 bremst, die 2FA-Pflicht entwertet
ein erratenes Passwort). Als Härtung bleibt es sinnvoll und gehört in den
Reverse-Proxy.

**Nicht geprüfte Flächen.** Der Audit-Lauf deckte 14 Einheiten ab. Ungeprüft blieben
unter anderem die öffentlichen Anmeldeseiten als Server-Komponenten, die
Schulungs- und Preisrouten, der Kampagnen-Editor der Rundmails und jedes
Laufzeitverhalten. Dort gibt es keinen Negativbefund — es wurde schlicht nicht
geprüft.

---

## 4. Prüfskripte

```bash
# ohne Datenbank, überall lauffähig
npx tsx scripts/test-security.ts

# gegen eine LEERE Testdatenbank (Name muss "test" enthalten)
createdb tm_test
DATABASE_URL="postgresql://…/tm_test" npx prisma db push
DATABASE_URL="postgresql://…/tm_test" FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  npx tsx scripts/test-auth-limits.ts
DATABASE_URL="postgresql://…/tm_test" FIELD_ENCRYPTION_KEY=$(openssl rand -hex 32) \
  npx tsx scripts/test-tickets.ts
```

Niemals gegen die Produktionsdatenbank laufen lassen — die Skripte schreiben.
`test-auth-limits.ts` und `scripts/test-perf-listen.ts` weigern sich, wenn der
Datenbankname nicht „test" enthält.
