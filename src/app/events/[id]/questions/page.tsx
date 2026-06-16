import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "offen",
  ANSWERED: "beantwortet",
  HIDDEN: "ausgeblendet",
};

export default async function EventQuestionsPage({
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
      questions: { orderBy: { createdAt: "desc" } },
      _count: { select: { participants: true } },
    },
  });
  if (!ev) notFound();

  const open = ev.questions.filter((q) => q.status === "OPEN");
  const answered = ev.questions.filter((q) => q.status === "ANSWERED");
  const hidden = ev.questions.filter((q) => q.status === "HIDDEN");

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Fragen aus dem Schulungs-Portal</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Teilnehmer können auf dem öffentlichen Portal Fragen einreichen — sie sehen dort keine
        anderen Fragen, nur ihre eigene Eingabe. Du kannst die Fragen hier bearbeiten und eine
        Antwort per Mail an alle aktiven Teilnehmer schicken.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      {canWrite && (
        <form
          method="post"
          action={`/api/events/${ev.id}/questions/invite`}
          className="card p-4 mb-5 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="text-sm">
            <div className="font-semibold text-slate-900">Fragen-Link an Teilnehmer senden</div>
            <div className="text-xs text-slate-500">
              Verschickt eine Mail mit Link zum Eingabefeld im Schulungs-Portal an alle aktiven Teilnehmer.
            </div>
          </div>
          <button className="btn-primary text-sm">📧 Fragen-Link versenden</button>
        </form>
      )}

      <div className="card p-4 mb-5 grid grid-cols-3 gap-3 text-center text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Offen</div>
          <div className="text-2xl font-semibold">{open.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Beantwortet</div>
          <div className="text-2xl font-semibold text-emerald-700">{answered.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Ausgeblendet</div>
          <div className="text-2xl font-semibold text-slate-500">{hidden.length}</div>
        </div>
      </div>

      <List title="Offene Fragen" items={open} canWrite={canWrite} eventId={ev.id} />
      {answered.length > 0 && <List title="Beantwortet" items={answered} canWrite={canWrite} eventId={ev.id} />}
      {hidden.length > 0 && <List title="Ausgeblendet" items={hidden} canWrite={canWrite} eventId={ev.id} />}
    </Shell>
  );
}

function List({
  title, items, canWrite, eventId,
}: {
  title: string;
  items: { id: string; text: string; name: string | null; status: string; adminNote: string | null; createdAt: Date; answeredAt: Date | null }[];
  canWrite: boolean;
  eventId: string;
}) {
  if (items.length === 0) return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="card p-4 text-sm text-slate-500 italic">Keine Einträge.</div>
    </section>
  );
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="space-y-2">
        {items.map((q) => (
          <details key={q.id} className="card p-4">
            <summary className="cursor-pointer list-none flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-900 whitespace-pre-wrap">{q.text}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {q.name ? `von ${q.name} · ` : ""}
                  {new Date(q.createdAt).toLocaleString("de-DE")}
                  <span className={"ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold " +
                    (q.status === "OPEN" ? "bg-amber-100 text-amber-800"
                      : q.status === "ANSWERED" ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500")}>
                    {STATUS_LABEL[q.status]}
                  </span>
                </div>
                {q.adminNote && (
                  <div className="mt-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">
                    <span className="font-semibold">Interner Vermerk: </span>{q.adminNote}
                  </div>
                )}
              </div>
              <span className="text-xs text-brand-700 shrink-0">verwalten</span>
            </summary>
            {canWrite && (
              <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                {/* Antwort per Mail an alle Teilnehmer */}
                <form method="post" action={`/api/events/${eventId}/questions/${q.id}/answer`} className="space-y-2">
                  <label className="label">Antwort an alle aktiven Teilnehmer mailen</label>
                  <textarea
                    name="answer"
                    rows={4}
                    placeholder="Antwort-Text …"
                    className="input text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input type="checkbox" name="includeQuestion" defaultChecked className="h-4 w-4 accent-brand-600" />
                      Frage in die Mail einbauen (anonymisiert)
                    </label>
                    <button className="btn-primary text-sm">📧 Antwort versenden</button>
                  </div>
                </form>

                {/* Interner Vermerk + Status */}
                <form method="post" action={`/api/events/${eventId}/questions/${q.id}/update`} className="grid sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
                  <div>
                    <label className="label">Interner Vermerk</label>
                    <input name="adminNote" defaultValue={q.adminNote ?? ""} className="input text-sm" />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select name="status" defaultValue={q.status} className="input text-sm">
                      <option value="OPEN">offen</option>
                      <option value="ANSWERED">beantwortet</option>
                      <option value="HIDDEN">ausgeblendet</option>
                    </select>
                  </div>
                  <button className="btn-secondary text-sm">Speichern</button>
                </form>

                <form method="post" action={`/api/events/${eventId}/questions/${q.id}/delete`} className="text-right">
                  <button className="text-xs text-rose-700 hover:underline">Frage löschen</button>
                </form>
              </div>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}
