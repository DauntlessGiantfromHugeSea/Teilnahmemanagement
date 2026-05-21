import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";
import { canWriteGlobal, listAccessibleEventIds } from "@/lib/rbac";

export default async function EventsPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  const acc = await listAccessibleEventIds(s);
  const where = acc === "ALL" ? {} : { id: { in: acc } };

  const events = await prisma.event.findMany({
    where,
    include: { training: true, _count: { select: { participants: true } } },
    orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
  });
  return (
    <Shell session={s} active="events">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Veranstaltungen</h1>
        {canWriteGlobal(s) && (
          <Link href="/events/new" className="btn-primary">Neue Veranstaltung</Link>
        )}
      </div>
      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Titel</th>
              <th>Format</th>
              <th>Schulung</th>
              <th>Tag 1</th>
              <th>Tag 2</th>
              <th>Wo</th>
              <th>Teilnehmer</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="font-medium">{e.title}</td>
                <td>
                  <span className={"badge " + (e.format === "WEBINAR" ? "bg-indigo-100 text-indigo-800" : "bg-brand-100 text-brand-700")}>
                    {e.format === "WEBINAR" ? "Webinar" : "Schulung"}
                  </span>
                </td>
                <td>{e.training.title}</td>
                <td>{e.day1Date?.toLocaleDateString("de-DE") ?? "-"}</td>
                <td>{e.day2Date?.toLocaleDateString("de-DE") ?? "-"}</td>
                <td className="text-xs">
                  {e.format === "WEBINAR"
                    ? (e.meetingUrl ? "Online" : "-")
                    : (e.location ?? "-")}
                </td>
                <td>
                  {e._count.participants}
                  {e.capacity ? <span className="text-slate-400"> / {e.capacity}</span> : null}
                </td>
                <td className="text-right">
                  <Link href={`/events/${e.id}`} className="text-brand-700 hover:underline text-sm">oeffnen</Link>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={8} className="text-center text-slate-500 py-6">Keine Veranstaltungen sichtbar.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
