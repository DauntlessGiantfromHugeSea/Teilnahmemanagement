import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { canWriteGlobal } from "@/lib/rbac";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function WissenstestAdminPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canWriteGlobal(s)) redirect("/dashboard");

  const questions = await prisma.wissenstestQuestion.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return (
    <Shell session={s} active="wissenstest">
      <h1 className="text-2xl font-bold tracking-tight text-ink mb-2">Wissenstest – Fragen</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Pflege hier die Multiple-Choice-Fragen. Markiere pro Frage die richtige Antwort.
        Aktive Fragen werden im Offline-Modus auf den PDF-Test gedruckt.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <form method="post" action="/api/admin/wissenstest/seed" className="card p-4 mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm">
          <div className="font-bold text-ink">Beispiel-Test importieren</div>
          <div className="text-xs text-slate-500">
            12 Fragen aus „Wissenstest Flüssigboden – Mischplatz, Bodenmanagement & Flüssigbodenherstellung".
            Bereits vorhandene Fragen werden übersprungen.
          </div>
        </div>
        <button className="btn-secondary text-sm">📥 Importieren</button>
      </form>

      <div className="space-y-3 mb-6">
        {questions.length === 0 && (
          <div className="card p-6 text-sm text-slate-500 italic">
            Noch keine Fragen angelegt.
          </div>
        )}
        {questions.map((q) => {
          let opts: string[] = [];
          try { opts = JSON.parse(q.options); if (!Array.isArray(opts)) opts = []; } catch {}
          return (
            <form key={q.id} method="post" action={`/api/admin/wissenstest/${q.id}/update`} className="card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-2">
                  <input
                    name="position"
                    type="number"
                    defaultValue={q.position}
                    className="input w-20 text-sm"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" name="active" defaultChecked={q.active} className="h-4 w-4 accent-ink" />
                    aktiv
                  </label>
                </div>
                <div className="flex gap-2">
                  <button className="btn-secondary text-xs">Speichern</button>
                  <button formAction={`/api/admin/wissenstest/${q.id}/delete`} className="text-xs text-rose-700 hover:underline">Löschen</button>
                </div>
              </div>
              <div>
                <label className="label">Fragetext</label>
                <textarea name="text" rows={2} defaultValue={q.text} className="input text-sm" required />
              </div>
              <div>
                <label className="label">Antwortoptionen (eine pro Zeile)</label>
                <textarea
                  name="options"
                  rows={Math.max(opts.length, 3)}
                  defaultValue={opts.join("\n")}
                  className="input text-sm"
                  required
                />
              </div>
              <div>
                <label className="label">Index der richtigen Antwort (0-basiert, leer = keine)</label>
                <input
                  name="correctIdx"
                  type="number"
                  defaultValue={q.correctIdx ?? ""}
                  className="input w-32 text-sm"
                  min={0}
                />
              </div>
            </form>
          );
        })}
      </div>

      <form method="post" action="/api/admin/wissenstest/create" className="card p-4 space-y-3">
        <div className="font-bold text-ink">Neue Frage</div>
        <div>
          <label className="label">Fragetext *</label>
          <textarea name="text" rows={2} required className="input text-sm" placeholder="z. B. Was ist die Hauptkomponente von Flüssigboden?" />
        </div>
        <div>
          <label className="label">Antwortoptionen (eine pro Zeile) *</label>
          <textarea name="options" rows={4} required className="input text-sm" placeholder={"Option A\nOption B\nOption C\nOption D"} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Index der richtigen Antwort (0 = erste Zeile)</label>
            <input name="correctIdx" type="number" min={0} className="input text-sm" />
          </div>
          <div>
            <label className="label">Position (Sortierung)</label>
            <input name="position" type="number" defaultValue={questions.length + 1} className="input text-sm" />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary text-sm">Frage anlegen</button>
        </div>
      </form>
    </Shell>
  );
}
