"use client";

import { useMemo, useState } from "react";

interface Template {
  id: string;
  label: string;
  subject: string;
  body: string;
}

interface Props {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  counts: Record<string, number>;
  templates: Template[];
  logoUrl: string;
  brandColor: string;
}

type Status = "REGISTERED" | "CONFIRMED" | "ATTENDED" | "NO_SHOW";

const STATUS_LABEL: Record<Status, string> = {
  REGISTERED: "Angemeldet",
  CONFIRMED: "Bestätigt",
  ATTENDED: "Teilgenommen",
  NO_SHOW: "Nicht erschienen",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderVars(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{firstName\}/g, vars.firstName)
    .replace(/\{lastName\}/g, vars.lastName)
    .replace(/\{eventTitle\}/g, vars.eventTitle)
    .replace(/\{eventDate\}/g, vars.eventDate);
}

function plainToHtml(plain: string): string {
  if (!plain.trim()) return "";
  return plain
    .split(/\n\s*\n/)
    .map(
      (par) =>
        `<p style="margin:0 0 14px 0;color:#374151;line-height:1.55;">${escapeHtml(
          par
        ).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

export function EventMailComposer({
  eventId,
  eventTitle,
  eventDate,
  counts,
  templates,
  logoUrl,
  brandColor,
}: Props) {
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? "blank");
  const [subject, setSubject] = useState(templates[0]?.subject ?? "");
  const [body, setBody] = useState(templates[0]?.body ?? "");
  const [statusFilter, setStatusFilter] = useState<Record<Status, boolean>>({
    REGISTERED: true,
    CONFIRMED: true,
    ATTENDED: true,
    NO_SHOW: false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const selectedCount = useMemo(() => {
    return (Object.keys(statusFilter) as Status[])
      .filter((k) => statusFilter[k])
      .reduce((acc, k) => acc + (counts[k] ?? 0), 0);
  }, [statusFilter, counts]);

  const sampleVars = {
    firstName: "Max",
    lastName: "Mustermann",
    eventTitle,
    eventDate,
  };
  const previewSubject = renderVars(subject || "(kein Betreff)", sampleVars);
  const previewBodyHtml = plainToHtml(renderVars(body, sampleVars));

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
  }

  async function submit(action: "test" | "send") {
    setMsg(null);
    if (!subject.trim()) {
      setMsg({ kind: "err", text: "Betreff fehlt." });
      return;
    }
    if (!body.trim()) {
      setMsg({ kind: "err", text: "Inhalt fehlt." });
      return;
    }
    if (action === "send") {
      const ok = window.confirm(
        `Wirklich an ${selectedCount} Empfänger versenden? Diese Aktion lässt sich nicht rückgängig machen.`
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          subject,
          body,
          statusFilter: (Object.keys(statusFilter) as Status[]).filter(
            (k) => statusFilter[k]
          ),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setMsg({
          kind: "err",
          text: json.error ?? json.message ?? "Versand fehlgeschlagen",
        });
      } else if (action === "test") {
        setMsg({ kind: "ok", text: json.message ?? "Test-Mail verschickt." });
      } else {
        const failed = json.failed ?? 0;
        setMsg({
          kind: failed > 0 ? "err" : "ok",
          text: `Versendet: ${json.sent} - Übersprungen: ${json.skipped} - Fehlgeschlagen: ${failed}`,
        });
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Netzwerkfehler" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Editor */}
      <section className="card p-6 space-y-4">
        <div>
          <label className="label">Vorlage</label>
          <select
            className="input"
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Vorlage auswählen lädt Betreff und Inhalt — du kannst danach frei
            anpassen.
          </p>
        </div>

        <div>
          <label className="label">Betreff</label>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="z.B. Vielen Dank für Ihre Teilnahme"
          />
        </div>

        <div>
          <label className="label">Inhalt</label>
          <textarea
            className="input font-mono text-sm"
            rows={14}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Hallo {firstName}, ..."
          />
          <p className="text-xs text-slate-500 mt-1">
            Platzhalter:{" "}
            <code className="font-mono">{"{firstName}"}</code>,{" "}
            <code className="font-mono">{"{lastName}"}</code>,{" "}
            <code className="font-mono">{"{eventTitle}"}</code>,{" "}
            <code className="font-mono">{"{eventDate}"}</code>
          </p>
        </div>

        <div>
          <div className="label">Empfänger (Status-Filter)</div>
          <div className="space-y-1">
            {(Object.keys(statusFilter) as Status[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={statusFilter[k]}
                  onChange={(e) =>
                    setStatusFilter((prev) => ({
                      ...prev,
                      [k]: e.target.checked,
                    }))
                  }
                />
                <span>
                  {STATUS_LABEL[k]}{" "}
                  <span className="text-slate-400">({counts[k] ?? 0})</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Stornierte Teilnehmer werden nie kontaktiert.
          </p>
        </div>

        {msg && (
          <div
            className={
              "rounded-lg px-3 py-2 text-sm " +
              (msg.kind === "ok"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700")
            }
          >
            {msg.text}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => submit("test")}
            disabled={busy}
          >
            Test-Mail an mich
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => submit("send")}
            disabled={busy || selectedCount === 0}
            title={
              selectedCount === 0 ? "Keine Empfänger ausgewählt" : undefined
            }
          >
            {busy
              ? "Bitte warten..."
              : `Jetzt versenden an ${selectedCount} Empfänger`}
          </button>
        </div>
      </section>

      {/* Live-Vorschau */}
      <section className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Vorschau (Platzhalter mit Beispieldaten ersetzt)
        </div>
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
            <strong className="text-slate-700">Betreff:</strong> {previewSubject}
          </div>
          <div
            style={{
              background: "#f6f8fb",
              padding: "16px",
            }}
          >
            <div
              style={{
                maxWidth: 600,
                margin: "0 auto",
                fontFamily: "Arial, Helvetica, sans-serif",
                color: "#0f172a",
              }}
            >
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Flüssigboden Akademie"
                  style={{ height: 56, width: "auto" }}
                />
              </div>
              <div
                style={{
                  height: 4,
                  background: brandColor,
                  borderRadius: 2,
                  margin: "0 0 16px 0",
                }}
              />
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: 28,
                }}
                dangerouslySetInnerHTML={{
                  __html:
                    previewBodyHtml ||
                    `<p style="margin:0;color:#94a3b8;font-style:italic;">(Inhalt erscheint hier — fang oben mit dem Tippen an)</p>`,
                }}
              />
              <div
                style={{
                  textAlign: "center",
                  color: "#94a3b8",
                  fontSize: 12,
                  padding: "18px 8px",
                }}
              >
                FLÜSSIGBODEN AKADEMIE &middot; {new Date().getFullYear()}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
