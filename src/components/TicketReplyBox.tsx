import Link from "next/link";

// Antwortfeld unter dem Ticket-Verlauf.
//
// Bewusst ein reines HTML-Formular ohne Client-JS: Die Vorschau ist ein
// zweiter Submit-Button, der dieselbe Route mit preview=1 in einem neuen Tab
// oeffnet und das fertig gerenderte HTML zurueckgibt - also exakt das, was
// der Kunde zu sehen bekommt, nicht eine Nachbildung davon.

interface Props {
  ticketId: string;
  defaultTo: string;
  mailboxLabel: string;
  reference: string;
}

export function TicketReplyBox({ ticketId, defaultTo, mailboxLabel, reference }: Props) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-slate-800 mb-3">Antworten</h2>
      <form method="post" action={`/api/tickets/${ticketId}/reply`} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">An</label>
            <input name="to" defaultValue={defaultTo} className="input text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Cc (optional)</label>
            <input name="cc" placeholder="kollege@firma.de" className="input text-sm w-full" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-slate-500 mb-1">Nachricht</label>
          <textarea
            name="body"
            rows={9}
            required
            placeholder="Guten Tag …"
            className="input text-sm w-full font-sans"
          />
          <p className="text-xs text-slate-500 mt-1.5">
            Absender: <strong className="text-slate-700">{mailboxLabel}</strong> · Betreff und Fußzeile
            tragen automatisch die Referenz <span className="font-mono">{reference}</span>. Deine
            persönliche Signatur wird angehängt —{" "}
            <Link href="/account/signatur" className="text-brand-700 hover:underline">
              hier bearbeiten
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary text-sm">Antwort senden</button>
          <button
            name="preview"
            value="1"
            formTarget="_blank"
            className="btn-secondary text-sm"
          >
            Vorschau
          </button>
        </div>
      </form>
    </section>
  );
}
