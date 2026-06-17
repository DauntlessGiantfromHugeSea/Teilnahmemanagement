import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { canViewEvent, canWriteEvent } from "@/lib/rbac";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { getActiveQuestions } from "@/lib/wissenstest";

export const dynamic = "force-dynamic";

export default async function EventWissenstestPage({
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
    include: {
      participants: {
        where: { status: { not: "CANCELLED" } },
        include: { wissenstestResult: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ev) notFound();

  const questions = await getActiveQuestions();

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-ink mb-1">Wissenstest – Offline</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Aktiviere den Offline-Modus, drucke pro Teilnehmer ein PDF und erfasse das
        Ergebnis später über den aufgedruckten Code.
        Aktive Fragen: <strong>{questions.length}</strong>.
        {questions.length === 0 && (
          <> · <Link href="/admin/wissenstest" className="text-brand-700 hover:underline">Fragen anlegen →</Link></>
        )}
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      {/* Offline-Modus-Toggle + Bulk-Druck */}
      <div className="card p-4 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-bold text-ink">
            Offline-Modus: {ev.offlineMode ? <span className="text-emerald-700">aktiv</span> : <span className="text-slate-500">aus</span>}
          </div>
          <div className="text-xs text-slate-500">
            Im Offline-Modus zeigen wir die Drucker- und Auswertungs-Werkzeuge an.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <form method="post" action={`/api/events/${ev.id}/wissenstest/toggle`}>
              <input type="hidden" name="on" value={ev.offlineMode ? "0" : "1"} />
              <button className="btn-secondary text-sm">
                {ev.offlineMode ? "Deaktivieren" : "Aktivieren"}
              </button>
            </form>
          )}
          <a
            href={`/api/events/${ev.id}/wissenstest/pdf`}
            target="_blank"
            className="btn-primary text-sm"
          >
            📄 Alle als PDF
          </a>
        </div>
      </div>

      {canWrite && ev.offlineMode && (
        <div className="card p-4 mb-5">
          <div className="font-bold text-ink mb-2">Auswertung erfassen</div>
          <form method="post" action={`/api/events/${ev.id}/wissenstest/grade`} className="grid sm:grid-cols-[150px_120px_120px_1fr_auto] gap-2 items-end">
            <div>
              <label className="label">Code</label>
              <input name="code" required placeholder="z. B. A7K2P9" className="input text-sm font-mono uppercase" />
            </div>
            <div>
              <label className="label">Richtig</label>
              <input name="correctCount" type="number" min={0} className="input text-sm" />
            </div>
            <div>
              <label className="label">Gesamt</label>
              <input name="totalCount" type="number" min={0} defaultValue={questions.length || ""} className="input text-sm" />
            </div>
            <div>
              <label className="label">Notiz (optional)</label>
              <input name="notes" className="input text-sm" />
            </div>
            <button className="btn-primary text-sm">Speichern</button>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Teilnehmer/in</th>
              <th>Firma</th>
              <th>Code</th>
              <th>Ergebnis</th>
              <th className="text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {ev.participants.map((p) => {
              const dec = decryptParticipant(p);
              const r = p.wissenstestResult;
              return (
                <tr key={p.id}>
                  <td className="font-medium text-ink">{dec.firstName} {dec.lastName}</td>
                  <td className="text-slate-600">{dec.company ?? "—"}</td>
                  <td className="font-mono text-brand-700">{r?.code ?? "—"}</td>
                  <td>
                    {r?.correctCount != null && r?.totalCount != null ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                        {r.correctCount} / {r.totalCount}
                      </span>
                    ) : r?.code ? (
                      <span className="text-xs text-amber-700">Code vergeben, noch nicht ausgewertet</span>
                    ) : (
                      <span className="text-xs text-slate-400">noch nicht gedruckt</span>
                    )}
                    {r?.notes && <div className="text-xs text-slate-500 mt-1">{r.notes}</div>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <a
                      href={`/api/events/${ev.id}/wissenstest/pdf?pid=${p.id}`}
                      target="_blank"
                      className="text-xs text-brand-700 hover:underline"
                    >
                      PDF
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
