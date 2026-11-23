"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface BroadcastEventOption {
  id: string;
  title: string;
  dateLabel: string;
  format: string;
  recipientCount: number;
}

interface Props {
  events: BroadcastEventOption[];
  maxBcc: number;
  maxIndividual: number;
  senderAddress: string;
  myAddress: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Zaehlt die eingetippten Adressen schon beim Tippen. Dieselbe Logik laeuft
 * auf dem Server noch einmal (src/lib/broadcast.ts, parseAddressList) - hier
 * geht es nur um die Anzeige, massgeblich ist der Server.
 */
function countAddresses(raw: string): { valid: Set<string>; invalid: number } {
  const valid = new Set<string>();
  let invalid = 0;
  for (const piece of raw.split(/[,;\n\r\t]+|\s{2,}/)) {
    const part = piece.trim();
    if (!part) continue;
    const angled = /<([^>]+)>/.exec(part);
    const candidate = (angled ? angled[1] : part).trim().replace(/^mailto:/i, "");
    if (!candidate) continue;
    const token = candidate.includes(" ") ? candidate.split(/\s+/).pop()! : candidate;
    const lower = token.toLowerCase();
    if (EMAIL_RE.test(lower)) valid.add(lower);
    else invalid++;
  }
  return { valid, invalid };
}

export function BroadcastComposer({
  events,
  maxBcc,
  maxIndividual,
  senderAddress,
  myAddress,
}: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [footerNote, setFooterNote] = useState("");
  const [addresses, setAddresses] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sendMode, setSendMode] = useState<"bcc" | "individual">("bcc");
  const [preview, setPreview] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const firstPreview = useRef(true);

  const typed = useMemo(() => countAddresses(addresses), [addresses]);
  const fromEvents = useMemo(
    () => picked.reduce((n, id) => n + (events.find((e) => e.id === id)?.recipientCount ?? 0), 0),
    [picked, events]
  );
  // Obergrenze: Teilnehmer, die in mehreren Veranstaltungen stehen, zaehlt
  // der Server nur einmal. Deshalb "bis zu".
  const total = typed.valid.size + fromEvents;
  const cap = sendMode === "individual" ? maxIndividual : maxBcc;
  const overCap = total > cap;

