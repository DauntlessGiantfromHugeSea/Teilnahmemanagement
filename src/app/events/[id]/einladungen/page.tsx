import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { InviteRecipients } from "@/components/InviteRecipients";
import { isMailingConfigured } from "@/lib/mailer";
import { eventDateLine, defaultInviteUrl } from "@/lib/invitations";

export const dynamic = "force-dynamic";

export default async function EventEinladungenPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canViewEvent(s, params.id))) redirect("/events");
  if (!(await canManageEvent(s, params.id))) redirect(`/events/${params.id}`);

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { training: true },
  });
  if (!ev) notFound();

  const dateLine = eventDateLine(ev);
  const link = defaultInviteUrl(ev.id);
  const mailReady = isMailingConfigured();

  const defaultBody =
    `Hallo {firstName},\n\n` +
    `wir laden Sie herzlich zu unserer Schulung „{eventTitle}" ein.\n\n` +
    `Termin: {eventDate}\n` +
    (ev.location ? `Ort: ${ev.location}\n` : "") +
    `\nÜber den folgenden Link können Sie sich direkt anmelden:\n{link}\n\n` +
    `Die Teilnehmerzahl ist begrenzt — eine frühzeitige Anmeldung lohnt sich.\n\n` +
    `Bei Fragen erreichen Sie uns unter info@fb-akademie.de.\n\n` +
    `Beste Grüße aus Leipzig\n` +
    `das Team der Flüssigboden Akademie`;

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <Link href={`/events/${ev.id}`} className="text-sm text-slate-500 hover:text-brand-700 hover:underline">
          ← {ev.title}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Einladungen verschicken</h1>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Lädt gezielt einzelne Personen zu dieser Veranstaltung ein. Die Adressen trägst du
        selbst ein — es werden keine Teilnehmer- oder Newsletter-Daten verwendet. Die
        Anmeldung läuft anschließend wie gewohnt über die Anmeldeseite.
      </p>

      {searchParams.ok && <div className="toast-ok mb-4"><span aria-hidden>✓</span><span>{searchParams.ok}</span></div>}
      {searchParams.error && <div className="toast-error mb-4"><span aria-hidden>!</span><span>{searchParams.error}</span></div>}

      {!mailReady && (
        <div className="toast-error mb-4">
          <span aria-hidden>!</span>
          <span>SMTP ist nicht konfiguriert — es lassen sich derzeit keine Mails versenden.</span>
        </div>
      )}

      <form method="post" action={`/api/events/${ev.id}/einladungen/send`} className="card p-4 space-y-4">
        <InviteRecipients name="recipients" />

        <div>
          <label className="label">Anmelde-Link</label>
          <input name="link" required defaultValue={link} className="input font-mono text-sm" />
          <p className="text-xs text-slate-500 mt-1">
            Steht im Text als <code>{"{link}"}</code>. Voreingestellt ist die Anmeldeseite dieser
            Veranstaltung — trag hier die Adresse deiner Website ein, wenn die Anmeldung dort
            eingebunden ist.
          </p>
        </div>

        <div>
          <label className="label">Betreff</label>
          <input
            name="subject"
            required
            defaultValue={`Einladung zur Schulung „${ev.title}"`}
            className="input"
          />
        </div>

        <div>
          <label className="label">Nachricht</label>
          <textarea name="body" required rows={16} defaultValue={defaultBody} className="input font-mono text-sm" />
          <p className="text-xs text-slate-500 mt-1">
            Reiner Text mit Zeilenumbrüchen. Platzhalter: <code>{"{firstName}"}</code>,{" "}
            <code>{"{lastName}"}</code>, <code>{"{eventTitle}"}</code>, <code>{"{eventDate}"}</code>,{" "}
            <code>{"{link}"}</code>. Ohne Namen in der Empfängerzeile wird aus
            „Hallo {"{firstName}"}," automatisch „Hallo,". Fehlt <code>{"{link}"}</code> im Text,
            wird die Anmelde-Schaltfläche unten angehängt.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap pt-1">
          <button name="mode" value="test" className="btn-secondary text-sm" disabled={!mailReady}>
            Testmail an mich
          </button>
          <button name="mode" value="send" className="btn-primary text-sm" disabled={!mailReady}>
            Einladungen verschicken
          </button>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" name="bccAdmin" defaultChecked className="h-4 w-4 accent-brand-600" />
            Kopie an Admin (BCC)
          </label>
        </div>

        <p className="text-xs text-slate-500">
          Jede Person bekommt eine eigene Mail — die Empfänger sehen sich gegenseitig nicht.
          Schick dir zuerst eine Testmail, danach lässt sich der Versand nicht mehr zurücknehmen.
          {dateLine ? ` Termin in der Mail: ${dateLine}.` : " Für diese Veranstaltung ist noch kein Termin hinterlegt."}
        </p>
      </form>
    </Shell>
  );
}
