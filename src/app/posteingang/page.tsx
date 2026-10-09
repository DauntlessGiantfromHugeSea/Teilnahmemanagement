import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma, TicketStatus } from "@prisma/client";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canUseTickets } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { blindIndex } from "@/lib/crypto";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  TICKET_LIST_INCLUDE,
  decryptTicket,
} from "@/lib/tickets";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function fmt(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function PosteingangPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    mailbox?: string;
    assignee?: string;
    q?: string;
    page?: string;
    ok?: string;
    error?: string;
  };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canUseTickets(s)) redirect("/dashboard");

  const page = Math.max(1, Number(searchParams.page ?? 1) || 1);
  const where: Prisma.TicketWhereInput = {};

  if (searchParams.status && searchParams.status in TicketStatus) {
    where.status = searchParams.status as TicketStatus;
  } else if (!searchParams.status) {
    // Standardansicht: alles ausser Erledigtem.
    where.status = { not: TicketStatus.CLOSED };
  }
  if (searchParams.mailbox) where.mailboxId = searchParams.mailbox;
  if (searchParams.assignee === "me") where.assigneeId = s.uid;
  else if (searchParams.assignee === "none") where.assigneeId = null;

  // Suche: Referenz direkt, E-Mail ueber den Blind-Index. Betreffe sind
  // verschluesselt und deshalb nicht serverseitig durchsuchbar.
  const q = (searchParams.q ?? "").trim();
  if (q) {
    const or: Prisma.TicketWhereInput[] = [
      { reference: { contains: q.toUpperCase() } },
    ];
    if (q.includes("@")) or.push({ fromEmailHash: blindIndex(q) });
    where.OR = or;
  }

  const [tickets, total, mailboxes, counts] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: TICKET_LIST_INCLUDE,
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.ticket.count({ where }),
    prisma.mailbox.findMany({ orderBy: { label: "asc" } }),
    prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const rows = tickets.map(decryptTicket);
  const countFor = (st: TicketStatus) =>
    counts.find((c) => c.status === st)?._count._all ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base = {
      status: searchParams.status,
      mailbox: searchParams.mailbox,
      assignee: searchParams.assignee,
      q: searchParams.q,
      ...patch,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/posteingang?${p.toString()}`;
  };

  const tab = (label: string, value: string | undefined, count?: number) => {
    const activeTab = (searchParams.status ?? "") === (value ?? "");
    return (
      <Link
        key={label}
        href={link({ status: value, page: undefined })}
        className={
          "px-3 py-1.5 rounded-full text-sm font-semibold transition whitespace-nowrap " +
          (activeTab ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")
        }
      >
        {label}
        {count !== undefined && count > 0 && (
          <span className={"ml-1.5 text-xs " + (activeTab ? "text-white/80" : "text-slate-500")}>
            {count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <Shell session={s} active="posteingang">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold">Posteingang</h1>
        {s.role === "ADMIN" && (
          <Link href="/admin/postfaecher" className="text-sm text-brand-700 hover:underline">
            Postfächer verwalten →
          </Link>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-5 max-w-3xl">
        Jede eingehende Kundenmail wird zu einem Ticket mit eigener Referenz. Antworten gehen
        direkt von hier raus — die Referenz steht in Betreff und Fußzeile, damit Rückantworten
        automatisch wieder im selben Vorgang landen.
      </p>

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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {tab("Offen", undefined)}
        {tab("Neu", "NEW", countFor(TicketStatus.NEW))}
        {tab("In Bearbeitung", "OPEN", countFor(TicketStatus.OPEN))}
        {tab("Wartet auf Kunde", "WAITING", countFor(TicketStatus.WAITING))}
        {tab("Erledigt", "CLOSED", countFor(TicketStatus.CLOSED))}
      </div>

      <form method="get" className="card p-3 mb-4 flex flex-wrap items-end gap-3">
        {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Suche (Referenz oder E-Mail)</label>
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="FBA-… oder kunde@firma.de"
            className="input text-sm w-64"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Postfach</label>
          <select name="mailbox" defaultValue={searchParams.mailbox ?? ""} className="input text-sm">
            <option value="">alle</option>
            {mailboxes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} ({m.address})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Zuständig</label>
          <select name="assignee" defaultValue={searchParams.assignee ?? ""} className="input text-sm">
            <option value="">alle</option>
            <option value="me">ich</option>
            <option value="none">niemand</option>
          </select>
        </div>
        <button className="btn-secondary text-sm">Filtern</button>
        <Link href="/posteingang" className="text-xs text-slate-500 hover:underline">
          zurücksetzen
        </Link>
      </form>

      {mailboxes.length === 0 && (
        <div className="card p-5 mb-4 text-sm text-slate-600">
          Noch kein Postfach eingerichtet.{" "}
          {s.role === "ADMIN" ? (
            <Link href="/admin/postfaecher" className="text-brand-700 hover:underline">
              Jetzt Postfach anlegen
            </Link>
          ) : (
            "Ein Administrator muss zuerst ein Postfach anlegen."
          )}
          .
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Referenz</th>
              <th>Absender</th>
              <th>Betreff</th>
              <th>Postfach</th>
              <th>Zuständig</th>
              <th>Letzte Nachricht</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="text-sm hover:bg-slate-50">
                <td className="py-3 font-mono text-xs whitespace-nowrap">
                  <Link href={`/posteingang/${t.id}`} className="text-brand-700 hover:underline">
                    {t.reference}
                  </Link>
                </td>
                <td>
                  <Link href={`/posteingang/${t.id}`} className="block">
                    <div className="font-medium text-slate-800">{t.fromName ?? t.fromEmail}</div>
                    {t.fromName && <div className="text-xs text-slate-500">{t.fromEmail}</div>}
                  </Link>
                </td>
                <td className="max-w-md">
                  <Link href={`/posteingang/${t.id}`} className="block truncate">
                    {t.subject}
                    {t.messageCount > 1 && (
                      <span className="ml-1.5 text-xs text-slate-400">({t.messageCount})</span>
                    )}
                  </Link>
                </td>
                <td className="text-xs text-slate-500 whitespace-nowrap">
                  {t.mailbox ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: t.mailbox.color ?? "#94a3b8" }}
                      />
                      {t.mailbox.label}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-xs text-slate-500 whitespace-nowrap">
                  {t.assignee?.name ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="text-xs text-slate-500 whitespace-nowrap">{fmt(t.lastMessageAt)}</td>
                <td>
                  <span
                    className={
                      "inline-block px-2 py-0.5 rounded-full text-xs font-semibold " +
                      STATUS_CLASS[t.status]
                    }
                  >
                    {STATUS_LABEL[t.status]}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  Keine Tickets in dieser Ansicht.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-slate-500">
            Seite {page} von {pages} · {total} Tickets
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={link({ page: String(page - 1) })} className="btn-secondary text-sm">
                ← zurück
              </Link>
            )}
            {page < pages && (
              <Link href={link({ page: String(page + 1) })} className="btn-secondary text-sm">
                weiter →
              </Link>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
