import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { listAccessibleEventIds } from "@/lib/rbac";
import { decryptParticipant } from "@/lib/participants";
import Link from "next/link";

export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect("/login");
  const acc = await listAccessibleEventIds(s);
  const whereEvent = acc === "ALL" ? {} : { id: { in: acc } };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [eventCount, participantCount, openInvoices, upcoming, latestParts] = await Promise.all([
    prisma.event.count({ where: whereEvent }),
    prisma.participant.count({ where: { event: whereEvent } }),
    prisma.participant.count({
      where: { event: whereEvent, invoiceStatus: "OPEN" },
    }),
    prisma.event.findMany({
      where: {
        ...whereEvent,
        OR: [{ day1Date: { gte: todayStart } }, { day1Date: null }],
      },
      orderBy: { day1Date: "asc" },
      take: 5,
      include: {
        training: true,
        _count: { select: { participants: true } },
      },
    }),
    prisma.participant.findMany({
      where: { event: whereEvent },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { event: true },
    }),
  ]);

  const latest = latestParts.map((p) => ({ ...decryptParticipant(p), event: p.event }));

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

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold">Naechste Veranstaltungen</h2>
            <Link href="/events" className="text-sm text-brand-700 hover:underline">Alle anzeigen</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-slate-500 p-5">Keine kommenden Veranstaltungen.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-brand-50/50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{e.title}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {e.training.title}
                        {e.day1Date ? ` · ${new Date(e.day1Date).toLocaleDateString("de-DE")}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-brand-700">{e._count.participants}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wide">TN</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold">Neueste Anmeldungen</h2>
            <span className="text-xs text-slate-500">letzte {latest.length}</span>
          </div>
          {latest.length === 0 ? (
            <p className="text-sm text-slate-500 p-5">Noch keine Anmeldungen.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {latest.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/events/${p.event.id}/participants/${p.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50/50"
                  >
                    <Avatar firstName={p.firstName ?? ""} lastName={p.lastName ?? ""} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {p.lastName}, {p.firstName}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {p.company ? `${p.company} · ` : ""}{p.event.title}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 shrink-0">
                      {p.createdAt.toLocaleDateString("de-DE")}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Avatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "??";
  return (
    <span className="h-9 w-9 shrink-0 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center">
      {initials}
    </span>
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
