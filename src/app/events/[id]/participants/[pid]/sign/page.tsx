import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { SignPad } from "./SignPad";

export const dynamic = "force-dynamic";

export default async function SignPage({ params }: { params: { id: string; pid: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canViewEvent(s, params.id))) redirect("/events");

  const p = await prisma.participant.findUnique({
    where: { id: params.pid },
    include: { event: true },
  });
  if (!p || p.eventId !== params.id) notFound();
  const dec = decryptParticipant(p);

  return (
    <Shell session={s} active="events">
      <div className="mb-3">
        <a
          href={`/events/${params.id}/participants/${params.pid}`}
          className="text-sm text-slate-500 hover:text-brand-700 hover:underline"
        >
          ← Zurück zum Teilnehmer
        </a>
      </div>
      <h1 className="text-2xl font-semibold mb-1">Anmeldebestätigung unterschreiben</h1>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        Unterschreibe unten mit der Maus oder dem Finger (auf Tablets/Touchscreens). Mit
        einem Klick auf <strong>„PDF erzeugen"</strong> wird die Unterschrift in die
        Anmeldebestätigung für <strong>{dec.firstName} {dec.lastName}</strong> eingefügt
        und das PDF heruntergeladen.
      </p>
      <SignPad participantId={params.pid} />
    </Shell>
  );
}
