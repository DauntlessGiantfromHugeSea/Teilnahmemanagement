import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { CopyableKey } from "@/components/CopyableKey";
import { Role } from "@prisma/client";

export const metadata = { title: "Hilfe - FB-Akademie Teilnahmemanagement" };

export default async function HilfePage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const isAdmin = s.role === Role.ADMIN;
  const isAccounting = s.role === Role.ACCOUNTING || isAdmin;
  const canWrite = isAdmin || s.role === Role.EDITOR;

  const toc: { id: string; label: string; show: boolean }[] = [
    { id: "login", label: "Login & 2FA", show: true },
    { id: "dashboard", label: "Dashboard", show: true },
    { id: "events", label: "Veranstaltungen verwalten", show: true },
    { id: "teilnehmer", label: "Teilnehmer pflegen, umbuchen, exportieren", show: true },
    { id: "anwesenheit", label: "Anwesenheitsliste als PDF", show: true },
    { id: "anmeldung", label: "Öffentliche Anmeldeseite", show: true },
    { id: "buchhaltung", label: "Buchhaltung", show: isAccounting },
    { id: "admin", label: "Administration", show: isAdmin },
    { id: "csv", label: "CSV-Import", show: isAdmin },
    { id: "webhook", label: "WordPress-Webhook", show: isAdmin },
    { id: "webhook-newsletter", label: "Newsletter-Webhook", show: isAdmin },
    { id: "embed", label: "Anmeldeseite einbetten", show: isAdmin },
    { id: "pwa", label: "App installieren", show: true },
    { id: "sicherheit", label: "Sicherheit & Datenschutz", show: true },
  ];

  return (
    <Shell session={s} active="">
      <div className="flex gap-8">
        {/* Sticky Sidebar links */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-auto pr-2">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">Inhalt</div>
          <nav className="space-y-1 text-sm">
            {toc.filter((t) => t.show).map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="block py-1 text-slate-700 hover:text-brand-700 transition"
              >
                {t.label}
              </a>
            ))}
            {isAdmin && (
              <a
                href="/admin/help"
                className="block py-1 mt-3 text-brand-700 hover:underline font-medium border-t border-slate-200 pt-3"
              >
                → Komplettes Admin-Handbuch
              </a>
            )}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 max-w-3xl">
          <h1 className="text-2xl font-semibold mb-2">Hilfe &amp; Dokumentation</h1>
          <p className="text-sm text-slate-500 mb-8">
            Kurzanleitung zu den wichtigsten Funktionen. Bei Fragen wende dich an
            deinen Administrator.
          </p>

        <Section id="login" title="Login &amp; Zwei-Faktor-Authentifizierung">
          <p>
            Beim ersten Login wirst du gebeten, eine Authenticator-App (Google
            Authenticator, Authy, 1Password) per QR-Code einzurichten.
          </p>
          <p>
            Verlierst du das Gerät, kannst du dich über deinen Recovery-Code unter
            <Link className="text-brand-700 underline" href="/login/recovery"> /login/recovery </Link>
            neu authentifizieren. Pro Code geht das einmal — danach wirst du zur
            Neu-Einrichtung der 2FA geführt.
          </p>
          <p>
            Passwort ändern unter
            <Link className="text-brand-700 underline" href="/account/password"> Mein Konto → Passwort </Link>.
          </p>
        </Section>

        <Section id="dashboard" title="Dashboard">
          <p>
            Das Dashboard zeigt Anzahl Veranstaltungen, Teilnehmer und offene
            Rechnungen. Rechts siehst du die zehn neuesten Anmeldungen, links die
            nächsten Termine. Ein Klick auf eine Zeile springt direkt in das Detail.
          </p>
        </Section>

        <Section id="events" title="Veranstaltungen verwalten">
          <p>
            Unter <Link className="text-brand-700 underline" href="/events">Veranstaltungen</Link> liegen
            alle Termine. Aktuelle stehen oben, vergangene unter dem ausklappbaren Archiv.
          </p>
          {canWrite && (
            <>
              <p>
                <strong>Neue Veranstaltung anlegen:</strong> Klick rechts oben auf
                "Neue Veranstaltung". Wähle Format (Schulung vor Ort / Webinar),
                Dauer (1 oder 2 Tage), Inhalt + Preise, Termine, Ort oder Meeting-Link,
                Kapazität. Mit dem Button "Speichern &amp; weitere anlegen" kannst du
                im Schwung mehrere Events erfassen.
              </p>
              <p>
                <strong>Bearbeiten:</strong> in der Event-Detailseite oben rechts auf
                "Bearbeiten" - die gleiche Maske, vorausgefüllt.
              </p>
            </>
          )}
        </Section>

        <Section id="teilnehmer" title="Teilnehmer pflegen, umbuchen, exportieren">
          <p>
            Die Teilnehmertabelle in jeder Veranstaltung ist alphabetisch nach
            Nachname sortiert. Klick auf einen Eintrag öffnet die Detailseite mit
            allen Stammdaten.
          </p>
          {canWrite && (
            <>
              <p>
                <strong>Daten bearbeiten:</strong> in der Detailseite mittlere Karte.
                Änderungen werden im Verlauf protokolliert.
              </p>
              <p>
                <strong>Umbuchen:</strong> rechts in der Sidebar "Umbuchen" - Ziel-Event
                aus dem Dropdown wählen. Bei eintägigem Ziel-Event wird die Buchung
                automatisch auf Tag 1 gesetzt.
              </p>
              <p>
                <strong>Kommentare:</strong> interne Notizen je Teilnehmer (für andere
                Bearbeiter sichtbar, verschlüsselt gespeichert).
              </p>
            </>
          )}
        </Section>

        <Section id="anwesenheit" title="Anwesenheitsliste als PDF">
          <p>
            Auf jeder Event-Detailseite oben rechts ist der Primärbutton
            <strong> "Anwesenheitsliste (PDF)"</strong>. Klick lädt eine A4-quer
            Liste mit Logo, Event-Daten, Teilnehmertabelle (Name, Firma, PLZ, Ort,
            Bemerkungen, Unterschrift), Leerzeilen für Nachträge und Unterschriftslinien
            für Datum und Veranstaltungsleitung herunter.
          </p>
          <p>
            Bei 2-Tages-Events kannst du zusätzlich nur Tag 1 oder Tag 2 als
            separate PDF erzeugen.
          </p>
        </Section>

        <Section id="anmeldung" title="Öffentliche Anmeldeseite (WordPress / Direktlink)">
          <p>
            Jede Veranstaltung hat eine öffentliche Anmeldemaske, die ohne Login
            erreichbar ist und in WordPress als iframe eingebettet werden kann.
          </p>
          <p>
            <strong>Übersicht aller Anmeldungen:</strong> <Link className="text-brand-700 underline" href="/anmeldung">/anmeldung</Link>
          </p>
          <p>
            <strong>Direkt zu einem Event:</strong> <code className="font-mono text-xs">/anmeldung/&lt;event-id&gt;</code>
          </p>
          <p>
            Den fertigen iframe-Code findest du in der Event-Detailseite in der
            teal Karte "Öffentlicher Anmeldelink" zum Aufklappen.
          </p>
          <p>
            <strong>Spamschutz:</strong> Honeypot-Feld + Mindest-Verweildauer + optional
            Cloudflare Turnstile (wenn TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY
            in der Server-Config gesetzt sind).
          </p>
        </Section>

        {isAccounting && (
          <Section id="buchhaltung" title="Buchhaltung">
            <p>
              Unter <Link className="text-brand-700 underline" href="/accounting">Buchhaltung</Link> findest
              du eine flache Liste aller buchbaren Teilnehmer mit Name, Firma, Event
              und Endbetrag.
            </p>
            <p>
              Mit dem Button <strong>"RE gestellt"</strong> markierst du eine Rechnung
              als gestellt - die Zeile wird in Firmenfarbe ausgegraut. Der Filter oben
              schränkt die Liste auf eine einzelne Veranstaltung ein.
            </p>
            <p>
              Detail-Pflege (Rechnungsnummer, Bezahlt-Status, Notizen) erfolgt in der
              Teilnehmer-Detailseite.
            </p>
          </Section>
        )}

        {isAdmin && (
          <Section id="admin" title="Administration">
            <p>
              <strong>Benutzer:</strong> unter
              <Link className="text-brand-700 underline" href="/admin/users"> /admin/users </Link>
              anlegen, Rollen ändern, deaktivieren, 2FA zurücksetzen oder komplett
              deaktivieren. Mit "Zugriffe" siehst du, welche Events einem Nutzer
              sichtbar sind.
            </p>
            <p>
              <strong>Rollen:</strong>
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong>Administrator</strong> sieht alles, kann alles ändern.</li>
              <li><strong>Schreibrechte (Editor)</strong> kann Veranstaltungen und Teilnehmer pflegen, sieht aber nur freigegebene Events.</li>
              <li><strong>Buchhaltung</strong> sieht alle Events und Rechnungen.</li>
              <li><strong>Leserechte (Viewer)</strong> sieht nur freigegebene Events ohne Bearbeiten.</li>
            </ul>
            <p>
              <strong>Verlauf:</strong> unter
              <Link className="text-brand-700 underline" href="/admin/audit"> /admin/audit </Link>
              chronologisch alle relevanten Aktionen (Login, CSV-Import, Webhook-
              Anmeldung, Daten geändert, Rechnung gestellt, etc.).
            </p>
          </Section>
        )}

        {isAdmin && (
          <Section id="csv" title="CSV-Import">
            <p>
              Unter <Link className="text-brand-700 underline" href="/admin/import">/admin/import</Link> stehen
              zwei Importer:
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Anmeldungen-CSV</strong>: mit <code className="font-mono text-xs">training-date</code>
                {" "}Spalte. Events werden automatisch nach der ID erkannt oder angelegt.
              </li>
              <li>
                <strong>Kontakte-CSV</strong>: nur Stammdaten ohne Event-Bezug. Beim
                Upload wählst du das Ziel-Event aus.
              </li>
            </ul>
            <p>
              Doppel-Anmeldungen (gleiche E-Mail im selben Event) werden übersprungen.
              Nach dem Import siehst du eine Zusammenfassung pro Zeile.
            </p>
          </Section>
        )}

        {isAdmin && (
          <Section id="webhook" title="WordPress-Webhook (CF7)">
            <p>
              Anmeldungen aus dem Contact-Form-7-Formular werden direkt an das
              Tool weitergereicht. Doppelte Anmeldungen (gleiche Mail im selben
              Event) werden automatisch übersprungen. Mit dem Webhook entfällt
              der manuelle CSV-Import.
            </p>

            <h3 className="font-semibold text-slate-800 mt-4">1. API-Key</h3>
            <p>
              Der Key liegt server-seitig in der <code className="font-mono text-xs">.env</code>
              {" "}als <code className="font-mono text-xs">WEBHOOK_API_KEY</code>:
            </p>
            <div className="mt-2">
              <CopyableKey value={process.env.WEBHOOK_API_KEY ?? ""} label="WEBHOOK_API_KEY" />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Erzeugen lässt sich ein neuer Key auf dem Server mit
              {" "}<code className="font-mono">openssl rand -hex 32</code>. Nach
              Änderung muss der App-Container neu gestartet werden
              ({" "}<code className="font-mono">docker compose up -d app</code>).
            </p>

            <h3 className="font-semibold text-slate-800 mt-5">2. Endpunkt</h3>
            <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto">
{`POST https://teilnahme.fb-akademie.de/api/public/anmeldungen
Header:        X-Api-Key: <Key von oben>
Content-Type:  application/json`}
            </pre>
            <p className="text-xs text-slate-500 mt-1">
              Alternativ kann der Key auch als Query-Param <code className="font-mono">?api-key=…</code>
              {" "}übergeben werden (für Plugins ohne Header-Support).
            </p>

            <h3 className="font-semibold text-slate-800 mt-5">3. CF7 → Webhook konfigurieren</h3>
            <p className="text-sm">
              Plugin <strong>„CF7 to Webhook"</strong> (oder kompatibles) in
              WordPress installieren, im CF7-Formular im Reiter „Webhook":
            </p>
            <ul className="list-disc ml-5 text-sm space-y-1">
              <li><strong>Send to Webhook</strong>: aktivieren</li>
              <li>
                <strong>Webhook URL</strong>:
                <code className="block mt-1 font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                  https://teilnahme.fb-akademie.de/api/public/anmeldungen
                </code>
              </li>
              <li><strong>Method</strong>: POST &middot; <strong>Data Type</strong>: JSON</li>
              <li>
                <strong>Request Headers</strong> (eine Zeile):
                <code className="block mt-1 font-mono text-xs bg-slate-100 px-2 py-1 rounded break-all">
                  {`{"Content-Type":"application/json","X-Api-Key":"`}
                  {process.env.WEBHOOK_API_KEY?.slice(0, 6) ?? "…"}
                  {"…"}
                  {process.env.WEBHOOK_API_KEY?.slice(-4) ?? "…"}
                  {`"}`}
                </code>
                <span className="text-xs text-slate-500">
                  (Vollständigen Key oben einsetzen, Anführungszeichen beibehalten.)
                </span>
              </li>
              <li>
                <strong>Request Body</strong> (Feld-Mapping, deutsche CF7-Tag-Namen
                bleiben erhalten):
                <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto mt-1">
{`{
  "participant-name":     "[participant-name]",
  "company-name":         "[company-name]",
  "participant-email":    "[participant-email]",
  "phone-number":         "[phone-number]",
  "training-date":        "[training-date]",
  "billing-company-name": "[billing-company-name]",
  "billing-name":         "[billing-name]",
  "billing-street":       "[billing-street]",
  "billing-zipcode-city": "[billing-zipcode-city]",
  "billing-email":        "[billing-email]",
  "remarks":              "[remarks]"
}`}
                </pre>
              </li>
            </ul>

            <h3 className="font-semibold text-slate-800 mt-5">4. Pflichtfelder</h3>
            <p className="text-sm">
              Mindestens <strong>name</strong>, <strong>email</strong> und{" "}
              <strong>eines</strong> der drei Event-Felder müssen ankommen.
              Reihenfolge der Erkennung:
            </p>
            <ul className="list-disc ml-5 text-sm space-y-1">
              <li>
                <code className="font-mono text-xs">event-id</code>{" "}
                — interne Event-ID aus dem Tool (CUID, steht in der URL{" "}
                <code className="font-mono text-xs">/events/&lt;id&gt;</code>).
                Empfohlen für Formulare, die nur ein einzelnes Event abdecken.
              </li>
              <li>
                <code className="font-mono text-xs">external-id</code>{" "}
                — die Schulungs-ID mit Doppelkreuz, z. B.{" "}
                <code className="font-mono text-xs">#260603</code>. Event muss
                bereits existieren.
              </li>
              <li>
                <code className="font-mono text-xs">training-date</code>{" "}
                — vollständiger Wert wie aus der CF7-Select-Liste, inklusive
                <code className="font-mono text-xs"> (ID: #260603)</code>.
                Event wird automatisch angelegt, falls noch nicht vorhanden.
              </li>
            </ul>
            <p className="text-sm mt-2">
              Außerdem optional: <code className="font-mono text-xs">day-option</code>{" "}
              (<code className="font-mono text-xs">DAY_1</code>,
              <code className="font-mono text-xs"> DAY_2</code> oder
              <code className="font-mono text-xs"> BOTH</code>),
              <code className="font-mono text-xs"> nachname-vorname</code> als
              Alias für <code className="font-mono text-xs">participant-name</code>,
              <code className="font-mono text-xs"> strasse</code>,
              <code className="font-mono text-xs"> plz</code>,
              <code className="font-mono text-xs"> ort</code>,
              <code className="font-mono text-xs"> kostenstelle</code>,
              <code className="font-mono text-xs"> email-rechnung</code>.
            </p>

            <h3 className="font-semibold text-slate-800 mt-5">5. Antworten des Endpunkts</h3>
            <ul className="list-disc ml-5 text-sm space-y-1">
              <li><strong>201</strong> – neu angelegt</li>
              <li><strong>200</strong> + <code className="font-mono text-xs">status: "duplicate"</code> – war bereits vorhanden</li>
              <li><strong>400</strong> – Pflichtfeld fehlt</li>
              <li><strong>401</strong> – API-Key falsch oder fehlt</li>
              <li><strong>422</strong> – Datenfehler (z. B. Event abgesagt oder nicht gefunden)</li>
            </ul>

            <h3 className="font-semibold text-slate-800 mt-5">6. Manueller Test mit curl</h3>
            <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto">
{`curl -X POST https://teilnahme.fb-akademie.de/api/public/anmeldungen \\
  -H "X-Api-Key: <Key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event-id": "<id aus /events/...>",
    "participant-name": "Mustermann, Max",
    "participant-email": "max@example.com",
    "company-name": "Beispiel GmbH"
  }'`}
            </pre>

            <h3 className="font-semibold text-slate-800 mt-5">7. Erfolg prüfen</h3>
            <p className="text-sm">
              Im Tool unter <strong>Veranstaltungen → Event → Teilnehmer</strong>{" "}
              taucht die Anmeldung sofort auf. Bei Fehlern hilft der
              Audit-Verlauf (Admin → Verlauf): die Aktion heißt
              <code className="font-mono text-xs"> WEBHOOK_ANMELDUNG</code>.
            </p>
          </Section>
        )}

        {isAdmin && (
          <Section id="webhook-newsletter" title="Newsletter-Webhook (Kontaktformulare)">
            <p>
              Externe Kontakt- oder Newsletter-Formulare (z. B. ein separates
              CF7-Formular auf der Website) können neue Abonnenten direkt in die
              Mailing-Kontaktliste schicken. Es wird <strong>immer</strong> ein
              doppeltes Opt-In (DSGVO) ausgelöst – der Kontakt bekommt also zuerst
              eine Bestätigungsmail und erscheint erst nach Klick als „Aktiv" unter{" "}
              <strong>Newsletter</strong>.
            </p>

            <h3 className="font-semibold text-slate-800 mt-4">1. API-Key</h3>
            <p>
              Es gilt <strong>derselbe</strong> Key wie beim Anmelde-Webhook –
              server-seitig in der <code className="font-mono text-xs">.env</code>
              {" "}als <code className="font-mono text-xs">WEBHOOK_API_KEY</code>:
            </p>
            <div className="mt-2">
              <CopyableKey value={process.env.WEBHOOK_API_KEY ?? ""} label="WEBHOOK_API_KEY" />
            </div>

            <h3 className="font-semibold text-slate-800 mt-5">2. Endpunkt</h3>
            <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto">
{`POST https://teilnahme.fb-akademie.de/api/public/newsletter
Header:        X-Api-Key: <Key von oben>
Content-Type:  application/json`}
            </pre>

            <h3 className="font-semibold text-slate-800 mt-5">3. CF7 → Webhook konfigurieren</h3>
            <p className="text-sm">
              Wie beim Anmelde-Webhook, nur mit der Newsletter-URL und einem
              schlankeren Body. Im CF7-Formular im Reiter „Webhook":
            </p>
            <ul className="list-disc ml-5 text-sm space-y-1">
              <li><strong>Send to Webhook</strong>: aktivieren</li>
              <li>
                <strong>Webhook URL</strong>:
                <code className="block mt-1 font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                  https://teilnahme.fb-akademie.de/api/public/newsletter
                </code>
              </li>
              <li><strong>Method</strong>: POST &middot; <strong>Data Type</strong>: JSON</li>
              <li>
                <strong>Request Headers</strong>: identisch zum Anmelde-Webhook
                ({" "}<code className="font-mono text-xs">X-Api-Key</code> mit dem Key oben).
              </li>
              <li>
                <strong>Request Body</strong> (Feld-Mapping):
                <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto mt-1">
{`{
  "email":      "[your-email]",
  "first-name": "[first-name]",
  "last-name":  "[last-name]",
  "company":    "[company]",
  "tags":       "[tags]",
  "source":     "website-kontaktformular"
}`}
                </pre>
              </li>
            </ul>

            <h3 className="font-semibold text-slate-800 mt-5">4. Felder</h3>
            <p className="text-sm">
              Pflicht ist nur <strong>email</strong> (Aliase:{" "}
              <code className="font-mono text-xs">your-email</code>,{" "}
              <code className="font-mono text-xs">email</code>,{" "}
              <code className="font-mono text-xs">e-mail</code>,{" "}
              <code className="font-mono text-xs">mail</code>,{" "}
              <code className="font-mono text-xs">newsletter-email</code>). Optional:{" "}
              <code className="font-mono text-xs">first-name</code>/<code className="font-mono text-xs">vorname</code>,{" "}
              <code className="font-mono text-xs">last-name</code>/<code className="font-mono text-xs">nachname</code>,{" "}
              <code className="font-mono text-xs">your-name</code>/<code className="font-mono text-xs">name</code> (wird
              gesplittet),{" "}
              <code className="font-mono text-xs">company</code>/<code className="font-mono text-xs">firma</code>,{" "}
              <code className="font-mono text-xs">tags</code> (kommagetrennt) und{" "}
              <code className="font-mono text-xs">source</code>.
            </p>

            <h3 className="font-semibold text-slate-800 mt-5">5. Antworten des Endpunkts</h3>
            <ul className="list-disc ml-5 text-sm space-y-1">
              <li><strong>201</strong> + <code className="font-mono text-xs">status: "pending"</code> – neu, Bestätigungsmail verschickt</li>
              <li><strong>201</strong> + <code className="font-mono text-xs">status: "reactivated"</code> – war abgemeldet/ausstehend, neues Opt-In</li>
              <li><strong>201</strong> + <code className="font-mono text-xs">status: "already_subscribed"</code> – bereits aktiv, keine neue Mail</li>
              <li><strong>400</strong> – E-Mail fehlt oder ungültig</li>
              <li><strong>401</strong> – API-Key falsch oder fehlt</li>
              <li><strong>422</strong> – Verarbeitung fehlgeschlagen</li>
            </ul>

            <h3 className="font-semibold text-slate-800 mt-5">6. Manueller Test mit curl</h3>
            <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto">
{`curl -X POST https://teilnahme.fb-akademie.de/api/public/newsletter \\
  -H "X-Api-Key: <Key>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "interessent@example.com",
    "first-name": "Erika",
    "company": "Beispiel GmbH"
  }'`}
            </pre>

            <h3 className="font-semibold text-slate-800 mt-5">7. Kontakte einsehen</h3>
            <p className="text-sm">
              Neue Kontakte erscheinen unter <strong>Newsletter</strong> (im Header,
              nur für Admins) mit Status. Ausstehende Opt-Ins stehen auf
              „Ausstehend", bis der Bestätigungslink geklickt wurde.
            </p>
          </Section>
        )}

        {isAdmin && (
          <Section id="embed" title="Anmeldeseite einbetten & stylen">
            <p>
              Die öffentliche Anmeldeseite eines Events liegt unter{" "}
              <code className="font-mono text-xs">/anmeldung/&lt;event-id&gt;</code>{" "}
              und kann per <code className="font-mono text-xs">&lt;iframe&gt;</code> in
              WordPress eingebettet werden. Sie nutzt unten dokumentierte
              CSS-Klassen, die du in deinem WordPress-Theme oder per{" "}
              <code className="font-mono text-xs">style</code>-Block überschreiben kannst.
            </p>

            <h3 className="font-semibold text-slate-800 mt-4">Einbettung</h3>
            <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto">
{`<iframe
  src="https://teilnahme.fb-akademie.de/anmeldung/<event-id>"
  style="width:100%; min-height:1400px; border:0;"
  loading="lazy"
  title="Anmeldung"
></iframe>`}
            </pre>
            <p className="text-xs text-slate-500 mt-1">
              Die Event-ID steht in der URL des Tools unter{" "}
              <code className="font-mono">/events/&lt;id&gt;</code>.
            </p>

            <h3 className="font-semibold text-slate-800 mt-5">CSS-Klassen (Designsystem)</h3>
            <p className="text-sm">
              Alle Buttons, Karten, Inputs und Tabellen nutzen ein
              konsistentes Klassenschema. Im iframe-Kontext überschreibst du
              sie z. B. so:
            </p>
            <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto">
{`/* Eigene Markenfarbe und Schaltflächen */
.btn-primary {
  background: #1e3a8a !important;
  box-shadow: none !important;
}
.btn-primary:hover { filter: brightness(1.05); }

/* Karten an dunkles Theme anpassen */
.card {
  background: rgba(20, 20, 20, 0.78) !important;
  color: #f1f5f9 !important;
}`}
            </pre>

            <div className="overflow-x-auto mt-3">
              <table className="table w-full">
                <thead>
                  <tr><th>Klasse</th><th>Element</th><th>Beschreibung</th></tr>
                </thead>
                <tbody>
                  <tr><td><code className="font-mono text-xs">.btn</code></td><td>alle Buttons</td><td>Basis: Padding, Radius, Übergänge</td></tr>
                  <tr><td><code className="font-mono text-xs">.btn-primary</code></td><td>Haupt-Aktion</td><td>Türkiser Gradient mit weißer Schrift</td></tr>
                  <tr><td><code className="font-mono text-xs">.btn-secondary</code></td><td>Sekundäre Aktion</td><td>Glas-Look, transparent</td></tr>
                  <tr><td><code className="font-mono text-xs">.btn-danger</code></td><td>Destruktive Aktion</td><td>Roter Gradient</td></tr>
                  <tr><td><code className="font-mono text-xs">.btn-row</code></td><td>Mini-Button in Tabellen</td><td>Glas-Look, kleinere Schrift</td></tr>
                  <tr><td><code className="font-mono text-xs">.input</code></td><td>Form-Felder</td><td>Glas-Hintergrund, Fokus-Glow</td></tr>
                  <tr><td><code className="font-mono text-xs">.label</code></td><td>Label über Inputs</td><td>Klein, fett, slate-600</td></tr>
                  <tr><td><code className="font-mono text-xs">.card</code></td><td>Container</td><td>Glas-Karte mit Backdrop-Blur</td></tr>
                  <tr><td><code className="font-mono text-xs">.glass / .glass-strong</code></td><td>generische Glas-Flächen</td><td>Direkt einsetzbar</td></tr>
                  <tr><td><code className="font-mono text-xs">.table</code></td><td>Tabellen</td><td>Header transluzent, Zeilen-Hover</td></tr>
                  <tr><td><code className="font-mono text-xs">.badge</code></td><td>kleine Status-Pills</td><td>Pille mit Border</td></tr>
                  <tr><td><code className="font-mono text-xs">.toast-ok / .toast-error / .toast-warn</code></td><td>Hinweis-Banner</td><td>Erfolg / Fehler / Warnung</td></tr>
                  <tr><td><code className="font-mono text-xs">.topbar</code></td><td>Sticky-Header</td><td>Glas-Top-Bar (nur App-Bereich)</td></tr>
                  <tr><td><code className="font-mono text-xs">.menu-panel</code></td><td>Dropdowns</td><td>Floating-Glas-Menüs</td></tr>
                </tbody>
              </table>
            </div>

            <h3 className="font-semibold text-slate-800 mt-5">Designtokens (CSS-Variablen)</h3>
            <p className="text-sm">
              Lassen sich global überschreiben — am einfachsten direkt auf{" "}
              <code className="font-mono text-xs">:root</code>:
            </p>
            <pre className="font-mono text-xs bg-slate-100 px-3 py-2 rounded overflow-x-auto">
{`:root {
  --bg-base: #eef2f5;            /* Seitenhintergrund */
  --glass-bg: rgba(255,255,255,0.62);
  --glass-bg-strong: rgba(255,255,255,0.78);
  --text: #0f172a;
  --text-muted: #475569;
  --shadow-card: 0 1px 2px rgba(15,23,42,0.04), 0 12px 30px -18px rgba(15,23,42,0.18);
}`}
            </pre>

            <h3 className="font-semibold text-slate-800 mt-5">Markenfarbe</h3>
            <p className="text-sm">
              Brand-Türkis ist in Tailwind als{" "}
              <code className="font-mono text-xs">brand-{"{50..900}"}</code> definiert,
              Standardton <code className="font-mono text-xs">rgb(0, 126, 128)</code>.
              Verwendet u. a. von <code className="font-mono text-xs">.btn-primary</code>,
              Fokus-Ring der Inputs, aktive Nav-Pills und der Top-Streifen.
            </p>
          </Section>
        )}

        <Section id="pwa" title="App auf Handy / Desktop installieren">
          <p>Das Tool funktioniert als Progressive Web App (PWA):</p>
          <ul className="list-disc ml-5 space-y-1">
            <li><strong>iPhone Safari:</strong> Teilen → "Zum Home-Bildschirm".</li>
            <li><strong>Android Chrome:</strong> Drei-Punkte-Menü → "App installieren".</li>
            <li><strong>Desktop Chrome/Edge:</strong> Symbol in der Adressleiste (Monitor mit Pfeil).</li>
          </ul>
          <p>
            Beim Start öffnet sich die App ohne Browser-Chrome. Es werden bewusst keine
            sensiblen Daten offline gecached.
          </p>
        </Section>

        <Section id="sicherheit" title="Sicherheit &amp; Datenschutz">
          <p>
            Personenbezogene Felder (Name, E-Mail, Adresse, Telefon, Notizen,
            Rechnungsanschrift) werden im Datenbank-Klartext nicht abgelegt, sondern
            mit AES-256-GCM verschlüsselt. Suche und Dedupe von E-Mails laufen über
            einen HMAC-Hash, nicht über den Klartext.
          </p>
          <p>
            Sessions werden als signierte JWT-Tokens in HttpOnly-Cookies abgelegt
            (8 h Laufzeit). 2FA-TOTP nutzt 30 s Zeitschritte mit Toleranzfenster ±1.
          </p>
          <p>
            Jede schreibende Aktion wird im Verlauf (<Link className="text-brand-700 underline" href="/admin/audit">/admin/audit</Link>)
            mit Zeitstempel, Aktor und Diff protokolliert.
          </p>
        </Section>
        </div>
      </div>
    </Shell>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card p-6 mb-4 scroll-mt-20">
      <h2 className="text-lg font-semibold mb-3" dangerouslySetInnerHTML={{ __html: title }} />
      <div className="space-y-3 text-sm text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}
