import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canWriteGlobal } from "@/lib/rbac";
import { EventForm } from "@/components/EventForm";
import { prisma } from "@/lib/db";

export default async function NewEvent() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canWriteGlobal(s)) redirect("/dashboard");
  const trainings = await prisma.training.findMany({ where: { active: true }, orderBy: { title: "asc" } });
  return (
    <Shell session={s} active="events">
      <h1 className="text-2xl font-semibold mb-6">Neue Veranstaltung</h1>
      <div className="card p-6 max-w-2xl">
        <EventForm trainings={trainings} action="/api/events" />
      </div>
    </Shell>
  );
}
