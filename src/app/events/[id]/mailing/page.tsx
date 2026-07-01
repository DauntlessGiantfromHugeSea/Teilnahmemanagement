import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";

export const dynamic = "force-dynamic";

export default async function EventMailingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string; preview?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canViewEvent(s, params.id))) redirect("/events");
  if (!(await canManageEvent(s, params.id))) redirect(`/events/${params.id}`);
  const canWrite = await canManageEvent(s, params.id);

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { participants: true },
  });
  if (!ev) notFound();

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const decrypted = ev.participants.map(decryptParticipant);
  const withEmail = decrypted.filter((p) => EMAIL_RE.test((p.email ?? "").trim()));
  const missing = decrypted.length - withEmail.length;

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Rundmail an alle Teilnehmer</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Schickt eine identische Mail an alle Teilnehmer dieser Veranstaltung mit gültiger
        E-Mail-Adresse. Platzhalter <code>{"{firstName}"}</code>, <code>{"{lastName}"}</code>,
        <code>{"{eventTitle}"}</code> werden pro Empfänger ersetzt.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      <div className="card p-4 mb-5 grid grid-cols-2 gap-3 text-center text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Empfänger</div>
          <div className="text-2xl font-semibold text-brand-700">{withEmail.length}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Ohne gültige E-Mail</div>
          <div className="text-2xl font-semibold text-amber-700">{missing}</div>
        </div>
      </div>

      {canWrite && (
        <form method="post" action={`/api/events/${ev.id}/mailing/send`} className="card p-4 space-y-3">
          <div>
            <label className="label">Betreff</label>
            <input
              name="subject"
              required
              placeholder={`Wichtige Infos zu „${ev.title}"`}
              defaultValue={searchParams.preview ?? ""}
              className="input"
            />
          </div>
          <div>
            <label className="label">Nachricht</label>
            <textarea
              name="body"
              required
              rows={12}
              placeholder={`Hallo {firstName} {lastName},\n\nkurz vorab ein paar Infos zu Ihrer Schulung am ...\n\nViele Grüße\nWolf-Hagen Stolzenburg`}
              className="input font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Reiner Text mit Zeilenumbrüchen. URLs werden in der HTML-Version automatisch verlinkt.
              Platzhalter: <code>{"{firstName}"}</code>, <code>{"{lastName}"}</code>, <code>{"{eventTitle}"}</code>,
              <code>{"{eventDate}"}</code>.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              name="mode"
              value="test"
              formAction={`/api/events/${ev.id}/mailing/send`}
              className="btn-secondary text-sm"
            >
              Testmail an mich
            </button>
            <button name="mode" value="send" className="btn-primary text-sm">An {withEmail.length} Teilnehmer senden</button>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" name="bccAdmin" defaultChecked className="h-4 w-4 accent-brand-600" />
              Kopie an Admin (BCC)
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Vorschau-Empfänger: {withEmail.slice(0, 5).map((p) => `${p.firstName} ${p.lastName}`).join(", ")}
            {withEmail.length > 5 ? ` und ${withEmail.length - 5} weitere` : ""}
            {missing > 0 ? ` — ${missing} Teilnehmer werden übersprungen (keine Mail-Adresse).` : ""}
          </p>
        </form>
      )}
    </Shell>
  );
}