  // Vorschau nachziehen, sobald sich etwas am Inhalt aendert - mit kurzer
  // Verzoegerung, damit nicht bei jedem Tastendruck eine Anfrage losgeht.
  useEffect(() => {
    if (!subject && !body) {
      setPreview("");
      return;
    }
    const delay = firstPreview.current ? 0 : 500;
    firstPreview.current = false;
    const t = setTimeout(async () => {
      setPreviewBusy(true);
      try {
        const res = await fetch("/api/mailing/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, body, ctaLabel, ctaUrl, footerNote }),
        });
        if (res.ok) {
          const json = (await res.json()) as { html?: string };
          setPreview(json.html ?? "");
        }
      } catch {
        /* Vorschau ist Beiwerk - ein Fehler darf den Editor nicht stoeren */
      } finally {
        setPreviewBusy(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [subject, body, ctaLabel, ctaUrl, footerNote]);

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <form
      method="post"
      action="/api/mailing/send"
      className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] gap-6 items-start"
      onSubmit={(e) => {
        const action = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (action?.value === "send") {
          if (overCap) {
            e.preventDefault();
            return;
          }
          const ok = window.confirm(
            `Die Mail geht an bis zu ${total} Empfänger. Wirklich jetzt verschicken?`
          );
          if (!ok) {
            e.preventDefault();
            return;
          }
        }
        setSending(true);
      }}
    >
      {/* ------------------------------------------------ linke Spalte */}
      <div className="space-y-5 min-w-0">
        <section className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Empfänger</h2>

          <div>
            <label className="label">Adressen</label>
            <textarea
              name="addresses"
              rows={4}
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              placeholder={"maria@firma.de, thomas@firma.de\nAnna Weber <anna@firma.de>"}
              className="input font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Getrennt durch Komma, Semikolon oder Zeilenumbruch. Aus Outlook oder Excel
              kopierte Listen gehen direkt hinein; Anzeigenamen werden entfernt.
              {typed.invalid > 0 && (
                <span className="text-amber-700">
                  {" "}
                  {typed.invalid} Eintrag/Einträge sind keine gültige Adresse und werden übersprungen.
                </span>
              )}
            </p>
          </div>

          {events.length > 0 && (
            <div>
              <label className="label">Oder Teilnehmer einer Veranstaltung</label>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {events.map((ev) => (
                  <label
                    key={ev.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      name="eventIds"
                      value={ev.id}
                      checked={picked.includes(ev.id)}
                      onChange={() => togglePick(ev.id)}
                      className="h-4 w-4 accent-brand-600 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{ev.title}</span>
                      <span className="block text-xs text-slate-500">
                        {ev.format} · {ev.dateLabel || "ohne Termin"}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {ev.recipientCount} Mail{ev.recipientCount === 1 ? "" : "s"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              overCap ? "bg-red-50 text-red-800 border border-red-200" : "bg-slate-50 text-slate-700"
            }`}
          >
            <strong>{total}</strong> Empfänger
            {fromEvents > 0 && typed.valid.size > 0 && (
              <span className="text-slate-500">
                {" "}
                ({typed.valid.size} eingetippt, {fromEvents} aus Veranstaltungen – Dubletten
                entfernt der Versand)
              </span>
            )}
            {overCap && (
              <div className="mt-1">
                Mehr als {cap} für diesen Versandweg.
                {sendMode === "individual" && " Für größere Verteiler den BCC-Versand nehmen."}
              </div>
            )}
          </div>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Inhalt</h2>
          <div>
            <label className="label">Betreff</label>
            <input
              name="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Terminänderung: Webinar am 11.02."
              className="input"
            />
          </div>
          <div>
            <label className="label">Nachricht</label>
            <textarea
              name="body"
              required
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                "Hallo zusammen,\n\nder Zugangslink für das Webinar am 11.02.2027 steht bereit:\n\n" +
                "https://teams.microsoft.com/...\n\n**Bitte beachten:** Die Einwahl ist ab 9:30 Uhr möglich.\n\n" +
                "Viele Grüße\nIhr Team der Flüssigboden Akademie"
              }
              className="input font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              <code>**fett**</code> · <code># Überschrift</code> · <code>- Aufzählung</code> ·{" "}
              <code>[Text](https://…)</code>. Links und Mailadressen werden automatisch verlinkt,
              eine Leerzeile macht einen neuen Absatz.
            </p>
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600 hover:text-slate-900">
              Schaltfläche und Fußnote
            </summary>
            <div className="mt-3 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Beschriftung</label>
                  <input
                    name="ctaLabel"
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    placeholder="Jetzt teilnehmen"
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Adresse</label>
                  <input
                    name="ctaUrl"
                    type="url"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder="https://..."
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="label">Hinweis über der Fußzeile</label>
                <input
                  name="footerNote"
                  value={footerNote}
                  onChange={(e) => setFooterNote(e.target.value)}
                  placeholder="Sie erhalten diese Nachricht als angemeldete Teilnehmerin bzw. angemeldeter Teilnehmer."
                  className="input"
                />
              </div>
            </div>
          </details>
        </section>

        <section className="card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Versand</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label
              className={`rounded-lg border p-3 cursor-pointer text-sm ${
                sendMode === "bcc" ? "border-brand-600 bg-brand-50" : "border-slate-200"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="sendMode"
                  value="bcc"
                  checked={sendMode === "bcc"}
                  onChange={() => setSendMode("bcc")}
                  className="accent-brand-600"
                />
                Blindkopie (BCC)
              </span>
              <span className="block text-xs text-slate-500 mt-1">
                Ein Text für alle, Empfänger sehen einander nicht. Schnell, bis zu {maxBcc}{" "}
                Adressen. Ohne persönliche Anrede.
              </span>
            </label>
            <label
              className={`rounded-lg border p-3 cursor-pointer text-sm ${
                sendMode === "individual" ? "border-brand-600 bg-brand-50" : "border-slate-200"
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="sendMode"
                  value="individual"
                  checked={sendMode === "individual"}
                  onChange={() => setSendMode("individual")}
                  className="accent-brand-600"
                />
                Einzeln mit Anrede
              </span>
              <span className="block text-xs text-slate-500 mt-1">
                Eine Mail je Person, <code>{"{firstName}"}</code> und <code>{"{lastName}"}</code>{" "}
                werden ersetzt. Dauert länger, bis zu {maxIndividual} Adressen.
              </span>
            </label>
          </div>

          {sendMode === "individual" && (
            <p className="text-xs text-slate-500">
              Platzhalter: <code>{"{firstName}"}</code>, <code>{"{lastName}"}</code>,{" "}
              <code>{"{company}"}</code>, <code>{"{eventTitle}"}</code>,{" "}
              <code>{"{eventDate}"}</code>. Bei eingetippten Adressen ohne Teilnehmerdatensatz
              bleiben sie leer.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="copyToMe" defaultChecked className="h-4 w-4 accent-brand-600" />
            Stille Kopie an mich ({myAddress})
          </label>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              name="action"
              value="test"
              disabled={sending}
              className="btn-secondary text-sm disabled:opacity-50"
            >
              Testmail an mich
            </button>
            <button
              name="action"
              value="send"
              disabled={sending || overCap || total === 0}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {sending ? "Wird verschickt …" : `An ${total} Empfänger senden`}
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Absender: {senderAddress || "nicht eingerichtet"}. Der Versand kann bei großen
            Verteilern eine Weile dauern — Seite bitte offen lassen.
          </p>
        </section>
      </div>

      {/* ------------------------------------------------ rechte Spalte */}
      <section className="card p-5 lg:sticky lg:top-24">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-800">Vorschau</h2>
          {previewBusy && <span className="text-xs text-slate-400">aktualisiert …</span>}
        </div>
        <p className="text-xs text-slate-500 mb-3">
          So kommt die Mail an. Logo, Farbe und Fußzeile stammen aus dem Mail-Design.
        </p>
        {preview ? (
          <iframe
            title="Vorschau der Rundmail"
            sandbox=""
            srcDoc={preview}
            className="w-full h-[640px] rounded border border-slate-200 bg-white"
          />
        ) : (
          <div className="h-[640px] rounded border border-dashed border-slate-300 grid place-items-center text-sm text-slate-400 text-center px-6">
            Betreff und Nachricht eingeben — die Vorschau erscheint automatisch.
          </div>
        )}
      </section>
    </form>
  );
}
