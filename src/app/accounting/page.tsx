import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { isAccounting } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { basePriceCents, finalPriceCents, formatEUR, formatPct } from "@/lib/pricing";
import { InvoiceStatus } from "@prisma/client";

const STATUSES: { value: InvoiceStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Alle" },
  { value: "OPEN", label: "Offen" },
  { value: "ISSUED", label: "Gestellt" },
  { value: "PAID", label: "Bezahlt" },
  { value: "CANCELLED", label: "Storniert" },
];

export default async function AccountingPage({
  searchParams,
}: {
  searchParams: { status?: string; eventId?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!isAccounting(s)) redirect("/dashboard");

  const filterStatus = (searchParams.status ?? "ALL") as InvoiceStatus | "ALL";
  const eventId = searchParams.eventId;

  const events = await prisma.event.findMany({ orderBy: { day1Date: "desc" } });
  const where: any = {};
  if (filterStatus !== "ALL") where.invoiceStatus = filterStatus;
  if (eventId) where.eventId = eventId;

  const parts = await prisma.participant.findMany({
    where,
    include: { event: { include: { training: true } } },
    orderBy: { createdAt: "desc" },
  });

  const decrypted = parts.map((p) => ({ ...p, dec: decryptParticipant(p) }));

  const sumOpen = decrypted
    .filter((p) => p.invoiceStatus === "OPEN" && p.status !== "CANCELLED")
    .reduce((s, p) => s + finalPriceCents(basePriceCents(p.event.training, p.dayOption), p.discountBps), 0);
  const sumIssued = decrypted
    .filter((p) => p.invoiceStatus === "ISSUED")
    .reduce((s, p) => s + finalPriceCents(basePriceCents(p.event.training, p.dayOption), p.discountBps), 0);
  const sumPaid = decrypted
    .filter((p) => p.invoiceStatus === "PAID")
    .reduce((s, p) => s + finalPriceCents(basePriceCents(p.event.training, p.dayOption), p.discountBps), 0);

  return (
    <Shell session={s} active="accounting">
      <h1 className="text-2xl font-semibold mb-6">Buchhaltung</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Kpi label="Offen" value={formatEUR(sumOpen)} tone="warn" />
        <Kpi label="Gestellt" value={formatEUR(sumIssued)} tone="info" />
        <Kpi label="Bezahlt" value={formatEUR(sumPaid)} tone="good" />
      </div>

      <form className="card p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">RE-Status</label>
          <select name="status" defaultValue={filterStatus} className="input">
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Veranstaltung</label>
          <select name="eventId" defaultValue={eventId ?? ""} className="input min-w-[260px]">
            <option value="">Alle</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary">Filtern</button>
      </form>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Teilnehmer</th>
              <th>Firma</th>
              <th>Anschrift</th>
              <th>Veranstaltung</th>
              <th>Buchung</th>
              <th>Basis</th>
              <th>Rabatt</th>
              <th>Endbetrag</th>
              <th>RE-Nr.</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {decrypted.map((p) => {
              const base = basePriceCents(p.event.training, p.dayOption);
              const final = finalPriceCents(base, p.discountBps);
              return (
                <tr key={p.id}>
                  <td className="font-medium">
                    {p.dec.lastName}, {p.dec.firstName}
                    <div className="text-xs text-slate-500">{p.dec.email}</div>
                  </td>
                  <td>{p.dec.company ?? "-"}</td>
                  <td className="text-xs">
                    {[p.dec.street, [p.dec.zip, p.dec.city].filter(Boolean).join(" "), p.dec.country].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td>{p.event.title}</td>
                  <td>{p.dayOption === "DAY_1" ? "Tag 1" : p.dayOption === "DAY_2" ? "Tag 2" : "Beide"}</td>
                  <td>{formatEUR(base)}</td>
                  <td>{p.discountBps > 0 ? formatPct(p.discountBps) : "-"}</td>
                  <td className="font-semibold">{formatEUR(final)}</td>
                  <td>{p.invoiceNumber ?? "-"}</td>
                  <td>
                    <form method="post" action={`/api/participants/${p.id}/invoice`} className="flex gap-1">
                      <select name="invoiceStatus" defaultValue={p.invoiceStatus} className="input py-1 text-xs">
                        <option value="OPEN">offen</option>
                        <option value="ISSUED">gestellt</option>
                        <option value="PAID">bezahlt</option>
                        <option value="CANCELLED">storniert</option>
                      </select>
                      <button className="btn-secondary text-xs">OK</button>
                    </form>
                  </td>
                  <td className="text-right">
                    <Link href={`/events/${p.eventId}/participants/${p.id}`} className="text-brand-700 hover:underline text-xs">Detail</Link>
                  </td>
                </tr>
              );
            })}
            {decrypted.length === 0 && (
              <tr><td colSpan={11} className="text-center text-slate-500 py-6">Keine Eintraege.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Shell>
  );
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
