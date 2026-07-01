// Erzeugt fuer jeden Teilnehmer (sofern noch nicht vorhanden) einen
// Feedback-Invite mit Token und schickt einen Mail-Link. Bereits versendete
// Invites werden uebersprungen.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";
import { shortEventId } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  // Optional: nur Teilnehmer mit dayOption = DAY_1 (oder DAY_2) anschreiben.
  // Default = alle.
  const f = await req.formData().catch(() => null);
  const dayFilter = String(f?.get("day") ?? new URL(req.url).searchParams.get("day") ?? "").trim();

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/feedback?${new URLSearchParams(q).toString()}` },
  });

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event) return back({ error: "Veranstaltung nicht gefunden." });

  const participants = await prisma.participant.findMany({
    where: {
      eventId: params.id,
      ...(dayFilter === "1" ? { dayOption: "DAY_1" as const } : {}),
      ...(dayFilter === "2" ? { dayOption: "DAY_2" as const } : {}),
    },
    include: { feedbackInvites: true },
  });

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const shortId = shortEventId(event.id, event.externalId);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let sent = 0;
  let skipped = 0;
  const invalid: string[] = [];
  for (const p of participants) {
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) {
      invalid.push(`${dec.firstName} ${dec.lastName}`.trim());
      continue;
    }

    let invite = p.feedbackInvites[0];
    if (invite?.sentAt) { skipped++; continue; }
    if (!invite) {
      const token = crypto.randomBytes(18).toString("base64url");
      invite = await prisma.feedbackInvite.create({
        data: { token, eventId: event.id, participantId: p.id },
      });
    }

    const link = `${appUrl}/feedback/${invite.token}`;
    const escape = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Ihr Feedback ist uns wichtig</h1>
<p style="margin:0 0 12px 0;">Hallo ${escape(dec.firstName ?? "")} ${escape(dec.lastName ?? "")},</p>
<p style="margin:0 0 12px 0;">
  vielen Dank für Ihre Teilnahme an <strong>${escape(event.title)}</strong>.
  Bitte nehmen Sie sich zwei Minuten Zeit für ein kurzes, anonymes Feedback —
  Ihre Rückmeldung hilft uns, die Schulungen weiter zu verbessern.
</p>
<p style="margin:0 0 18px 0;">
  <a href="${escape(link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Feedback abgeben</a>
</p>
<p style="margin:0 0 8px 0;color:#6b7280;font-size:13px;">
  Schulungs-ID: <span style="font-family:monospace;color:#111827;">${escape(shortId)}</span><br>
  Falls der Button nicht funktioniert: <a href="${escape(link)}" style="color:#0f766e;">${escape(link)}</a>
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;
    const text = [
      `Hallo ${dec.firstName ?? ""} ${dec.lastName ?? ""},`,
      ``,
      `bitte geben Sie uns kurz Feedback zur Schulung "${event.title}":`,
      link,
      ``,
      `Schulungs-ID: ${shortId}`,
      ``,
      `Beste Grüße aus Leipzig`,
      `das Team der Flüssigboden Akademie`,
    ].join("\n");

    const res = await sendMail({
      to: email,
      subject: `Ihr Feedback zur Schulung: ${event.title}`,
      text,
      html: htmlShell(appName, inner),
    });
    if (res.ok) {
      await prisma.feedbackInvite.update({
        where: { id: invite.id },
        data: { sentAt: new Date() },
      });
      sent++;
    } else {
      invalid.push(`${dec.firstName} ${dec.lastName} (Mailfehler)`);
    }
  }

  const detail = invalid.length > 0 ? ` Fehler bei: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? " …" : ""}` : "";
  const scope = dayFilter === "1" ? " (nur Tag-1-Teilnehmer)"
              : dayFilter === "2" ? " (nur Tag-2-Teilnehmer)"
              : "";
  return back({ ok: `${sent} Feedback-Links versendet${scope}, ${skipped} bereits zuvor verschickt.${detail}` });
}
