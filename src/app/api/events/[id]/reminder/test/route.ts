// Schickt eine Test-Reminder-Mail an die E-Mail-Adresse des aktuellen Admins.
// Es wird KEIN reminder24hSentAt gesetzt, damit der echte Versand spaeter
// trotzdem rausgeht.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { sendReminderMail } from "@/lib/reminderMail";
import { isMailingConfigured } from "@/lib/mailer";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}?${new URLSearchParams(q).toString()}` },
  });

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const ev = await prisma.event.findUnique({ where: { id: params.id } });
  if (!ev) return back({ error: "Veranstaltung nicht gefunden." });

  const res = await sendReminderMail({
    email: s.email,
    firstName: s.name.split(" ")[0] ?? s.name,
    lastName: s.name.split(" ").slice(1).join(" "),
    eventTitle: ev.title,
    eventId: ev.id,
    day1Date: ev.day1Date,
    day2Date: ev.day2Date,
    startTime: ev.startTime,
    endTime: ev.endTime,
    location: ev.location,
  });
  if (!res.ok) return back({ error: `Versand fehlgeschlagen: ${res.error ?? "?"}` });
  return back({ ok: `Test-Erinnerung an ${s.email} versendet.` });
}
