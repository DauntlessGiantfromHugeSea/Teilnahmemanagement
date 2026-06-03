import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin } from "@/lib/rbac";
import { getDefaultQuestions } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export default async function FeedbackFragenPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAdmin(s)) redirect("/dashboard");
  const qs = await getDefaultQuestions();

  return (
    <Shell session={s} active="feedback-fragen">
      <h1 className="text-2xl font-semibold mb-1">Feedback-Fragebogen</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Standard-Fragen, die für alle Veranstaltungen gelten. Pro Veranstaltung kann der Bogen
        zusätzlich überschrieben werden. Änderungen wirken auf neu versendete Feedback-Links;
        bereits abgegebene Antworten bleiben unverändert.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <form method="post" action="/api/admin/feedback-fragen" className="space-y-3">
        <input type="hidden" name="count" value={qs.length} />
        {qs.map((q, i) => (
          <div key={q.id} className="card p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-mono">#{i + 1} · ID: {q.id}</span>
            </div>
            <input type="hidden" name={`id_${i}`} value={q.id} />
            <div className="grid sm:grid-cols-[1fr_180px] gap-3">
              <div>
                <label className="label">Frage</label>
                <input name={`text_${i}`} defaultValue={q.text} className="input" required />
              </div>
              <div>
                <label className="label">Typ</label>
                <select name={`type_${i}`} defaultValue={q.type} className="input">
                  <option value="select">Auswahl (Dropdown)</option>
                  <option value="radio">Radio (eine Option)</option>
                  <option value="checkboxes">Checkboxen (mehrere)</option>
                  <option value="text">Einzeiliger Text</option>
                  <option value="textarea">Mehrzeiliger Text</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Hinweistext (optional)</label>
              <input name={`description_${i}`} defaultValue={q.description ?? ""} className="input" />
            </div>
            <div>
              <label className="label">Optionen (eine Option pro Zeile, nur für Auswahl/Radio/Checkboxen)</label>
              <textarea
                name={`options_${i}`}
                defaultValue={(q.options ?? []).join("\n")}
                rows={Math.max(3, (q.options ?? []).length)}
                className="input"
              />
            </div>
          </div>
        ))}
        <button className="btn-primary">Speichern</button>
      </form>
      <form method="post" action="/api/admin/feedback-fragen/reset" className="mt-3">
        <button className="btn-secondary text-sm">Auf Standard zurücksetzen</button>
      </form>
    </Shell>
  );
}
