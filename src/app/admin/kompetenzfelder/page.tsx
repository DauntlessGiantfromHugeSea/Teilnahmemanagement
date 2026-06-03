import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { getKompetenzfelder } from "@/lib/kompetenzfelder";

export const dynamic = "force-dynamic";

export default async function KompetenzfelderPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");

  const items = await getKompetenzfelder();

  return (
    <Shell session={s} active="kompetenzfelder">
      <h1 className="text-2xl font-semibold mb-1">Kompetenzfelder</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Zentrale Bearbeitung der Kompetenzfeld-Bezeichnungen und Bestätigungstexte. Diese werden auf
        Zertifikaten ausgegeben. Änderungen wirken auf neu erzeugte Zertifikate; bereits angelegte
        Zertifikate behalten den damaligen Text.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <form method="post" action="/api/admin/kompetenzfelder" className="space-y-4">
        <input type="hidden" name="count" value={items.length} />
        {items.map((k, i) => (
          <div key={k.id} className="card p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <span className="text-xs font-mono text-slate-500">ID: {k.id}</span>
            </div>
            <input type="hidden" name={`id_${i}`} value={k.id} />
            <div className="grid gap-3">
              <div>
                <label className="label">Bezeichnung</label>
                <input
                  type="text"
                  name={`label_${i}`}
                  defaultValue={k.label}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Bestätigungstext (wird hinter dem Namen ausgegeben)</label>
                <textarea
                  name={`text_${i}`}
                  defaultValue={k.text}
                  rows={3}
                  className="input"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  Beginnt sinnvollerweise mit „wird bestätigt, …" — auf dem Zertifikat wird vor diesem
                  Text der Name des Teilnehmenden eingefügt.
                </p>
              </div>
            </div>
          </div>
        ))}
        <button className="btn-primary">Speichern</button>
      </form>
      <form method="post" action="/api/admin/kompetenzfelder/reset" className="mt-3">
        <button className="btn-secondary text-sm" type="submit">Auf Standard zurücksetzen</button>
      </form>
    </Shell>
  );
}
