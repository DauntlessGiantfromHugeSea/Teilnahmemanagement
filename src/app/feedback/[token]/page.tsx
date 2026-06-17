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
      <main className="min-h-screen bg-white">
        <header className="relative overflow-hidden fba-hero">
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
          <div className="relative max-w-3xl mx-auto px-4 pt-14 pb-20 text-white text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-fba.png" alt="Flüssigboden Akademie" className="h-10 w-auto mx-auto mb-6 brightness-0 invert" />
            <div className="fba-pill mb-5">Feedback</div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Vielen Dank!</h1>
          </div>
        </header>
        <div className="max-w-md mx-auto px-4 -mt-14 pb-12 relative">
          <div className="fba-card shadow-xl shadow-slate-900/5 p-8 text-center">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-accent text-ink mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
            </div>
            <h2 className="text-xl font-bold text-ink mb-2">Ihre Antworten wurden gespeichert.</h2>
            <p className="text-sm text-slate-600">
              Sie können dieses Fenster nun schließen.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const questions = await getQuestionsForEvent(ev.feedbackQuestions ?? null);

  return (
    <main className="min-h-screen bg-white">
      <header className="relative overflow-hidden fba-hero">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white, transparent 50%)" }} />
        <div className="relative max-w-3xl mx-auto px-4 pt-12 pb-20 text-white text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fba.png" alt="Flüssigboden Akademie" className="h-10 w-auto mx-auto mb-6 brightness-0 invert" />
          <div className="fba-pill mb-5">Ihr Feedback ist uns wichtig</div>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight">{ev.title}</h1>
          <p className="mt-3 text-sm text-white/80 font-mono">Schulungs-ID: {shortId}</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 -mt-14 pb-12 relative space-y-5">
        <div className="fba-card p-5 text-center">
          <p className="text-sm text-slate-700">
            <span className="font-semibold text-ink">Antworten sind anonym</span> —
            bitte nehmen Sie sich 2 Minuten Zeit. Ihre Rückmeldung hilft uns, die Schulungen weiter zu verbessern.
          </p>
        </div>

        <form method="post" action={`/api/feedback/${invite.token}`} className="space-y-4">
          {questions.map((q, idx) => (
            <div key={q.id} className="fba-card p-5 sm:p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full bg-accent text-ink text-sm font-bold">
                  {idx + 1}
                </span>
                <label className="block font-semibold text-ink leading-snug pt-0.5">
                  {q.text}
                </label>
              </div>
              {q.description && (
                <p className="text-sm text-slate-500 mb-3 pl-10">{q.description}</p>
              )}
              <div className="pl-10">{renderInput(q)}</div>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button className="btn-primary px-6 py-3 text-base">
              Antworten übermitteln <span aria-hidden>→</span>
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
    "w-full px-4 py-2.5 rounded-2xl border-2 border-slate-200 bg-white text-sm text-ink placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500";
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
            <input type="checkbox" name={name} value={o} className="mt-1 h-4 w-4 accent-ink" />
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
          <input type="radio" name={name} value={o} required={q.required} className="mt-1 h-4 w-4 accent-ink" />
          <span>{o}</span>
        </label>
      ))}
    </div>
  );
}
