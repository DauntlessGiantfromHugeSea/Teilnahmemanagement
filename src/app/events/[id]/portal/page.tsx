import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const ICON_CHOICES = [
  { key: "announcement", label: "📣 Ankündigung" },
  { key: "wifi", label: "📶 WLAN" },
  { key: "food", label: "🍽 Essen/Pause" },
  { key: "evening", label: "🌙 Abendveranstaltung" },
  { key: "location", label: "📍 Ort" },
  { key: "contact", label: "☎ Kontakt" },
  { key: "info", label: "ℹ Info" },
  { key: "warning", label: "⚠ Hinweis" },
];

export default async function EventPortalAdminPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canViewEvent(s, params.id))) redirect("/events");
  const canWrite = await canWriteEvent(s, params.id);

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { portalBlocks: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } },
  });
  if (!ev) notFound();

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <div className="flex items-baseline flex-wrap justify-between gap-3 mb-2">
        <h1 className="text-2xl font-semibold">Portal-Inhalte</h1>
        <a href={`/portal/${ev.id}`} target="_blank" className="text-sm text-brand-700 hover:underline">
          Live-Ansicht öffnen ↗
        </a>
      </div>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Freie Info-Blöcke, die im öffentlichen Schulungs-Portal angezeigt werden
        (WLAN-Passwort, Abendveranstaltung, Hinweise, Ankündigungen, …). Reihenfolge per ↑/↓.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <div className="space-y-3 mb-6">
        {ev.portalBlocks.map((b) => (
          <details key={b.id} className="card p-4">
            <summary className="cursor-pointer list-none flex items-baseline gap-3 flex-wrap">
              <span className="text-lg">{iconOf(b.icon)}</span>
              <span className="font-medium flex-1">{b.title}</span>
              {!b.visible && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">versteckt</span>}
              <span className="text-xs text-brand-700">bearbeiten</span>
            </summary>
            {canWrite && (
              <form method="post" action={`/api/events/${ev.id}/portal/update`} className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                <input type="hidden" name="id" value={b.id} />
                <div className="grid sm:grid-cols-[220px_1fr_120px] gap-3">
                  <div>
                    <label className="label">Icon / Typ</label>
                    <select name="icon" defaultValue={b.icon ?? ""} className="input text-sm">
                      <option value="">— keiner —</option>
                      {ICON_CHOICES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Titel</label>
                    <input name="title" defaultValue={b.title} required className="input text-sm" />
                  </div>
                  <div>
                    <label className="label">Sichtbar</label>
                    <select name="visible" defaultValue={b.visible ? "1" : "0"} className="input text-sm">
                      <option value="1">ja</option>
                      <option value="0">nein</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Text</label>
                  <textarea name="body" defaultValue={b.body} rows={5} className="input text-sm" placeholder="Markdown-/Plaintext. Absätze durch Leerzeile." />
                </div>
                <div className="flex items-center gap-3">
                  <button className="btn-primary text-sm">Speichern</button>
                  <form method="post" action={`/api/events/${ev.id}/portal/move`} className="inline">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="dir" value="up" />
                    <button className="text-xs text-slate-600 hover:text-brand-700">↑ hoch</button>
                  </form>
                  <form method="post" action={`/api/events/${ev.id}/portal/move`} className="inline">
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="dir" value="down" />
                    <button className="text-xs text-slate-600 hover:text-brand-700">↓ runter</button>
                  </form>
                  <form method="post" action={`/api/events/${ev.id}/portal/delete`} className="ml-auto">
                    <input type="hidden" name="id" value={b.id} />
                    <button className="text-xs text-rose-700 hover:underline">Block löschen</button>
                  </form>
                </div>
              </form>
            )}
          </details>
        ))}
        {ev.portalBlocks.length === 0 && (
          <div className="card p-4 text-sm text-slate-500 italic">Noch keine Inhalte. Lege weiter unten den ersten Block an.</div>
        )}
      </div>

      {canWrite && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm text-brand-700 hover:underline">+ Neuer Block (Ankündigung, WLAN, …)</summary>
          <form method="post" action={`/api/events/${ev.id}/portal/create`} className="mt-3 space-y-3">
            <div className="grid sm:grid-cols-[220px_1fr] gap-3">
              <div>
                <label className="label">Icon / Typ</label>
                <select name="icon" className="input text-sm" defaultValue="info">
                  {ICON_CHOICES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Titel</label>
                <input name="title" required className="input text-sm" placeholder="z.B. WLAN-Zugang" />
              </div>
            </div>
            <div>
              <label className="label">Text</label>
              <textarea name="body" rows={5} className="input text-sm" placeholder="SSID: FBA-Guest&#10;Passwort: …" />
            </div>
            <button className="btn-primary text-sm">Block anlegen</button>
          </form>
        </details>
      )}
    </Shell>
  );
}

function iconOf(key: string | null): string {
  const m: Record<string, string> = {
    announcement: "📣",
    wifi: "📶",
    food: "🍽",
    evening: "🌙",
    location: "📍",
    contact: "☎",
    info: "ℹ",
    warning: "⚠",
  };
  return m[key ?? ""] ?? "•";
}
