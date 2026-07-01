import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canManageEvent } from "@/lib/rbac";
import { EventForm } from "@/components/EventForm";
import { prisma } from "@/lib/db";

export default async function EditEvent({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canManageEvent(s, params.id))) redirect(`/events/${params.id}`);
  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { training: true },
  });
  if (!ev) notFound();
  return (
    <Shell session={s} active="events">
      <h1 className="text-2xl font-semibold mb-6">Veranstaltung bearbeiten</h1>
      <div className="card p-6 max-w-2xl">
        <EventForm event={ev} training={ev.training} action={`/api/events/${ev.id}`} />
      </div>
    </Shell>
  );
}
