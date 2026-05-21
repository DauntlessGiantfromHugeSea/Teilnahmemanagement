import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAccounting } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { basePriceCents, finalPriceCents, formatEUR } from "@/lib/pricing";

export default async function AccountingPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAccounting(s)) redirect("/dashboard");

  const events = await prisma.event.findMany({
    orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
    include: {
      training: true,
      participants: { where: { status: { not: "CANCELLED" } } },
    },
  });

  const rows = events.map((e) => {
    const totals = { open: 0, issued: 0, paid: 0, cancelled: 0 };
    const counts = { open: 0, issued: 0, paid: 0, cancelled: 0 };
    for (const p of e.participants) {
      const cents = finalPriceCents(basePriceCents(e.training, p.dayOption), p.discountBps);
      const k = p.invoiceStatus.toLowerCase() as keyof typeof totals;
      totals[k] += cents;
      counts[k] += 1;
    }
    const total = totals.open + totals.issued + totals.paid;
    return {
      id: e.id,
      title: e.title,
      day1Date: e.day1Date,
      day2Date: e.day2Date,
      format: e.format,
      participantCount: e.participants.length,
      totals,
      counts,
      total,
    };
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const upcoming = rows.filter((r) => {
    const last = r.day2Date ?? r.day1Date;
    return !last || last >= todayStart;
  });
  const past = rows.filter((r) => {
    const last = r.day2Date ?? r.day1Date;
    return last && last < todayStart;
  });

  const grand = rows.reduce(
    (acc, r) => {
      acc.open += r.totals.open;
      acc.issued += r.totals.issued;
      acc.paid += r.totals.paid;
      return acc;
    },
    { open: 0, issued: 0, paid: 0 }
  );

  return (
    <Shell session={s} active="accounting">
      <h1 className="text-2xl font-semibold mb-6">Buchhaltung</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Kpi label="Offen" value={formatEUR(grand.open)} tone="warn" />
        <Kpi label="Gestellt" value={formatEUR(grand.issued)} tone="info" />
        <Kpi label="Bezahlt" value={formatEUR(grand.paid)} tone="good" />
      </div>

      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Aktuell &amp; kommend
          </h2>
          <span className="text-xs text-slate-500">{upcoming.length}</span>
        </div>
        <EventTable rows={upcoming} emptyText="Keine aktuellen Veranstaltungen." />
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
            <EventTable rows={past} emptyText="Keine vergangenen Veranstaltungen." bare />
          </div>
        </details>
      </section>

      <p className="text-xs text-slate-500 mt-6">
        Rechnungsstatus und -nummern werden je Teilnehmer in der Detailansicht gepflegt.
        Diese Seite ist nur die Uebersicht.
      </p>
    </Shell>
  );
}

interface Row {
  id: string;
  title: string;
  day1Date: Date | null;
  day2Date: Date | null;
  format: string;
  participantCount: number;
  totals: { open: number; issued: number; paid: number; cancelled: number };
  counts: { open: number; issued: number; paid: number; cancelled: number };
  total: number;
}

function EventTable({
  rows,
  emptyText,
  bare,
}: {
  rows: Row[];
  emptyText: string;
  bare?: boolean;
}) {
  const table = (
    <table className="table">
      <thead>
        <tr>
          <th>Veranstaltung</th>
          <th>Termin</th>
          <th className="text-right">Teilnehmer</th>
          <th className="text-right">Offen</th>
          <th className="text-right">Gestellt</th>
          <th className="text-right">Bezahlt</th>
          <th className="text-right">Gesamt</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-slate-500">
                {r.format === "WEBINAR" ? "Webinar" : "Schulung"}
              </div>
            </td>
            <td className="text-sm">
              {r.day1Date ? r.day1Date.toLocaleDateString("de-DE") : "-"}
              {r.day2Date ? ` - ${r.day2Date.toLocaleDateString("de-DE")}` : ""}
            </td>
            <td className="text-right">{r.participantCount}</td>
            <td className="text-right">
              {r.totals.open > 0 ? (
                <span className="text-amber-700">{formatEUR(r.totals.open)}</span>
              ) : (
                <span className="text-slate-300">-</span>
              )}
              {r.counts.open > 0 && (
                <div className="text-xs text-slate-400">{r.counts.open} TN</div>
              )}
            </td>
            <td className="text-right">
              {r.totals.issued > 0 ? (
                <span className="text-blue-700">{formatEUR(r.totals.issued)}</span>
              ) : (
                <span className="text-slate-300">-</span>
              )}
              {r.counts.issued > 0 && (
                <div className="text-xs text-slate-400">{r.counts.issued} TN</div>
              )}
            </td>
            <td className="text-right">
              {r.totals.paid > 0 ? (
                <span className="text-green-700">{formatEUR(r.totals.paid)}</span>
              ) : (
                <span className="text-slate-300">-</span>
              )}
              {r.counts.paid > 0 && (
                <div className="text-xs text-slate-400">{r.counts.paid} TN</div>
              )}
            </td>
            <td className="text-right font-semibold">{formatEUR(r.total)}</td>
            <td className="text-right">
              <Link
                href={`/events/${r.id}`}
                className="text-brand-700 hover:underline text-sm"
              >
                oeffnen
              </Link>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8} className="text-center text-slate-500 py-6">
              {emptyText}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
  if (bare) return table;
  return <div className="card overflow-hidden">{table}</div>;
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "warn" | "info" | "good" }) {
  const cls =
    tone === "warn" ? "text-amber-600" : tone === "info" ? "text-blue-700" : "text-green-700";
  return (
    <div className="card p-5">
      <div className="text-xs text-slate-500 uppercase">{label}</div>
      <div className={"mt-2 text-2xl font-semibold " + cls}>{value}</div>
    </div>
  );
}
