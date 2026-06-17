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

type Q = {
  id: string; text: string; name: string | null; status: string;
  adminNote: string | null; answer: string | null;
  createdAt: Date; answeredAt: Date | null;
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

  const open: Q[] = ev.questions.filter((q) => q.status === "OPEN");
  const answered: Q[] = ev.questions.filter((q) => q.status === "ANSWERED");
  const hidden: Q[] = ev.questions.filter((q) => q.status === "HIDDEN");

  // Sammel-Versand-Pool: offene + beantwortete (damit beantwortete erneut
  // korrigiert/versendet werden koennen). Hidden ist raus.
  const pool = [...open, ...answered];

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Fragen aus dem Schulungs-Portal</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Teilnehmer reichen Fragen über das öffentliche Portal ein und sehen dort keine
        anderen Fragen. Markiere unten die Fragen, die du beantworten möchtest, tippe
        je eine Antwort und versende alles in <strong>einer</strong> Sammel-Mail.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      {canWrite && (
        <div className="card p-4 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-semibold text-ink">Fragen-Link an Teilnehmer senden</div>
            <div className="text-xs text-slate-500">
              Verschickt eine Mail mit Link zum Eingabefeld im Schulungs-Portal an alle aktiven Teilnehmer.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <form method="post" action={`/api/events/${ev.id}/questions/invite/test`}>
              <button className="btn-secondary text-sm">✉️ Test an mich</button>
            </form>
            <form method="post" action={`/api/events/${ev.id}/questions/invite`}>
              <button className="btn-primary text-sm">📧 An alle versenden</button>
            </form>
          </div>
        </div>
      )}

      <div className="card p-4 mb-5 grid grid-cols-3 gap-3 text-center text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Offen</div>
          <div className="text-2xl font-bold text-ink">{open.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Beantwortet</div>
          <div className="text-2xl font-bold text-emerald-700">{answered.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Ausgeblendet</div>
          <div className="text-2xl font-bold text-slate-500">{hidden.length}</div>
        </div>
      </div>

      {canWrite && pool.length > 0 && (
        <form method="post" action={`/api/events/${ev.id}/questions/send-batch`} className="space-y-4 mb-6">
          {/* Toolbar - sticky am oberen Rand */}
          <div className="card p-4 sticky top-20 z-10 shadow-md">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="text-sm">
                <div className="font-bold text-ink">Sammel-Antwort versenden</div>
                <div className="text-xs text-slate-500">
                  Hake die Fragen unten an, tippe je Antwort, dann „Sammel-Mail versenden".
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer mr-2">
                  <input type="checkbox" name="includeNames" className="h-4 w-4 accent-ink" />
                  Namen mitsenden (falls vorhanden)
                </label>
                <button type="submit" name="mode" value="save" className="btn-secondary text-sm">
                  💾 Nur speichern
                </button>
                <button type="submit" name="mode" value="test" className="btn-secondary text-sm">
                  ✉️ Test an mich
                </button>
                <button type="submit" name="mode" value="send" className="btn-primary text-sm">
                  📧 Sammel-Mail versenden
                </button>
              </div>
            </div>
          </div>

          <BatchList title="Offene Fragen" items={open} />
          {answered.length > 0 && <BatchList title="Beantwortet" items={answered} />}
        </form>
      )}

      {hidden.length > 0 && <HiddenList items={hidden} eventId={ev.id} canWrite={canWrite} />}
    </Shell>
  );
}

function BatchList({ title, items }: { title: string; items: Q[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3 text-ink">{title}</h2>
      <div className="space-y-2">
        {items.map((q) => (
          <div key={q.id} className="card p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="qid"
                value={q.id}
                defaultChecked={q.status === "OPEN"}
                className="mt-1 h-5 w-5 accent-ink shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink whitespace-pre-wrap font-medium">{q.text}</div>
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
              </div>
            </label>
            <div className="mt-3 pl-8">
              <label className="label">Antwort</label>
              <textarea
                name={`answer-${q.id}`}
                defaultValue={q.answer ?? ""}
                rows={3}
                placeholder="Antwort-Text … (leer = nicht in Mail)"
                className="input text-sm"
              />
              {q.adminNote && (
                <div className="mt-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">
                  <span className="font-semibold">Interner Vermerk: </span>{q.adminNote}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HiddenList({ items, eventId, canWrite }: { items: Q[]; eventId: string; canWrite: boolean }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3 text-slate-500">Ausgeblendet</h2>
      <div className="space-y-2">
        {items.map((q) => (
          <details key={q.id} className="card p-4">
            <summary className="cursor-pointer list-none">
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{q.text}</div>
              <div className="text-xs text-slate-500 mt-1">
                {q.name ? `von ${q.name} · ` : ""}
                {new Date(q.createdAt).toLocaleString("de-DE")}
              </div>
            </summary>
            {canWrite && (
              <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap gap-2 justify-end">
                <form method="post" action={`/api/events/${eventId}/questions/${q.id}/update`}>
                  <input type="hidden" name="status" value="OPEN" />
                  <input type="hidden" name="adminNote" value={q.adminNote ?? ""} />
                  <button className="btn-secondary text-xs">Wieder einblenden</button>
                </form>
                <form method="post" action={`/api/events/${eventId}/questions/${q.id}/delete`}>
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
