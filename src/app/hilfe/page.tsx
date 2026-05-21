import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { Role } from "@prisma/client";

export const metadata = { title: "Hilfe - FB-Akademie Teilnahmemanagement" };

export default async function HilfePage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const isAdmin = s.role === Role.ADMIN;
  const isAccounting = s.role === Role.ACCOUNTING || isAdmin;
  const canWrite = isAdmin || s.role === Role.EDITOR;

  return (
    <Shell session={s} active="">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold mb-2">Hilfe &amp; Dokumentation</h1>
        <p className="text-sm text-slate-500 mb-8">
          Kurzanleitung zu den wichtigsten Funktionen. Bei Fragen wende dich an
          deinen Administrator.
        </p>

        {/* Inhalts-Verzeichnis */}
        <nav className="card p-4 mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
            Inhalt
          </div>
          <ul className="text-sm space-y-1">
            <li><a href="#login" className="text-brand-700 hover:underline">Login &amp; Zwei-Faktor-Authentifizierung</a></li>
            <li><a href="#dashboard" className="text-brand-700 hover:underline">Dashboard</a></li>
            <li><a href="#events" className="text-brand-700 hover:underline">Veranstaltungen verwalten</a></li>
            <li><a href="#teilnehmer" className="text-brand-700 hover:underline">Teilnehmer pflegen, umbuchen, exportieren</a></li>
            <li><a href="#anwesenheit" className="text-brand-700 hover:underline">Anwesenheitsliste als PDF</a></li>
            <li><a href="#anmeldung" className="text-brand-700 hover:underline">Öffentliche Anmeldeseite (WordPress / Direktlink)</a></li>
            {isAccounting && <li><a href="#buchhaltung" className="text-brand-700 hover:underline">Buchhaltung</a></li>}
            {isAdmin && <li><a href="#admin" className="text-brand-700 hover:underline">Administration</a></li>}
            {isAdmin && <li><a href="#csv" className="text-brand-700 hover:underline">CSV-Import</a></li>}
            {isAdmin && <li><a href="#webhook" className="text-brand-700 hover:underline">WordPress-Webhook</a></li>}
            <li><a href="#pwa" className="text-brand-700 hover:underline">App auf Handy / Desktop installieren</a></li>
            <li><a href="#sicherheit" className="text-brand-700 hover:underline">Sicherheit &amp; Datenschutz</a></li>
          </ul>
        </nav>

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
          <Section id="webhook" title="WordPress-Webhook">
            <p>
              Für die automatische Anmeldung aus Contact Form 7 setzt du
              <code className="font-mono text-xs"> WEBHOOK_API_KEY </code>
              in der <code className="font-mono text-xs">.env</code> des Servers und
              konfigurierst im CF7-Plugin den Endpunkt
              <code className="block mt-1 font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                POST https://teilnahme.fb-akademie.de/api/public/anmeldungen
              </code>
              mit Header
              <code className="block mt-1 font-mono text-xs bg-slate-100 px-2 py-1 rounded">
                X-Api-Key: &lt;dein-key&gt;
              </code>
            </p>
            <p>
              Details und Feld-Mapping stehen in der Datei <code className="font-mono text-xs">WEBHOOK.md</code> im Repo.
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
