// Cron-Endpoint: 24h-Erinnerungsmail.
//
// Wird typischerweise alle 15-60 Minuten extern aufgerufen (Docker-Cron oder
// HTTP-Watchdog). Authentifizierung per Bearer-Token aus env CRON_TOKEN.
//
// Logik:
//   - Finde alle Events, deren day1Date in (jetzt + 18h ... jetzt + 30h)
//     liegt UND deren reminder24hSentAt noch null ist.
//   - Verschicke an alle nicht-stornierten Teilnehmer eine Reminder-Mail.
//   - Setze reminder24hSentAt = jetzt, damit es nicht erneut laeuft.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { isMailingConfigured } from "@/lib/mailer";
import { sendReminderMail } from "@/lib/reminderMail";

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
  const auth = req.headers.get("authorization") ?? "";
  const qToken = new URL(req.url).searchParams.get("token") ?? "";
  if (auth !== `Bearer ${token}` && qToken !== token) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isMailingConfigured()) return NextResponse.json({ error: "SMTP nicht konfiguriert" }, { status: 503 });

  const now = new Date();
  const from = new Date(now.getTime() + 18 * 3600_000);
  const to = new Date(now.getTime() + 30 * 3600_000);

  const events = await prisma.event.findMany({
    where: {
      cancelled: false,
      reminder24hSentAt: null,
      day1Date: { gte: from, lte: to },
    },
    include: { participants: true },
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

  return NextResponse.json({ ok: true, eventsHandled, mailsSent, mailsFailed, errors });
}
