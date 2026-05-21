import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent, isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { basePriceCents, finalPriceCents, formatEUR, formatPct } from "@/lib/pricing";
import { DayOption, ParticipantStatus } from "@prisma/client";

const STATUS_LABELS: Record<ParticipantStatus, string> = {
  REGISTERED: "Angemeldet",
  CONFIRMED: "Bestaetigt",
  CANCELLED: "Storniert",
  ATTENDED: "Teilgenommen",
  NO_SHOW: "Nicht erschienen",
};

function dayLabel(d: DayOption) {
  return d === "DAY_1" ? "Tag 1" : d === "DAY_2" ? "Tag 2" : "Beide Tage";
}

export default async function EventDetail({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canViewEvent(s, params.id))) redirect("/events");

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { training: true, participants: { orderBy: { createdAt: "desc" } } },
  });
  if (!ev) notFound();

  const canWrite = await canWriteEvent(s, ev.id);
  const participants = ev.participants.map(decryptParticipant);

  return (
    <Shell session={s} active="events">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <span className={"badge " + (ev.format === "WEBINAR" ? "bg-indigo-100 text-indigo-800" : "bg-brand-100 text-brand-700")}>
              {ev.format === "WEBINAR" ? "Webinar" : "Schulung"}
            </span>
            <span className="text-slate-500">Veranstaltung</span>
          </div>
          <h1 className="text-2xl font-semibold mt-1">{ev.title}</h1>
          <div className="text-sm text-slate-500 mt-1 space-x-1">
            <span>{ev.training.title}</span>
            <span>&middot;</span>
            <span>
              {ev.day1Date?.toLocaleDateString("de-DE") ?? "-"}
              {ev.day2Date ? ` / ${ev.day2Date.toLocaleDateString("de-DE")}` : ""}
              {ev.startTime ? `, ${ev.startTime}${ev.endTime ? `-${ev.endTime}` : ""} Uhr` : ""}
            </span>
            {ev.format === "WEBINAR" && ev.meetingUrl ? (
              <>
                <span>&middot;</span>
                <a href={ev.meetingUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline break-all">
                  Meeting-Link
                </a>
              </>
            ) : ev.location ? (
              <>
                <span>&middot;</span>
                <span>{ev.location}</span>
              </>
            ) : null}
          </div>
          {ev.description && (
            <p className="text-sm text-slate-600 mt-2 max-w-2xl">{ev.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <Link href={`/events/${ev.id}/edit`} className="btn-secondary">Bearbeiten</Link>
          )}
          {canWrite && (
            <Link href={`/events/${ev.id}/participants/new`} className="btn-primary">Teilnehmer eintragen</Link>
          )}
          {isAdmin(s) && (
            <Link href={`/events/${ev.id}/access`} className="btn-secondary">Zugriffe</Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 text-sm">
        <div className="card p-4">
          <div className="text-xs text-slate-500">Tag 1</div>
          <div className="font-semibold">{formatEUR(ev.training.priceDay1)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Tag 2</div>
          <div className="font-semibold">{formatEUR(ev.training.priceDay2)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Beide Tage</div>
          <div className="font-semibold">{formatEUR(ev.training.priceBoth)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-500">Teilnehmer gesamt</div>
          <div className="font-semibold">{participants.length}</div>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold">Teilnehmer</div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Buchung</th>
              <th>Rabatt</th>
              <th>Endbetrag</th>
              <th>Status</th>
              <th>RE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const base = basePriceCents(ev.training, p.dayOption);
              const final = finalPriceCents(base, p.discountBps);
              return (
                <tr key={p.id}>
                  <td className="font-medium">
                    {p.lastName}, {p.firstName}
                    {p.company ? <div className="text-xs text-slate-500">{p.company}</div> : null}
                  </td>
                  <td className="font-mono text-xs">{p.email}</td>
                  <td>{dayLabel(p.dayOption)}</td>
                  <td>{p.discountBps > 0 ? formatPct(p.discountBps) : "-"}</td>
                  <td className="font-semibold">{formatEUR(final)}</td>
                  <td>
                    <span className="badge bg-slate-100 text-slate-700">{STATUS_LABELS[p.status]}</span>
                  </td>
                  <td>
                    <span className={"badge " + invoiceTone(p.invoiceStatus)}>
                      {invoiceLabel(p.invoiceStatus)}
                    </span>
                  </td>
                  <td className="text-right">
                    <Link href={`/events/${ev.id}/participants/${p.id}`} className="text-brand-700 hover:underline text-sm">oeffnen</Link>
                  </td>
                </tr>
              );
            })}
            {participants.length === 0 && (
              <tr><td colSpan={8} className="text-center text-slate-500 py-6">Noch keine Teilnehmer.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </Shell>
  );
}

function invoiceLabel(s: string) {
  return s === "OPEN" ? "offen" : s === "ISSUED" ? "gestellt" : s === "PAID" ? "bezahlt" : "storniert";
}
function invoiceTone(s: string) {
  return s === "PAID"
    ? "bg-green-100 text-green-800"
    : s === "ISSUED"
    ? "bg-blue-100 text-blue-800"
    : s === "CANCELLED"
    ? "bg-slate-100 text-slate-600"
    : "bg-amber-100 text-amber-800";
}
