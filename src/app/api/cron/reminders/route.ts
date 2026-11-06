// Cron-Endpoint: 24h-Erinnerungsmail.
//
// Wird typischerweise alle 15-60 Minuten extern aufgerufen (Docker-Cron oder
// HTTP-Watchdog). Authentifizierung ausschliesslich per Bearer-Token im
// Authorization-Header aus env CRON_TOKEN (nicht im Query-String).
//
// Logik:
//   - Kandidaten grob per SQL vorfiltern (day1Date in den naechsten Tagen,
//     reminder24hSentAt noch null).
//   - Fuer jeden Kandidaten den ECHTEN Startzeitpunkt bestimmen: Kalendertag
//     aus day1Date plus startTime als Ortszeit (APP_TIMEZONE). Nur dadurch
//     stimmt die Frist auch ueber die Sommer-/Winterzeit-Umstellung hinweg.
//   - Verschicken, sobald dieser Start weniger als REMINDER_LEAD_HOURS
//     entfernt, aber noch nicht erreicht ist.
//   - reminder24hSentAt setzen, damit es nicht erneut laeuft.
//
// Frueher wurde gegen day1Date selbst gefiltert - also gegen UTC-Mitternacht
// des Veranstaltungstags statt gegen den Beginn. Die "24h"-Mail ging dadurch
// je nach Jahreszeit 38 bis 39 Stunden vorher raus.

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { isMailingConfigured } from "@/lib/mailer";
import { sendReminderMail } from "@/lib/reminderMail";
import { APP_TIMEZONE, eventStartInstant, formatDateTimeLocal } from "@/lib/timezone";

// Vorlaufzeit der Erinnerung in Stunden. Ueber die .env anpassbar.
const LEAD_HOURS = Math.max(1, Number(process.env.REMINDER_LEAD_HOURS ?? 24) || 24);

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}

async function run(req: Request): Promise<NextResponse> {
  const token = process.env.CRON_TOKEN;
  if (!token) return NextResponse.json({ error: "CRON_TOKEN nicht konfiguriert" }, { status: 503 });
  // Nur der Authorization-Header. Ein Token im Query-String landet in
  // Zugriffsprotokollen, Proxy-Logs, der Browser-History und im Referer der
  // naechsten Anfrage - dort ist ein Dauergeheimnis nicht aufgehoben.
  const auth = req.headers.get("authorization") ?? "";
  if (!timingSafeStringEqual(auth, `Bearer ${token}`)) {
    return NextResponse.json(
      { error: "Forbidden", hinweis: 'Token im Header senden: Authorization: Bearer <CRON_TOKEN>' },
      { status: 403 }
    );
  }
  if (!isMailingConfigured()) return NextResponse.json({ error: "SMTP nicht konfiguriert" }, { status: 503 });

  const now = new Date();

  // Grobe Vorauswahl in SQL. Grosszuegig gewaehlt, weil der genaue Zeitpunkt
  // erst aus day1Date + startTime in Ortszeit entsteht und in SQL nicht
  // berechenbar ist; die Feinauswahl passiert gleich darunter.
  const coarseFrom = new Date(now.getTime() - 24 * 3600_000);
  const coarseTo = new Date(now.getTime() + (LEAD_HOURS + 48) * 3600_000);

  const candidates = await prisma.event.findMany({
    where: {
      cancelled: false,
      reminder24hSentAt: null,
      day1Date: { gte: coarseFrom, lte: coarseTo },
    },
    include: { participants: true },
  });

  // Feinauswahl: faellig, sobald der echte Beginn innerhalb der Vorlaufzeit
  // liegt. Bereits begonnene Veranstaltungen fallen heraus - fuer die waere
  // eine Erinnerung sinnlos.
  const events = candidates.filter((ev) => {
    if (!ev.day1Date) return false;
    const start = eventStartInstant(ev.day1Date, ev.startTime);
    const msUntilStart = start.getTime() - now.getTime();
    return msUntilStart > 0 && msUntilStart <= LEAD_HOURS * 3600_000;
  });

  let eventsHandled = 0;
  let mailsSent = 0;
  let mailsFailed = 0;
  const errors: string[] = [];

  for (const ev of events) {
    let anyMail = false;
    for (const p of ev.participants) {
      if (p.status === "CANCELLED") continue;
      const dec = decryptParticipant(p);
      const email = (dec.email ?? "").trim();
      if (!email || !EMAIL_RE.test(email)) continue;
      anyMail = true;
      const res = await sendReminderMail({
        email,
        firstName: dec.firstName ?? "",
        lastName: dec.lastName ?? "",
        eventTitle: ev.title,
        eventId: ev.id,
        day1Date: ev.day1Date,
        day2Date: ev.day2Date,
        startTime: ev.startTime,
        endTime: ev.endTime,
        location: ev.location,
      });
      if (res.ok) mailsSent++;
      else {
        mailsFailed++;
        if (errors.length < 10) errors.push(`${ev.title} → ${email}: ${res.error ?? "?"}`);
      }
    }
    if (anyMail) {
      await prisma.event.update({ where: { id: ev.id }, data: { reminder24hSentAt: new Date() } });
    }
    eventsHandled++;
  }

  return NextResponse.json({
    ok: true,
    timezone: APP_TIMEZONE,
    leadHours: LEAD_HOURS,
    candidates: candidates.length,
    due: events.length,
    dueEvents: events.map((ev) => ({
      id: ev.id,
      title: ev.title,
      start: ev.day1Date ? formatDateTimeLocal(eventStartInstant(ev.day1Date, ev.startTime)) : null,
    })),
    eventsHandled,
    mailsSent,
    mailsFailed,
    errors,
  });
}

/** Zeichenkettenvergleich in konstanter Zeit. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
