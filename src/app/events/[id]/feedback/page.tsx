import { Fragment } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { getQuestionsForEvent, shortEventId } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export default async function EventFeedbackPage({
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
      feedbackInvites: {
        include: { participant: true, response: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ev) notFound();

  const questions = await getQuestionsForEvent(ev.feedbackQuestions ?? null);
  const totalParticipants = await prisma.participant.count({ where: { eventId: ev.id } });

  // Aggregation: Antworten pro Frage (nur fuer Auswahl-Typen)
  const responses = ev.feedbackInvites
    .filter((i) => i.response)
    .map((i) => {
      try { return JSON.parse(i.response!.answers) as Record<string, unknown>; }
      catch { return {}; }
    });
  const aggregates: Record<string, Record<string, number>> = {};
  for (const r of responses) {
    for (const q of questions) {
      if (!["select", "radio", "checkboxes"].includes(q.type)) continue;
      const v = r[q.id];
      const vals = Array.isArray(v) ? v : [v];
      for (const val of vals) {
        const key = String(val ?? "");
        if (!key) continue;
        aggregates[q.id] = aggregates[q.id] ?? {};
        aggregates[q.id][key] = (aggregates[q.id][key] ?? 0) + 1;
      }
    }
  }

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Feedback</h1>
      <p className="text-sm text-slate-500 mb-4">
        Schulungs-ID: <span className="font-mono">{shortEventId(ev.id, ev.externalId)}</span>
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <div className="card p-4 mb-5 grid grid-cols-3 gap-3 text-center text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Teilnehmer</div>
          <div className="text-2xl font-semibold">{totalParticipants}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Links versendet</div>
          <div className="text-2xl font-semibold text-brand-700">{ev.feedbackInvites.filter((i) => i.sentAt).length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Antworten</div>
          <div className="text-2xl font-semibold text-emerald-700">{responses.length}</div>
        </div>
      </div>

      {canWrite && (
        <div className="card p-4 mb-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            <form method="post" action={`/api/events/${ev.id}/feedback/send`}>
              <button className="btn-primary text-sm">📧 An alle Teilnehmer senden</button>
            </form>
            {ev.day2Date && (
              <>
                <form method="post" action={`/api/events/${ev.id}/feedback/send`}>
                  <input type="hidden" name="day" value="1" />
                  <button className="btn-secondary text-sm">Nur Tag-1-Teilnehmer</button>
                </form>
                <form method="post" action={`/api/events/${ev.id}/feedback/send`}>
                  <input type="hidden" name="day" value="2" />
                  <button className="btn-secondary text-sm">Nur Tag-2-Teilnehmer</button>
                </form>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Versendet pro Teilnehmer einen Token-Link per Mail. Aus Sicht des Teilnehmers
            ist das Feedback anonym beschriftet — intern siehst du, von wem es kommt.
            Bereits versendete Links werden nicht erneut zugestellt.
            {ev.day2Date && " Tag-1-/Tag-2-Buttons filtern nach dayOption — praktisch, um nach Abschluss von Tag 1 direkt die Tag-1-only-Teilnehmer anzuschreiben."}
          </p>
        </div>
      )}

      {/* Aggregierte Auswertung */}
      <h2 className="text-lg font-semibold mb-3">Auswertung</h2>
      {responses.length === 0 ? (
        <div className="card p-4 text-sm text-slate-500">Noch keine Antworten.</div>
      ) : (
        <div className="space-y-4 mb-8">
          {questions.map((q, idx) => {
            const agg = aggregates[q.id];
            return (
              <div key={q.id} className="card p-4">
                <div className="text-sm font-semibold mb-2">{idx + 1}. {q.text}</div>
                {agg ? (
                  <div className="space-y-1">
                    {Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([val, n]) => {
                      const max = Math.max(...Object.values(agg));
                      const pct = max > 0 ? Math.round((n / max) * 100) : 0;
                      return (
                        <div key={val} className="text-xs">
                          <div className="flex justify-between mb-0.5">
                            <span>{val}</span>
                            <span className="text-slate-500">{n}×</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded">
                            <div className="h-1.5 bg-brand-600 rounded" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1 text-xs text-slate-700">
                    {responses
                      .map((r) => String((r as any)[q.id] ?? "").trim())
                      .filter(Boolean)
                      .map((v, i) => (
                        <div key={i} className="border-l-2 border-brand-200 pl-2 py-0.5">{v}</div>
                      ))}
                    {responses.every((r) => !String((r as any)[q.id] ?? "").trim()) && (
                      <span className="text-slate-400 italic">keine Antworten</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Einzelantworten - Backend sieht wer */}
      <h2 className="text-lg font-semibold mb-3">Einzelantworten (intern sichtbar)</h2>
      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Teilnehmer</th>
              <th>Versendet</th>
              <th>Antwort</th>
              <th className="text-right">Link</th>
            </tr>
          </thead>
          <tbody>
            {ev.feedbackInvites.map((i) => {
              const dec = decryptParticipant(i.participant);
              let answers: Record<string, unknown> | null = null;
              if (i.response) {
                try { answers = JSON.parse(i.response.answers); } catch { /* ignore */ }
              }
              return (
                <Fragment key={i.id}>
                  <tr className="align-top text-sm">
                    <td>
                      <div className="font-medium">{dec.lastName}, {dec.firstName}</div>
                      <div className="text-xs text-slate-500 font-mono">{dec.email}</div>
                    </td>
                    <td className="text-xs text-slate-500">
                      {i.sentAt ? new Date(i.sentAt).toLocaleDateString("de-DE") : "—"}
                    </td>
                    <td className="text-xs">
                      {i.response ? (
                        <span className="text-emerald-700 font-semibold">
                          abgegeben {new Date(i.response.submittedAt).toLocaleDateString("de-DE")}
                        </span>
                      ) : (
                        <span className="text-slate-400">offen</span>
                      )}
                    </td>
                    <td className="text-right text-xs">
                      <a href={`/feedback/${i.token}`} target="_blank" className="text-brand-700 hover:underline font-mono">öffnen</a>
                    </td>
                  </tr>
                  {answers && (
                    <tr>
                      <td colSpan={4} className="bg-slate-50 px-4 py-3">
                        <details>
                          <summary className="text-xs text-brand-700 cursor-pointer hover:underline">
                            Antworten anzeigen
                          </summary>
                          <div className="mt-3 space-y-2 text-xs">
                            {questions.map((q, qi) => {
                              const a = answers![q.id];
                              const display = Array.isArray(a) ? a.join(", ") : String(a ?? "");
                              if (!display.trim()) return null;
                              return (
                                <div key={q.id}>
                                  <div className="text-slate-500">{qi + 1}. {q.text}</div>
                                  <div className="text-slate-900 font-medium">{display}</div>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {ev.feedbackInvites.length === 0 && (
              <tr><td colSpan={4} className="text-center text-slate-500 py-6">Noch keine Links versendet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
