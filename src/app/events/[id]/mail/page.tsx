import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/Shell";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { mailerConfigured } from "@/lib/mailer";
import { FOLLOWUP_TEMPLATES, eventLogoUrl, eventBrandColor } from "@/lib/email-templates";
import { EventMailComposer } from "@/components/EventMailComposer";

export const dynamic = "force-dynamic";

export default async function EventMailPage({
  params,
}: {
  params: { id: string };
}) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!(await canWriteEvent(s, params.id))) redirect(`/events/${params.id}`);

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: {
      training: true,
      participants: { select: { id: true, status: true } },
    },
  });
  if (!event) notFound();

  const counts: Record<string, number> = {
    REGISTERED: 0,
    CONFIRMED: 0,
    ATTENDED: 0,
    NO_SHOW: 0,
    CANCELLED: 0,
  };
  for (const p of event.participants) counts[p.status]++;

  const eventDateLabel = event.day1Date
    ? event.day2Date
      ? `${event.day1Date.toLocaleDateString("de-DE")} - ${event.day2Date.toLocaleDateString("de-DE")}`
      : event.day1Date.toLocaleDateString("de-DE")
    : "";

  return (
    <Shell session={s} active="events">
      <div className="mb-4">
        <Link
          href={`/events/${event.id}`}
          className="text-sm text-slate-500 hover:text-slate-800 hover:underline"
        >
          ← Zurück zur Veranstaltung
        </Link>
      </div>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-slate-500">
          Nachgang-Mail
        </div>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        {eventDateLabel && (
          <div className="text-sm text-slate-500">{eventDateLabel}</div>
        )}
      </div>

      {!mailerConfigured() && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          SMTP ist nicht konfiguriert (SMTP_* in der .env fehlt). Es können
          keine Mails versendet werden.
        </div>
      )}

      <EventMailComposer
        eventId={event.id}
        eventTitle={event.title}
        eventDate={eventDateLabel}
        counts={counts}
        templates={FOLLOWUP_TEMPLATES}
        logoUrl={eventLogoUrl()}
        brandColor={eventBrandColor()}
      />
    </Shell>
  );
}
