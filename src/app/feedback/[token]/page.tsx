import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getQuestionsForEvent, shortEventId } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export default async function FeedbackFormPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { ok?: string };
}) {
  const invite = await prisma.feedbackInvite.findUnique({
    where: { token: params.token },
    include: { event: true, response: true },
  });
  if (!invite) notFound();

  const ev = invite.event;
  const shortId = shortEventId(ev.id, ev.externalId);

  if (invite.response || searchParams.ok) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="text-3xl mb-3 text-brand-700">✓</div>
          <h1 className="text-xl font-semibold mb-2 text-slate-900">Vielen Dank für Ihr Feedback!</h1>
          <p className="text-sm text-slate-600">
            Ihre Antworten wurden gespeichert. Sie können dieses Fenster nun schließen.
          </p>
        </div>
      </main>
    );
  }

  const questions = await getQuestionsForEvent(ev.feedbackQuestions ?? null);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-xs uppercase tracking-wide text-slate-500">Feedback zur Schulung</div>
          <div className="text-lg font-semibold text-slate-900 mt-1">{ev.title}</div>
          <div className="text-xs text-slate-500 mt-1 font-mono">Schulungs-ID: {shortId}</div>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Feedback</h1>
        <p className="text-sm text-slate-500 mb-8">Antworten sind anonym.</p>

        <form method="post" action={`/api/feedback/${invite.token}`} className="space-y-8">
          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <label className="block font-semibold text-slate-900 mb-2">
                {idx + 1}. {q.text}
              </label>
              {q.description && (
                <p className="text-sm text-slate-500 mb-3">{q.description}</p>
              )}
              {renderInput(q)}
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-brand-700">
              Übermitteln <span aria-hidden>→</span>
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function renderInput(q: { id: string; type: string; options?: string[]; required?: boolean }) {
  const name = q.id;
  const base =
    "w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500";
  if (q.type === "text") {
    return <input type="text" name={name} required={q.required} placeholder="Gib deine Antwort ein" className={base} />;
  }
  if (q.type === "textarea") {
    return <textarea name={name} required={q.required} rows={4} placeholder="Gib deine Antwort ein" className={base} />;
  }
  if (q.type === "select") {
    return (
      <select name={name} required={q.required} defaultValue="" className={base}>
        <option value="" disabled>Wähle eine Option</option>
        {(q.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (q.type === "checkboxes") {
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((o) => (
          <label key={o} className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
            <input type="checkbox" name={name} value={o} className="mt-1 h-4 w-4 accent-brand-600" />
            <span>{o}</span>
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {(q.options ?? []).map((o) => (
        <label key={o} className="flex items-start gap-2 text-sm text-slate-800 cursor-pointer">
          <input type="radio" name={name} value={o} required={q.required} className="mt-1 h-4 w-4 accent-brand-600" />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}
