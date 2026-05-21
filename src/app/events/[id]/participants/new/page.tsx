import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { ParticipantForm } from "@/components/ParticipantForm";

export default async function NewParticipant({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canWriteEvent(s, params.id))) redirect(`/events/${params.id}`);
  const ev = await prisma.event.findUnique({ where: { id: params.id }, include: { training: true } });
  if (!ev) notFound();
  return (
    <Shell session={s} active="events">
      <h1 className="text-2xl font-semibold mb-1">Teilnehmer eintragen</h1>
      <p className="text-sm text-slate-500 mb-6">Veranstaltung: {ev.title}</p>
      <div className="card p-6 max-w-3xl">
        <ParticipantForm action={`/api/events/${ev.id}/participants`} training={ev.training} />
      </div>
    </Shell>
  );
}
