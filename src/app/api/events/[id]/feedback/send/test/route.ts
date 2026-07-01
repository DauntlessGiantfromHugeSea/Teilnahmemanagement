// Verschickt die Feedback-Einladung nur an den angemeldeten Admin (zum
// Layout-Pruefen). Es wird KEIN echter FeedbackInvite angelegt, sondern ein
// temporaerer Test-Link auf '/feedback/test-preview' verwendet, der nirgendwo
// in der DB existiert. So bleibt der echte Versand sauber.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canManageEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";
import { shortEventId } from "@/lib/feedback";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canManageEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/feedback?${new URLSearchParams(q).toString()}` },
  });

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const event = await prisma.event.findUnique({ where: { id: params.id } });
  if (!event) return back({ error: "Veranstaltung nicht gefunden." });

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const shortId = shortEventId(event.id, event.externalId);
  const link = `${appUrl}/feedback/test-preview`;

  const inner = `
<div style="margin:0 0 12px 0;padding:8px 12px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;font-size:12px;color:#92400e;">
  <strong>TEST-MAIL</strong> — wird nur an dich (${esc(s.email)}) versendet, der Link unten ist nicht klickbar.
</div>
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Ihr Feedback ist uns wichtig</h1>
<p style="margin:0 0 12px 0;">Hallo ${esc(s.name)},</p>
<p style="margin:0 0 12px 0;">
  vielen Dank für Ihre Teilnahme an <strong>${esc(event.title)}</strong>.
  Bitte nehmen Sie sich zwei Minuten Zeit für ein kurzes, anonymes Feedback —
  Ihre Rückmeldung hilft uns, die Schulungen weiter zu verbessern.
</p>
<p style="margin:0 0 18px 0;">
  <a href="${esc(link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Feedback abgeben</a>
</p>
<p style="margin:0 0 8px 0;color:#6b7280;font-size:13px;">
  Schulungs-ID: <span style="font-family:monospace;color:#111827;">${esc(shortId)}</span><br>
  Falls der Button nicht funktioniert: <a href="${esc(link)}" style="color:#0f766e;">${esc(link)}</a>
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  const text = [
    `[TEST-MAIL — geht nur an dich]`,
    ``,
    `Hallo ${s.name},`,
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
    to: s.email,
    subject: `[TEST] Ihr Feedback zur Schulung: ${event.title}`,
    text,
    html: htmlShell(appName, inner),
  });
  if (!res.ok) return back({ error: `Versand fehlgeschlagen: ${res.error ?? "?"}` });
  return back({ ok: `Test-Feedback-Mail an ${s.email} versendet.` });
}
