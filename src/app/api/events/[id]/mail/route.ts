import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { sendMail } from "@/lib/mailer";
import {
  eventMailWrap,
  plainBodyToHtml,
  renderFollowup,
  type FollowupVars,
} from "@/lib/email-templates";
import { audit } from "@/lib/audit";
import { ParticipantStatus } from "@prisma/client";

const ALL_STATUSES: ParticipantStatus[] = [
  "REGISTERED",
  "CONFIRMED",
  "ATTENDED",
  "NO_SHOW",
];

function err(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function eventDateLabel(day1: Date | null, day2: Date | null): string {
  if (!day1) return "";
  const d1 = day1.toLocaleDateString("de-DE");
  return day2 ? `${d1} - ${day2.toLocaleDateString("de-DE")}` : d1;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const s = await getSession();
  if (!s) return err(401, "Nicht eingeloggt");
  if (!(await canWriteEvent(s, params.id))) return err(403, "Keine Schreibrechte");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err(400, "Ungültiger JSON-Body");
  }

  const action: "test" | "send" = body.action;
  const subject: string = (body.subject ?? "").toString().trim();
  const text: string = (body.body ?? "").toString();
  const statusFilter: ParticipantStatus[] = Array.isArray(body.statusFilter)
    ? body.statusFilter.filter((x: any) => ALL_STATUSES.includes(x))
    : ALL_STATUSES;

  if (!subject) return err(400, "Betreff fehlt");
  if (!text.trim()) return err(400, "Inhalt fehlt");
  if (action !== "test" && action !== "send") return err(400, "Ungültige Aktion");

  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: { training: true },
  });
  if (!event) return err(404, "Veranstaltung nicht gefunden");

  const eventTitle = event.title;
  const eventDate = eventDateLabel(event.day1Date, event.day2Date);

  if (action === "test") {
    const vars: FollowupVars = {
      firstName: s.name.split(/\s+/)[0] ?? "Test",
      lastName: s.name.split(/\s+/).slice(1).join(" "),
      eventTitle,
      eventDate,
    };
    const renderedSubject = renderFollowup(subject, vars);
    const renderedBody = renderFollowup(text, vars);
    const html = eventMailWrap(plainBodyToHtml(renderedBody));
    const res = await sendMail({
      to: s.email,
      subject: `[TEST] ${renderedSubject}`,
      text: renderedBody,
      html,
    });
    if (!res.ok && !res.skipped) {
      return err(502, res.error ?? "Test-Mail konnte nicht versendet werden");
    }
    if (res.skipped) {
      return NextResponse.json({
        ok: false,
        skipped: true,
        message: "SMTP nicht konfiguriert - Test-Mail wurde nur geloggt.",
      });
    }
    return NextResponse.json({
      ok: true,
      message: `Test-Mail an ${s.email} verschickt.`,
    });
  }

  // action === "send"
  const recipients = await prisma.participant.findMany({
    where: { eventId: params.id, status: { in: statusFilter } },
  });

  let sent = 0;
  let skipped = 0;
  const failures: { email: string; error: string }[] = [];

  for (const p of recipients) {
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (!email) {
      skipped++;
      continue;
    }
    const vars: FollowupVars = {
      firstName: dec.firstName ?? "",
      lastName: dec.lastName ?? "",
      eventTitle,
      eventDate,
    };
    const renderedSubject = renderFollowup(subject, vars);
    const renderedBody = renderFollowup(text, vars);
    const html = eventMailWrap(plainBodyToHtml(renderedBody));
    const res = await sendMail({
      to: email,
      subject: renderedSubject,
      text: renderedBody,
      html,
    });
    if (res.ok) sent++;
    else if (res.skipped) skipped++;
    else failures.push({ email, error: res.error ?? "unbekannt" });
  }

  await audit({
    actorId: s.uid,
    action: "EVENT_FOLLOWUP_MAIL",
    entityType: "Event",
    entityId: params.id,
    diff: {
      subject,
      statusFilter,
      total: recipients.length,
      sent,
      skipped,
      failed: failures.length,
    },
  });

  return NextResponse.json({
    ok: true,
    total: recipients.length,
    sent,
    skipped,
    failed: failures.length,
    failures,
  });
}
