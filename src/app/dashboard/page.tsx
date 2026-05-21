import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { listAccessibleEventIds } from "@/lib/rbac";
import Link from "next/link";

export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect("/login");
  const acc = await listAccessibleEventIds(s);
  const whereEvent = acc === "ALL" ? {} : { id: { in: acc } };

  const [eventCount, participantCount, openInvoices, upcoming] = await Promise.all([
    prisma.event.count({ where: whereEvent }),
    prisma.participant.count({ where: { event: whereEvent } }),
    prisma.participant.count({
      where: { event: whereEvent, invoiceStatus: "OPEN" },
    }),
    prisma.event.findMany({
      where: whereEvent,
      orderBy: { day1Date: "asc" },
      take: 5,
      include: {
        training: true,
        _count: { select: { participants: true } },
      },
    }),
  ]);

  return (
    <Shell session={s} active="dashboard">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Willkommen, {s.name.split(" ")[0]}</h1>
        <div className="text-sm text-slate-500">{new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <KpiCard label="Veranstaltungen" value={eventCount} />
        <KpiCard label="Teilnehmer" value={participantCount} />
        <KpiCard label="Offene Rechnungen" value={openInvoices} tone="warn" />
      </div>

      <section className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Naechste Veranstaltungen</h2>
          <Link href="/events" className="text-sm text-brand-700 hover:underline">Alle anzeigen</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500">Keine Veranstaltungen sichtbar.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Titel</th>
                <th>Schulung</th>
                <th>Termin</th>
                <th>Teilnehmer</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.title}</td>
                  <td>{e.training.title}</td>
                  <td>{e.day1Date ? new Date(e.day1Date).toLocaleDateString("de-DE") : "-"}</td>
                  <td>{e._count.participants}</td>
                  <td className="text-right">
                    <Link href={`/events/${e.id}`} className="text-brand-700 hover:underline text-sm">oeffnen</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Shell>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: any; tone?: "warn" }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={"mt-2 text-2xl font-semibold " + (tone === "warn" ? "text-amber-600" : "text-slate-800")}>
        {value}
      </div>
    </div>
  );
}
