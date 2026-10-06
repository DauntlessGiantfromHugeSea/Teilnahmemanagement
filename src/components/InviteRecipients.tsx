"use client";

import { useMemo, useState } from "react";
import { parseRecipients } from "@/lib/recipientList";

// Textfeld fuer die Empfaengerliste mit sofortiger Rueckmeldung: wie viele
// Adressen erkannt wurden, welche Zeilen unklar sind und wie die Namen fuer
// die Anrede aufgeteilt werden. So faellt ein Tippfehler auf, bevor die Mail
// bei einem Kunden landet.
export function InviteRecipients({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const [text, setText] = useState(defaultValue ?? "");
  const parsed = useMemo(() => parseRecipients(text), [text]);
  const { recipients, invalid, duplicates } = parsed;

  return (
    <div>
      <label className="label">Empfänger</label>
      <textarea
        name={name}
        required
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"max.mustermann@firma.de\nAnna Schmidt <anna@firma.de>\nPeter; Meier; peter@firma.de"}
        className="input font-mono text-sm"
      />
      <p className="text-xs text-slate-500 mt-1">
        Eine Adresse pro Zeile. Ein Name davor ist optional und wird für die Anrede
        benutzt — Formate wie <code>Name &lt;mail@firma.de&gt;</code>,{" "}
        <code>Vorname; Nachname; mail@firma.de</code> oder eine aus Excel kopierte
        Spalte werden erkannt.
      </p>

      {text.trim() !== "" && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
              {recipients.length} {recipients.length === 1 ? "Adresse" : "Adressen"}
            </span>
            {duplicates.length > 0 && (
              <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                {duplicates.length} doppelt — wird nur einmal angeschrieben
              </span>
            )}
            {invalid.length > 0 && (
              <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold">
                {invalid.length} {invalid.length === 1 ? "Zeile" : "Zeilen"} ohne Adresse
              </span>
            )}
          </div>

          {invalid.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs">
              <div className="font-semibold text-amber-800 mb-1">
                Diese Zeilen werden übersprungen:
              </div>
              <ul className="space-y-0.5 text-amber-900">
                {invalid.slice(0, 5).map((v) => (
                  <li key={v.line} className="font-mono">
                    Zeile {v.line}: {v.text}
                  </li>
                ))}
                {invalid.length > 5 && <li>… und {invalid.length - 5} weitere</li>}
              </ul>
            </div>
          )}

          {recipients.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-brand-700 hover:underline">
                Erkannte Empfänger anzeigen
              </summary>
              <ul className="mt-2 space-y-0.5 max-h-48 overflow-auto rounded-lg border border-slate-200 p-2">
                {recipients.map((r) => (
                  <li key={r.email} className="flex flex-wrap gap-x-2">
                    <span className="font-mono text-slate-600">{r.email}</span>
                    <span className="text-slate-500">
                      {r.firstName || r.lastName
                        ? `→ Anrede: ${r.firstName || r.lastName}`
                        : "→ keine Anrede erkannt"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
