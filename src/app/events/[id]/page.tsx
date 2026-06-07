import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canViewEvent, canWriteEvent, isAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { DeleteEventButton } from "@/components/DeleteEventButton";
import { PrivateValue } from "@/components/PrivateValue";
import { BADGE_TEMPLATES } from "@/lib/badgeTemplates";
import { formatEventDates, getEventLastDate } from "@/lib/eventDates";
import { basePriceCents, finalPriceCents, formatEUR, formatPct } from "@/lib/pricing";
import { DayOption, ParticipantStatus } from "@prisma/client";

const STATUS_LABELS: Record<ParticipantStatus, string> = {
  REGISTERED: "Angemeldet",
  CONFIRMED: "Bestätigt",
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
    include: { training: true, participants: true },
  });
  if (!ev) notFound();

  const canWrite = await canWriteEvent(s, ev.id);
  const participants = ev.participants
    .map(decryptParticipant)
    .sort((a, b) => {
      const ln = (a.lastName ?? "").localeCompare(b.lastName ?? "", "de");
      if (ln !== 0) return ln;
      return (a.firstName ?? "").localeCompare(b.firstName ?? "", "de");
    });

  const lastDate = getEventLastDate(ev);
  const isPast = !!(lastDate && lastDate < new Date(new Date().setHours(0, 0, 0, 0)));

  return (
    <Shell session={s} active="events">
      <div className="mb-4">
        <Link href="/events" className="text-sm text-slate-500 hover:text-slate-800 hover:underline">
          ← Zurück zur Übersicht
        </Link>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <span className={"badge " + (ev.format === "WEBINAR" ? "bg-indigo-100 text-indigo-800" : "bg-brand-100 text-brand-700")}>
              {ev.format === "WEBINAR" ? "Webinar" : "Schulung"}
            </span>
            {ev.cancelled && <span className="badge bg-red-100 text-red-700">abgesagt</span>}
            {isPast && !ev.cancelled && <span className="badge bg-slate-200 text-slate-700">archiviert</span>}
            <span className="text-slate-500">Veranstaltung</span>
          </div>
          <h1
            className={
              "text-2xl font-semibold mt-1 " + (ev.cancelled ? "line-through text-slate-400" : "")
            }
          >
            {ev.title}
          </h1>
          <div className="text-sm text-slate-500 mt-1 space-x-1">
            <span>{ev.training.title}</span>
            <span>&middot;</span>
            <span>
              {formatEventDates(ev)}
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
          {ev.cancelled && (
            <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 max-w-2xl">
              <strong>Diese Veranstaltung ist abgesagt.</strong> Neue öffentliche Anmeldungen werden
              abgelehnt. Bestehende Teilnehmer bleiben zur Nachvollziehbarkeit erhalten.
              Sie können die Absage zurücknehmen oder, wenn keine Teilnehmer mehr verknüpft sind,
              die Veranstaltung endgültig löschen.
            </div>
          )}
        </div>
        <div className="action-bar lg:justify-end">
          <a
            href={`/api/events/${ev.id}/attendance/pdf`}
            download
            className="btn-primary"
          >
            Anwesenheitsliste (PDF)
          </a>
          {ev.day2Date && (
            <>
              <a
                href={`/api/events/${ev.id}/attendance/pdf?day=1`}
                download
                className="btn-secondary text-xs"
                title="Nur Teilnehmer für Tag 1"
              >
                Tag 1
              </a>
              <a
                href={`/api/events/${ev.id}/attendance/pdf?day=2`}
                download
                className="btn-secondary text-xs"
                title="Nur Teilnehmer für Tag 2"
              >
                Tag 2
              </a>
            </>
          )}
          {/* Namensschilder: Dropdown mit Vorlagen */}
          <details className="menu inline-block">
            <summary className="btn-secondary cursor-pointer select-none">
              Namensschilder
              <span aria-hidden className="ml-1 text-slate-400">▾</span>
            </summary>
            <div className="menu-panel" style={{ minWidth: 260 }}>
              <div className="px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                Vorlage waehlen
              </div>
              {BADGE_TEMPLATES.map((tpl) => (
                <a
                  key={tpl.id}
                  href={`/api/events/${ev.id}/badges/pdf?template=${tpl.id}`}
                  download
                  className="menu-item"
                  title={tpl.description}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{tpl.name}</span>
                    {tpl.description && (
                      <span className="text-[11px] text-slate-500">{tpl.description}</span>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </details>
          {canWrite && (
            <Link href={`/events/${ev.id}/edit`} className="btn-secondary">Bearbeiten</Link>
          )}
          {canWrite && (
            <Link href={`/events/${ev.id}/blocks`} className="btn-secondary">Seite gestalten</Link>
          )}
          {canWrite && (
            <Link href={`/events/${ev.id}/participants/new`} className="btn-primary">Teilnehmer eintragen</Link>
          )}
          {canWrite && (
            <Link href={`/events/${ev.id}/certificates`} className="btn-secondary">Zertifikate</Link>
          )}
          {canWrite && (
            <Link href={`/events/${ev.id}/feedback`} className="btn-secondary">Feedback</Link>
          )}
          {canWrite && (
            <Link href={`/events/${ev.id}/mailing`} className="btn-secondary">Rundmail</Link>
          )}
          {canWrite && (
            <Link href={`/events/${ev.id}/agenda`} className="btn-secondary">Agenda</Link>
          )}
          {canWrite && (
            <Link href={`/events/${ev.id}/portal`} className="btn-secondary">Portal-Inhalte</Link>
          )}
          <a href={`/portal/${ev.id}`} target="_blank" className="btn-secondary">Portal ↗</a>
          {isAdmin(s) && (
            <Link href={`/events/${ev.id}/access`} className="btn-secondary">Zugriffe</Link>
          )}
          {canWrite && (
            <details className="inline-block">
              <summary
                className={
                  ev.cancelled
                    ? "btn-secondary cursor-pointer list-none"
                    : "btn-secondary text-amber-700 border-amber-200 hover:bg-amber-50 cursor-pointer list-none"
                }
              >
                {ev.cancelled ? "Absage zurücknehmen" : "Veranstaltung absagen"}
              </summary>
              <form
                method="post"
                action={`/api/events/${ev.id}/cancel`}
                className="mt-2 p-3 border border-amber-200 bg-amber-50 rounded-lg space-y-2 w-[320px]"
              >
                <input type="hidden" name="mode" value={ev.cancelled ? "reactivate" : "cancel"} />
                {!ev.cancelled && (
                  <>
                    <textarea
                      name="reason"
                      rows={2}
                      placeholder="Grund (optional, erscheint in der Mail)"
                      className="input text-sm"
                    />
                    <label className="flex items-start gap-2 text-xs text-slate-700">
                      <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-4 w-4 accent-brand-600" />
                      <span>Alle Teilnehmer per Mail informieren</span>
                    </label>
                  </>
                )}
                <button className="btn-primary text-sm w-full">
                  {ev.cancelled ? "Absage zurücknehmen" : "Jetzt absagen"}
                </button>
              </form>
            </details>
          )}
          {canWrite && ev.cancelled && (
            <DeleteEventButton eventId={ev.id} title={ev.title} />
          )}
        </div>
      </div>

      {canWrite && (
        <section className="card p-4 mb-6 bg-brand-50/40 border-brand-200">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                Öffentlicher Anmeldelink
              </div>
              <div className="mt-2 grid gap-2 text-xs">
                <div>
                  <div className="text-slate-500 mb-0.5">Direktlink (zum Teilen, in Mails / Newsletter):</div>
                  <code className="block bg-white border border-slate-200 rounded px-2 py-1.5 break-all font-mono text-slate-800">
                    https://teilnahme.fb-akademie.de/anmeldung/{ev.id}
                  </code>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-brand-700 hover:underline select-none">
                    iframe-Code für WordPress anzeigen
                  </summary>
                  <code className="mt-2 block bg-white border border-slate-200 rounded px-2 py-1.5 break-all font-mono text-slate-700 whitespace-pre-wrap">
{`<iframe src="https://teilnahme.fb-akademie.de/anmeldung/${ev.id}"
  width="100%" height="1000" frameborder="0"
  style="border:0;background:transparent;" loading="lazy"></iframe>`}
                  </code>
                </details>
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <a
                href={`/anmeldung/${ev.id}`}
                target="_blank"
                rel="noreferrer"
                className="btn-primary text-xs"
              >
                Anmeldeseite öffnen
              </a>
            </div>
          </div>
        </section>
      )}

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
        <div className="px-5 py-3 border-b border-slate-200/70 flex items-center justify-between">
          <h2 className="font-semibold">Teilnehmer ({participants.length})</h2>
        </div>

        {/* Mobile: Karten-Ansicht, eine Karte je Teilnehmer */}
        <div className="md:hidden divide-y divide-slate-200/60">
          {participants.length === 0 && (
            <div className="text-center text-slate-500 py-8 text-sm">Noch keine Teilnehmer.</div>
          )}
          {participants.map((p) => {
            const base = basePriceCents(ev.training, p.dayOption);
            const final = finalPriceCents(base, p.discountBps);
            const initials = `${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase() || "??";
            const isCancelled = p.status === "CANCELLED";
            return (
              <Link
                key={p.id}
                href={`/events/${ev.id}/participants/${p.id}`}
                className={"flex items-start gap-3 px-4 py-3 active:bg-brand-50 transition " + (isCancelled ? "opacity-60" : "")}
              >
                <span
                  className={
                    "h-10 w-10 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center " +
                    (isCancelled ? "bg-slate-200 text-slate-400" : "bg-brand-100 text-brand-700")
                  }
                >
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={"flex items-baseline gap-2 " + (isCancelled ? "line-through" : "")}>
                    <span className="font-medium truncate">{p.lastName}, {p.firstName}</span>
                  </div>
                  {p.company && <div className="text-xs text-slate-500 truncate">{p.company}</div>}
                  <div className="text-[11px] text-slate-500 font-mono mt-1 truncate">
                    <PrivateValue value={p.email} reveal={isAdmin(s)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2 text-[11px]">
                    <span className="badge bg-slate-100 text-slate-700">{dayLabel(p.dayOption)}</span>
                    <span className="badge bg-slate-100 text-slate-700">{STATUS_LABELS[p.status]}</span>
                    <span className={"badge " + invoiceTone(p.invoiceStatus)}>
                      RE: {invoiceLabel(p.invoiceStatus)}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-sm">{formatEUR(final)}</div>
                  {p.discountBps > 0 && (
                    <div className="text-[10px] text-slate-500">-{formatPct(p.discountBps)}</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Desktop: vollstaendige Tabelle */}
        <table className="table hidden md:table">
          <thead>
            <tr>
              <th>Teilnehmer</th>
              <th>Kontakt</th>
              <th>Buchung</th>
              <th className="text-right">Endbetrag</th>
              <th>Status</th>
              <th>RE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const base = basePriceCents(ev.training, p.dayOption);
              const final = finalPriceCents(base, p.discountBps);
              const initials = `${p.firstName?.[0] ?? ""}${p.lastName?.[0] ?? ""}`.toUpperCase() || "??";
              const isCancelled = p.status === "CANCELLED";
              return (
                <tr key={p.id} className={"align-top " + (isCancelled ? "text-slate-400" : "")}>
                  <td className="py-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={
                          "h-9 w-9 shrink-0 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5 " +
                          (isCancelled ? "bg-slate-200 text-slate-400" : "bg-brand-100 text-brand-700")
                        }
                      >
                        {initials}
                      </span>
                      <div className={"min-w-0 " + (isCancelled ? "line-through" : "")}>
                        <div className="font-medium">
                          {p.lastName}, {p.firstName}
                        </div>
                        {p.company && (
                          <div className="text-xs text-slate-500">{p.company}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-xs">
                    <div className="font-mono">
                      <PrivateValue value={p.email} reveal={isAdmin(s)} />
                    </div>
                    {p.phone && (
                      <div className="text-slate-500 mt-0.5">
                        <PrivateValue value={p.phone} reveal={isAdmin(s)} />
                      </div>
                    )}
                  </td>
                  <td className="py-3">
                    <div>{dayLabel(p.dayOption)}</div>
                    {p.discountBps > 0 && (
                      <div className="text-xs text-slate-500">Rabatt {formatPct(p.discountBps)}</div>
                    )}
                  </td>
                  <td className="py-3 text-right font-semibold">{formatEUR(final)}</td>
                  <td className="py-3">
                    <span className="badge bg-slate-100 text-slate-700">{STATUS_LABELS[p.status]}</span>
                  </td>
                  <td className="py-3">
                    <span className={"badge " + invoiceTone(p.invoiceStatus)}>
                      {invoiceLabel(p.invoiceStatus)}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <Link href={`/events/${ev.id}/participants/${p.id}`} className="text-brand-700 hover:underline text-sm">öffnen</Link>
                  </td>
                </tr>
              );
            })}
            {participants.length === 0 && (
              <tr><td colSpan={7} className="text-center text-slate-500 py-6">Noch keine Teilnehmer.</td></tr>
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
