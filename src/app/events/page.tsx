import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { prisma } from "@/lib/db";
import { canWriteGlobal, listAccessibleEventIds } from "@/lib/rbac";
import type { Event, Training } from "@prisma/client";

type EventRow = Event & {
  training: Training;
  _count: { participants: number };
};

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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isPast = (e: EventRow) => {
    const last = e.day2Date ?? e.day1Date;
    return last ? last < todayStart : false;
  };
  const upcoming = events.filter((e) => !isPast(e));
  const past = events.filter(isPast);
  // Aktuelle aufsteigend (nächste zuerst), Archiv absteigend (jüngste zuerst)
  upcoming.sort((a, b) => {
    const ax = a.day1Date?.getTime() ?? Infinity;
    const bx = b.day1Date?.getTime() ?? Infinity;
    return ax - bx;
  });

  return (
    <Shell session={s} active="events">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Veranstaltungen</h1>
        {canWriteGlobal(s) && (
          <Link href="/events/new" className="btn-primary">Neue Veranstaltung</Link>
        )}
      </div>

      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Aktuell &amp; kommend
          </h2>
          <span className="text-xs text-slate-500">{upcoming.length}</span>
        </div>
        <EventTable events={upcoming} emptyText="Keine aktuellen Veranstaltungen." />
      </section>

      <section>
        <details className="card overflow-hidden">
          <summary className="cursor-pointer px-4 py-3 flex items-center justify-between hover:bg-slate-50">
            <span className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                Archiv
              </span>
              <span className="text-xs text-slate-500">{past.length} vergangene</span>
            </span>
            <span aria-hidden className="text-slate-400 text-sm">&#9662;</span>
          </summary>
          <div className="border-t border-slate-200">
            <EventTable events={past} emptyText="Keine vergangenen Veranstaltungen." inCard />
          </div>
        </details>
      </section>
    </Shell>
  );
}

function EventTable({
  events,
  emptyText,
  inCard,
}: {
  events: EventRow[];
  emptyText: string;
  inCard?: boolean;
}) {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    inCard ? <>{children}</> : <div className="card overflow-hidden">{children}</div>;
  return (
    <Wrapper>
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
                <span
                  className={
                    "badge " +
                    (e.format === "WEBINAR"
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-brand-100 text-brand-700")
                  }
                >
                  {e.format === "WEBINAR" ? "Webinar" : "Schulung"}
                </span>
              </td>
              <td>{e.training.title}</td>
              <td>{e.day1Date?.toLocaleDateString("de-DE") ?? "-"}</td>
              <td>{e.day2Date?.toLocaleDateString("de-DE") ?? "-"}</td>
              <td className="text-xs">
                {e.format === "WEBINAR"
                  ? e.meetingUrl
                    ? "Online"
                    : "-"
                  : (e.location ?? "-")}
              </td>
              <td>
                {e._count.participants}
                {e.capacity ? <span className="text-slate-400"> / {e.capacity}</span> : null}
              </td>
              <td className="text-right">
                <Link href={`/events/${e.id}`} className="text-brand-700 hover:underline text-sm">
                  oeffnen
                </Link>
              </td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-slate-500 py-6">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Wrapper>
  );
}
