import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAccounting } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { basePriceCents, finalPriceCents, formatEUR } from "@/lib/pricing";

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: { eventId?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAccounting(s)) redirect("/dashboard");

  const eventId = searchParams.eventId && searchParams.eventId !== "ALL" ? searchParams.eventId : null;
  const events = await prisma.event.findMany({
    orderBy: [{ day1Date: "desc" }, { createdAt: "desc" }],
    include: { training: true },
  });
  const parts = await prisma.participant.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(eventId ? { eventId } : {}),
    },
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
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Buchhaltung</h1>
        <div className="text-sm text-slate-500">
          <span className="font-semibold text-brand-700">{offen}</span> offen &middot;{" "}
          <span className="font-semibold text-slate-400">{erledigt}</span> erledigt
        </div>
      </div>

      <form method="get" className="card p-3 mb-6 flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Filter
        </label>
        <select
          name="eventId"
          defaultValue={eventId ?? "ALL"}
          className="input flex-1 min-w-[240px]"
          onChange={undefined}
        >
          <option value="ALL">Alle Veranstaltungen ({events.length})</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
              {e.day1Date ? ` - ${e.day1Date.toLocaleDateString("de-DE")}` : ""}
            </option>
          ))}
        </select>
        <button className="btn-primary text-sm">anzeigen</button>
        {eventId && (
          <a href="/accounting" className="text-xs text-slate-500 hover:underline">
            Filter zuruecksetzen
          </a>
        )}
      </form>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Teilnehmer</th>
              <th>Firma &amp; Anschrift</th>
              <th>Rechnungsanschrift</th>
              <th>Veranstaltung</th>
              <th className="text-right">RE-Betrag</th>
              <th className="text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, dec, cents, done }) => {
              const initials =
                `${dec.firstName?.[0] ?? ""}${dec.lastName?.[0] ?? ""}`.toUpperCase() || "??";
              const tnAddr = [
                dec.street,
                [dec.zip, dec.city].filter(Boolean).join(" "),
                dec.country,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <tr
                  key={p.id}
                  className={"align-top " + (done ? "bg-brand-50/60 text-slate-400" : "")}
                >
                  <td className="py-4">
                    <div className="flex items-start gap-3">
                      <span
                        className={
                          "h-10 w-10 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5 " +
                          (done ? "bg-slate-200 text-slate-400" : "bg-brand-100 text-brand-700")
                        }
                      >
                        {initials}
                      </span>
                      <div className="min-w-0 text-sm">
                        <div className={"font-medium " + (done ? "line-through" : "")}>
                          {dec.lastName}, {dec.firstName}
                        </div>
                        <div className="text-xs font-mono break-all">{dec.email}</div>
                        {dec.phone && (
                          <div className="text-xs text-slate-500 mt-0.5">{dec.phone}</div>
                        )}
                        {dec.costCenter && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            KSt: {dec.costCenter}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-sm">
                    {dec.company ? (
                      <div className="font-medium">{dec.company}</div>
                    ) : (
                      <div className="text-slate-400">-</div>
                    )}
                    {tnAddr && <div className="text-xs text-slate-500 mt-1">{tnAddr}</div>}
                  </td>
                  <td className="py-4 text-sm">
                    {dec.billingCompany && <div className="font-medium">{dec.billingCompany}</div>}
                    {dec.billingName && (
                      <div className="text-xs text-slate-600">{dec.billingName}</div>
                    )}
                    {dec.billingStreet && (
                      <div className="text-xs text-slate-500">{dec.billingStreet}</div>
                    )}
                    {dec.billingZipCity && (
                      <div className="text-xs text-slate-500">{dec.billingZipCity}</div>
                    )}
                    {dec.billingEmail && (
                      <div className="text-xs font-mono text-slate-500 mt-1 break-all">
                        {dec.billingEmail}
                      </div>
                    )}
                    {!dec.billingCompany &&
                      !dec.billingName &&
                      !dec.billingStreet &&
                      !dec.billingZipCity &&
                      !dec.billingEmail && (
                        <span className="text-xs text-slate-400 italic">
                          wie Teilnehmer-Anschrift
                        </span>
                      )}
                  </td>
                  <td className="py-4 text-sm">
                    <Link
                      href={`/events/${p.event.id}`}
                      className={done ? "hover:underline" : "text-brand-700 hover:underline font-medium"}
                    >
                      {p.event.title}
                    </Link>
                    <div className="text-xs text-slate-500 mt-1">
                      {p.event.day1Date ? p.event.day1Date.toLocaleDateString("de-DE") : "-"}
                      {p.event.day2Date
                        ? ` - ${p.event.day2Date.toLocaleDateString("de-DE")}`
                        : ""}
                    </div>
                    <div className="text-xs text-slate-500">
                      {p.dayOption === "DAY_1"
                        ? "Tag 1"
                        : p.dayOption === "DAY_2"
                        ? "Tag 2"
                        : "Beide Tage"}
                    </div>
                  </td>
                  <td className="py-4 text-right text-lg font-semibold whitespace-nowrap">
                    {formatEUR(cents)}
                  </td>
                  <td className="py-4 text-right">
                    {done ? (
                      <div className="space-y-1">
                        <div className="text-xs text-brand-700 font-semibold">erledigt</div>
                        <form
                          method="post"
                          action={`/api/participants/${p.id}/invoice`}
                          className="inline"
                        >
                          <input type="hidden" name="invoiceStatus" value="OPEN" />
                          <button className="text-xs text-slate-500 hover:text-brand-700 hover:underline">
                            rueckgaengig
                          </button>
                        </form>
                      </div>
                    ) : (
                      <form
                        method="post"
                        action={`/api/participants/${p.id}/invoice`}
                        className="inline"
                      >
                        <input type="hidden" name="invoiceStatus" value="ISSUED" />
                        <button className="btn-primary text-xs px-3 py-1.5">RE gestellt</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-slate-500 py-8">
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
