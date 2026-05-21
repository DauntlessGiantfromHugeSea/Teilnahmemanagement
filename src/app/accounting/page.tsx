import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAccounting } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { basePriceCents, finalPriceCents, formatEUR } from "@/lib/pricing";

export default async function AccountingPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAccounting(s)) redirect("/dashboard");

  const parts = await prisma.participant.findMany({
    where: { status: { not: "CANCELLED" } },
    include: { event: { include: { training: true } } },
    orderBy: [{ event: { day1Date: "desc" } }, { createdAt: "desc" }],
  });

  const rows = parts.map((p) => {
    const dec = decryptParticipant(p);
    const cents = finalPriceCents(basePriceCents(p.event.training, p.dayOption), p.discountBps);
    return { p, dec, cents, done: p.invoiceStatus !== "OPEN" };
  });

  const total = rows.length;
  const offen = rows.filter((r) => !r.done).length;
  const erledigt = total - offen;

  return (
    <Shell session={s} active="accounting">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-semibold">Buchhaltung</h1>
        <div className="text-sm text-slate-500">
          <span className="font-semibold text-brand-700">{offen}</span> offen &middot;{" "}
          <span className="font-semibold text-slate-400">{erledigt}</span> erledigt
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Teilnehmer</th>
              <th>Firma</th>
              <th>Veranstaltung</th>
              <th>Buchung</th>
              <th className="text-right">Betrag</th>
              <th className="text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, dec, cents, done }) => (
              <tr key={p.id} className={done ? "bg-brand-50/60 text-slate-400" : ""}>
                <td className="font-medium">
                  <div className={done ? "line-through" : ""}>
                    {dec.lastName}, {dec.firstName}
                  </div>
                  <div className="text-xs text-slate-500">{dec.email}</div>
                </td>
                <td className="text-sm">{dec.company ?? "-"}</td>
                <td className="text-sm">
                  <Link
                    href={`/events/${p.event.id}`}
                    className={done ? "hover:underline" : "text-brand-700 hover:underline"}
                  >
                    {p.event.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {p.event.day1Date ? p.event.day1Date.toLocaleDateString("de-DE") : "-"}
                    {p.event.day2Date ? ` - ${p.event.day2Date.toLocaleDateString("de-DE")}` : ""}
                  </div>
                </td>
                <td className="text-sm">
                  {p.dayOption === "DAY_1" ? "Tag 1" : p.dayOption === "DAY_2" ? "Tag 2" : "Beide Tage"}
                </td>
                <td className="text-right font-semibold">{formatEUR(cents)}</td>
                <td className="text-right">
                  {done ? (
                    <form method="post" action={`/api/participants/${p.id}/invoice`} className="inline">
                      <input type="hidden" name="invoiceStatus" value="OPEN" />
                      <button className="text-xs text-slate-500 hover:text-brand-700 hover:underline">
                        rueckgaengig
                      </button>
                    </form>
                  ) : (
                    <form method="post" action={`/api/participants/${p.id}/invoice`} className="inline">
                      <input type="hidden" name="invoiceStatus" value="ISSUED" />
                      <button className="btn-primary text-xs px-3 py-1">RE gestellt</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-6">
                  Keine Eintraege.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
