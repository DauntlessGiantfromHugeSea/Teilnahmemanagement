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
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Veranstaltungen</h1>
        <div className="flex gap-2 flex-wrap">
          <a
            href="/anmeldung"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
            title="Öffentliche Übersicht aller Anmeldungen anzeigen"
          >
            Anmelde-Übersicht ↗
          </a>
          {canWriteGlobal(s) && (
            <Link href="/events/new" className="btn-primary">Neue Veranstaltung</Link>
          )}
        </div>
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
      {/* Mobile: Karten */}
      <div className="md:hidden divide-y divide-slate-200/60">
        {events.length === 0 && (
          <div className="text-center text-slate-500 py-6 text-sm">{emptyText}</div>
        )}
        {events.map((e) => {
          const dateLine =
            (e.day1Date?.toLocaleDateString("de-DE") ?? "-") +
            (e.day2Date ? ` – ${e.day2Date.toLocaleDateString("de-DE")}` : "");
          return (
            <Link
              key={e.id}
              href={`/events/${e.id}`}
              className={"flex flex-col gap-1 px-4 py-3 active:bg-brand-50 transition " + (e.cancelled ? "opacity-60" : "")}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
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
                {e.cancelled && <span className="badge bg-red-100 text-red-700">abgesagt</span>}
                <span className="text-slate-400">{dateLine}</span>
              </div>
              <div className={"font-semibold " + (e.cancelled ? "line-through" : "")}>
                {e.title}
              </div>
              <div className="text-xs text-slate-500">{e.training.title}</div>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                <span>
                  {e._count.participants}
                  {e.capacity ? ` / ${e.capacity}` : ""} Teilnehmer
                </span>
                <span className="text-brand-700">öffnen →</span>
              </div>
            </Link>
          );
        })}
      </div>
      {/* Desktop: Tabelle */}
      <table className="table hidden md:table">
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
            <tr key={e.id} className={e.cancelled ? "opacity-60" : ""}>
              <td className={"font-medium " + (e.cancelled ? "line-through" : "")}>
                {e.title}
              </td>
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
                {e.cancelled && (
                  <span className="badge bg-red-100 text-red-700 ml-1">abgesagt</span>
                )}
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
              <td className="text-right whitespace-nowrap">
                <a
                  href={`/anmeldung/${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 hover:underline text-xs mr-3"
                  title="Öffentliche Anmeldeseite in neuem Tab öffnen"
                >
                  Anmeldelink ↗
                </a>
                <Link href={`/events/${e.id}`} className="text-brand-700 hover:underline text-sm">
                  öffnen
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
