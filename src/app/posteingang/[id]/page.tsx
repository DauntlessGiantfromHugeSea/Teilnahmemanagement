import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TicketMsgDirection, TicketPriority, TicketStatus } from "@prisma/client";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canUseTickets } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { safeDecrypt } from "@/lib/crypto";
import {
  PRIORITY_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  decryptMessage,
  loadContactProfile,
  type ContactRegistration,
} from "@/lib/tickets";
import { TicketReplyBox } from "@/components/TicketReplyBox";

export const dynamic = "force-dynamic";

function fmtDateTime(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtDate(d: Date | null): string {
  if (!d) return "ohne Termin";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

const PARTICIPANT_STATUS: Record<string, string> = {
  REGISTERED: "angemeldet",
  ATTENDED: "teilgenommen",
  NO_SHOW: "nicht erschienen",
  CANCELLED: "storniert",
};

const INVOICE_STATUS: Record<string, string> = {
  OPEN: "offen",
  ISSUED: "gestellt",
  PAID: "bezahlt",
  CANCELLED: "storniert",
};

function RegistrationCard({ r }: { r: ContactRegistration }) {
  const dates = r.day2Date
    ? `${fmtDate(r.day1Date)} – ${fmtDate(r.day2Date)}`
    : fmtDate(r.day1Date);
  return (
    <li className="py-2.5 border-b border-slate-100 last:border-0">
      <Link
        href={`/events/${r.eventId}/participants/${r.participantId}`}
        className="text-sm font-medium text-brand-700 hover:underline block"
      >
        {r.eventTitle}
      </Link>
      <div className="text-xs text-slate-500">{r.trainingTitle}</div>
      <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{dates}</span>
        <span className="text-slate-300">·</span>
        <span>{PARTICIPANT_STATUS[r.status] ?? r.status}</span>
        <span className="text-slate-300">·</span>
        <span>Rechnung: {INVOICE_STATUS[r.invoiceStatus] ?? r.invoiceStatus}</span>
        {r.cancelled && (
          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold">
            Event abgesagt
          </span>
        )}
      </div>
      {r.certificates.length > 0 && (
        <div className="text-xs text-slate-500 mt-1">
          {r.certificates.map((c) => (
            <span key={c.id} className="inline-block mr-2">
              📄 {c.number}{" "}
              <span className="text-slate-400">
                ({c.type === "ZERTIFIKAT" ? "Zertifikat" : "Teilnahme"}, {c.status.toLowerCase()})
              </span>
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export default async function TicketPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canUseTickets(s)) redirect("/dashboard");

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: {
      mailbox: true,
      assignee: { select: { id: true, name: true } },
      messages: {
        orderBy: { sentAt: "asc" },
        include: { author: { select: { id: true, name: true } }, attachments: true },
      },
    },
  });
  if (!ticket) notFound();

  const subject = safeDecrypt(ticket.subject) ?? "(ohne Betreff)";
  const fromEmail = safeDecrypt(ticket.fromEmail) ?? "";
  const fromName = safeDecrypt(ticket.fromName);
  const messages = ticket.messages.map(decryptMessage);

  const [contact, users] = await Promise.all([
    fromEmail ? loadContactProfile(fromEmail, ticket.id) : null,
    prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "EDITOR", "EVENTMANAGER"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <Shell session={s} active="posteingang">
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <Link href="/posteingang" className="text-sm text-slate-500 hover:underline">
          ← Posteingang
        </Link>
        <span className="font-mono text-xs px-2 py-1 rounded bg-slate-100 text-slate-600">
          {ticket.reference}
        </span>
        <span
          className={"px-2 py-0.5 rounded-full text-xs font-semibold " + STATUS_CLASS[ticket.status]}
        >
          {STATUS_LABEL[ticket.status]}
        </span>
        {ticket.priority === TicketPriority.HIGH && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-600 text-white">
            Hohe Priorität
          </span>
        )}
      </div>
      <h1 className="text-2xl font-semibold mb-5">{subject}</h1>

      {searchParams.ok && (
        <div className="toast-ok mb-4">
          <span aria-hidden>✓</span>
          <span>{searchParams.ok}</span>
        </div>
      )}
      {searchParams.error && (
        <div className="toast-error mb-4">
          <span aria-hidden>!</span>
          <span>{searchParams.error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* --- Verlauf + Antwort --- */}
        <div className="lg:col-span-2 space-y-4">
          {messages.map((m) => {
            const isNote = m.direction === TicketMsgDirection.NOTE;
            const isOut = m.direction === TicketMsgDirection.OUTBOUND;
            return (
              <article
                key={m.id}
                className={
                  "card p-4 " +
                  (isNote
                    ? "bg-amber-50 border-amber-200"
                    : isOut
                      ? "bg-brand-50/60 border-brand-200"
                      : "")
                }
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {isNote ? (
                      <>🗒️ Interne Notiz — {m.authorName ?? m.fromName ?? "unbekannt"}</>
                    ) : isOut ? (
                      <>↗ Antwort von {m.authorName ?? "uns"}</>
                    ) : (
                      <>↘ {m.fromName ?? m.fromEmail}</>
                    )}
                  </div>
                  <time className="text-xs text-slate-500">{fmtDateTime(m.sentAt)}</time>
                </header>

                {!isNote && m.toEmails.length > 0 && (
                  <div className="text-xs text-slate-500 mb-2">
                    an {m.toEmails.join(", ")}
                    {m.ccEmails.length > 0 && <> · Cc {m.ccEmails.join(", ")}</>}
                  </div>
                )}

                {m.bodyHtml ? (
                  // Fremd-HTML nur isoliert rendern: sandbox ohne allow-scripts
                  // und ohne same-origin.
                  <iframe
                    title={`Nachricht ${m.id}`}
                    sandbox=""
                    srcDoc={m.bodyHtml}
                    className="w-full h-72 rounded border border-slate-200 bg-white"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                    {m.bodyText ?? "(kein Text)"}
                  </pre>
                )}

                {m.attachments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    {m.attachments.length} Anhang/Anhänge:{" "}
                    {m.attachments.map((a) => a.filename).join(", ")}
                  </div>
                )}
              </article>
            );
          })}

          {ticket.mailbox ? (
            <TicketReplyBox
              ticketId={ticket.id}
              defaultTo={fromEmail}
              mailboxLabel={`${ticket.mailbox.label} <${ticket.mailbox.address}>`}
              reference={ticket.reference}
            />
          ) : (
            <div className="card p-4 text-sm text-slate-600">
              Diesem Ticket ist kein Postfach zugeordnet — Antworten ist deshalb nicht möglich.
            </div>
          )}
        </div>

        {/* --- Kontakt + Historie --- */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Kontakt</h2>
            <div className="text-sm font-medium">{contact?.name ?? fromName ?? "—"}</div>
            <a href={`mailto:${fromEmail}`} className="text-sm text-brand-700 hover:underline break-all">
              {fromEmail}
            </a>
            {contact?.company && <div className="text-xs text-slate-500 mt-1">{contact.company}</div>}
            {contact?.phone && <div className="text-xs text-slate-500">{contact.phone}</div>}
            <dl className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
              <div className="flex justify-between gap-2">
                <dt>Eingegangen über</dt>
                <dd className="text-slate-700">{ticket.mailbox?.address ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Erstellt</dt>
                <dd className="text-slate-700">{fmtDateTime(ticket.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Erstmals beantwortet</dt>
                <dd className="text-slate-700">
                  {ticket.firstResponseAt ? fmtDateTime(ticket.firstResponseAt) : "noch nicht"}
                </dd>
              </div>
              {contact && contact.otherTicketCount > 0 && (
                <div className="flex justify-between gap-2">
                  <dt>Weitere Tickets</dt>
                  <dd>
                    <Link
                      href={`/posteingang?q=${encodeURIComponent(fromEmail)}&status=`}
                      className="text-brand-700 hover:underline"
                    >
                      {contact.otherTicketCount} anzeigen
                    </Link>
                  </dd>
                </div>
              )}
              {contact?.newsletter && (
                <div className="flex justify-between gap-2">
                  <dt>Newsletter</dt>
                  <dd className="text-slate-700">{contact.newsletter.status.toLowerCase()}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-1">Bearbeitung</h2>
            <form method="post" action={`/api/tickets/${ticket.id}/status`} className="space-y-2 mb-3">
              <label className="block text-xs text-slate-500">Status</label>
              <select name="status" defaultValue={ticket.status} className="input text-sm w-full">
                {Object.values(TicketStatus).map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABEL[st]}
                  </option>
                ))}
              </select>
              <label className="block text-xs text-slate-500">Priorität</label>
              <select name="priority" defaultValue={ticket.priority} className="input text-sm w-full">
                {Object.values(TicketPriority).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
              <button className="btn-secondary text-sm w-full">Speichern</button>
            </form>
            <form method="post" action={`/api/tickets/${ticket.id}/assign`} className="space-y-2">
              <label className="block text-xs text-slate-500">Zuständig</label>
              <select
                name="assigneeId"
                defaultValue={ticket.assigneeId ?? ""}
                className="input text-sm w-full"
              >
                <option value="">— niemand —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button className="btn-secondary text-sm w-full">Zuweisen</button>
            </form>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">
              Schulungen{" "}
              <span className="font-normal text-slate-400">
                ({contact?.registrations.length ?? 0})
              </span>
            </h2>

            {!contact || contact.registrations.length === 0 ? (
              <p className="text-xs text-slate-500">
                Zu dieser E-Mail-Adresse ist keine Anmeldung gespeichert.
              </p>
            ) : (
              <>
                {contact.upcoming.length > 0 && (
                  <>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mt-2 mb-1">
                      Kommend / laufend
                    </h3>
                    <ul>
                      {contact.upcoming.map((r) => (
                        <RegistrationCard key={r.participantId} r={r} />
                      ))}
                    </ul>
                  </>
                )}
                {contact.past.length > 0 && (
                  <>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mt-3 mb-1">
                      Vergangen
                    </h3>
                    <ul>
                      {contact.past.map((r) => (
                        <RegistrationCard key={r.participantId} r={r} />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-2">Interne Notiz</h2>
            <form method="post" action={`/api/tickets/${ticket.id}/note`} className="space-y-2">
              <textarea
                name="body"
                rows={3}
                required
                placeholder="Nur intern sichtbar …"
                className="input text-sm w-full"
              />
              <button className="btn-secondary text-sm w-full">Notiz speichern</button>
            </form>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
