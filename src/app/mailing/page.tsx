import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canSendBroadcast, listAccessibleEventIds } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { isMailingConfigured, mailSenderAddress } from "@/lib/mailer";
import { MAX_RECIPIENTS, MAX_RECIPIENTS_INDIVIDUAL } from "@/lib/broadcast";
import { safeDecrypt } from "@/lib/crypto";
import {
  BroadcastComposer,
  type BroadcastEventOption,
} from "@/components/BroadcastComposer";

export const dynamic = "force-dynamic";

/** Veranstaltungen, die zur Auswahl stehen: laufende, kommende und zuletzt gewesene. */
const LOOKBACK_DAYS = 60;
const EVENT_LIMIT = 60;
const HISTORY_LIMIT = 10;

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MailingPage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!canSendBroadcast(s)) redirect("/dashboard");

  const scope = await listAccessibleEventIds(s);
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000);

  const [events, history] = await Promise.all([
    prisma.event.findMany({
      where: {
        ...(scope === "ALL" ? {} : { id: { in: scope } }),
        OR: [{ day1Date: { gte: since } }, { day1Date: null }],
      },
      orderBy: [{ day1Date: "asc" }, { createdAt: "desc" }],
      take: EVENT_LIMIT,
      select: {
        id: true,
        title: true,
        day1Date: true,
        format: true,
        cancelled: true,
        _count: { select: { participants: true } },
      },
    }),
    prisma.broadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        subject: true,
        mode: true,
        recipientCount: true,
        sentCount: true,
        failedCount: true,
        createdAt: true,
        sender: { select: { name: true } },
      },
    }),
  ]);

  const options: BroadcastEventOption[] = events
    .filter((e) => e._count.participants > 0)
    .map((e) => ({
      id: e.id,
      title: e.cancelled ? `${e.title} (abgesagt)` : e.title,
      dateLabel: fmtDate(e.day1Date),
      format: e.format === "WEBINAR" ? "Webinar" : "Präsenz",
      recipientCount: e._count.participants,
    }));

  const configured = isMailingConfigured();

  return (
    <Shell session={s} active="mailing">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Rundmail</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Eine Nachricht an einen frei zusammengestellten Verteiler — etwa eine
            Terminänderung oder der Zugangslink zu einem Webinar. Das Aussehen kommt aus
            dem{" "}
            <Link href="/admin/mail-design" className="text-brand-700 hover:underline">
              Mail-Design
            </Link>
            .
          </p>
        </div>
      </div>

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

      {!configured && (
        <div className="toast-error mb-4">
          <span aria-hidden>!</span>
          <span>
            Es ist kein Mailversand eingerichtet. Unter{" "}
            <Link href="/admin/settings" className="underline">
              Einstellungen
            </Link>{" "}
            prüfen.
          </span>
        </div>
      )}

      <BroadcastComposer
        events={options}
        maxBcc={MAX_RECIPIENTS}
        maxIndividual={MAX_RECIPIENTS_INDIVIDUAL}
        senderAddress={mailSenderAddress() ?? ""}
        myAddress={s.email}
      />

      {history.length > 0 && (
        <section className="card p-5 mt-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Zuletzt verschickt</h2>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Betreff</th>
                  <th>Wann</th>
                  <th>Von</th>
                  <th>Weg</th>
                  <th className="text-right">Empfänger</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td className="max-w-xs truncate">{safeDecrypt(b.subject) ?? "—"}</td>
                    <td className="whitespace-nowrap text-slate-500">{fmtDateTime(b.createdAt)}</td>
                    <td className="text-slate-500">{b.sender.name}</td>
                    <td className="text-slate-500">{b.mode === "bcc" ? "BCC" : "einzeln"}</td>
                    <td className="text-right whitespace-nowrap">
                      {b.sentCount}
                      {b.failedCount > 0 && (
                        <span className="text-red-700"> · {b.failedCount} Fehler</span>
                      )}
                      {b.sentCount !== b.recipientCount && b.failedCount === 0 && (
                        <span className="text-slate-400"> / {b.recipientCount}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Shell>
  );
}
