import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAdmin, isAccounting } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { EXPORT_FIELDS, DEFAULT_FIELDS } from "@/lib/exportFields";
import { ExportToolbarScript } from "@/components/ExportToolbarScript";

export const dynamic = "force-dynamic";

export default async function ParticipantsExportPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(isAdmin(s) || isAccounting(s) || s.role === "EDITOR")) redirect("/dashboard");

  const events = await prisma.event.findMany({
    orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { participants: true } } },
  });

  const groups: Record<string, typeof EXPORT_FIELDS> = {};
  for (const f of EXPORT_FIELDS) {
    (groups[f.group] ??= []).push(f);
  }
  const defaultSet = new Set<string>(DEFAULT_FIELDS);

  return (
    <Shell session={s} active="exports">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Teilnehmer exportieren</h1>
        <p className="text-sm text-slate-500">
          Veranstaltungen und Felder wählen, dann als .xlsx herunterladen.
        </p>
      </div>

      {searchParams.ok && (
        <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>
      )}
      {searchParams.error && (
        <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>
      )}

      <form method="post" action="/api/exports/participants" className="space-y-6" data-export-form>
        {/* Veranstaltungen */}
        <section className="card p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">Veranstaltungen</h2>
            <div className="flex items-center gap-3 text-xs">
              <button type="button" className="text-brand-700 hover:underline" data-action="evt-all">
                alle wählen
              </button>
              <button type="button" className="text-slate-500 hover:underline" data-action="evt-none">
                keine
              </button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-80 overflow-auto pr-1">
            {events.map((e) => {
              const dates = [e.day1Date, e.day2Date]
                .filter(Boolean)
                .map((d) => d!.toLocaleDateString("de-DE"))
                .join(" / ");
              return (
                <label
                  key={e.id}
                  className="flex items-start gap-3 p-3 rounded-lg border-2 border-slate-200 hover:border-brand-300 hover:bg-brand-50/30 cursor-pointer transition"
                >
                  <input
                    type="checkbox"
                    name="eventIds"
                    value={e.id}
                    defaultChecked
                    className="mt-1 h-5 w-5 accent-brand-600 export-evt"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{e.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {dates || "ohne Datum"} &middot; {e._count.participants} TN
                    </div>
                  </div>
                </label>
              );
            })}
            {events.length === 0 && (
              <div className="text-sm text-slate-500">Keine Veranstaltungen vorhanden.</div>
            )}
          </div>
        </section>

        {/* Felder */}
        <section className="card p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-semibold">Felder</h2>
            <div className="flex items-center gap-3 text-xs">
              <button type="button" className="text-brand-700 hover:underline" data-action="fld-all">
                alle wählen
              </button>
              <button type="button" className="text-slate-500 hover:underline" data-action="fld-default">
                Standard
              </button>
              <button type="button" className="text-slate-500 hover:underline" data-action="fld-none">
                keine
              </button>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(groups).map(([group, fields]) => (
              <div key={group}>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  {group}
                </div>
                <div className="space-y-1">
                  {fields.map((f) => (
                    <label
                      key={f.key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        name="fields"
                        value={f.key}
                        defaultChecked={defaultSet.has(f.key)}
                        data-default={defaultSet.has(f.key) ? "1" : "0"}
                        className="h-4 w-4 accent-brand-600 export-fld"
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Optionen */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Optionen</h2>
          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <input type="checkbox" name="split" defaultChecked className="mt-1 h-5 w-5 accent-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">Je Veranstaltung ein Tabellenblatt</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Wenn aktiv, bekommt jede gewählte Veranstaltung ihr eigenes Sheet.
                  Sonst landen alle Teilnehmer in einem gemeinsamen Sheet.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-slate-200 hover:bg-slate-50 cursor-pointer transition">
              <input type="checkbox" name="includeCancelled" className="mt-1 h-5 w-5 accent-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">Stornierte Anmeldungen einschließen</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Standardmäßig werden stornierte Teilnehmer ausgeblendet.
                </div>
              </div>
            </label>
          </div>
        </section>

        {/* Aktion: Download oder Mail */}
        <section className="card p-5">
          <h2 className="font-semibold mb-3">Aktion</h2>
          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-slate-200 hover:bg-slate-50 cursor-pointer transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/60">
              <input type="radio" name="mode" value="download" defaultChecked className="mt-1 h-4 w-4 accent-brand-600 mode-radio" data-mode="download" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">Herunterladen</div>
                <div className="text-xs text-slate-600 mt-0.5">Excel-Datei im Browser speichern.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-lg border-2 border-slate-200 hover:bg-slate-50 cursor-pointer transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/60">
              <input type="radio" name="mode" value="email" className="mt-1 h-4 w-4 accent-brand-600 mode-radio" data-mode="email" />
              <div className="min-w-0 flex-1 w-full">
                <div className="font-semibold text-sm">Per E-Mail versenden</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Excel direkt aus dem Tool als Anhang verschicken. Antworten gehen an deine Adresse ({s.email}).
                </div>
                <div className="mt-3 space-y-3 email-fields hidden">
                  <div>
                    <label className="label">Empfänger</label>
                    <input
                      type="text"
                      name="to"
                      placeholder="empfaenger@example.com, weitere@example.com"
                      className="input text-sm font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1">Mehrere Adressen mit Komma oder Semikolon trennen.</p>
                  </div>
                  <div>
                    <label className="label">Betreff (optional)</label>
                    <input
                      type="text"
                      name="subject"
                      placeholder="Teilnehmerliste"
                      className="input text-sm"
                    />
                  </div>
                  <div>
                    <label className="label">Nachricht (optional)</label>
                    <textarea
                      name="message"
                      rows={4}
                      placeholder="Anbei die Teilnehmerliste …"
                      className="input text-sm"
                    />
                  </div>
                </div>
              </div>
            </label>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button className="btn-primary" type="submit">
            Ausführen
          </button>
        </div>

        <ExportToolbarScript />
      </form>
    </Shell>
  );
}
