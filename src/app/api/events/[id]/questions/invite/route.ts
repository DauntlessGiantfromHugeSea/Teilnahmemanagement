// Schickt allen aktiven Teilnehmern den Link aufs Schulungs-Portal mit
// Hinweis auf das Fragen-Feld. Nicht zu verwechseln mit der Antwort-Mail
// pro Frage - hier geht es nur darum, die Eingabe-URL bekanntzumachen.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/questions?${new URLSearchParams(q).toString()}` },
  });

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const ev = await prisma.event.findUnique({
    where: { id: params.id },
    include: { participants: true },
  });
  if (!ev) return back({ error: "Veranstaltung nicht gefunden." });

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const link = `${appUrl}/portal/${ev.id}#fragen`;
  const portalLink = `${appUrl}/portal/${ev.id}`;

  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Frage stellen während der Schulung</h1>
<p style="margin:0 0 12px 0;">Hallo,</p>
<p style="margin:0 0 12px 0;">
  während der Schulung <strong>${esc(ev.title)}</strong> könnt ihr jederzeit Fragen
  einreichen. Im Schulungs-Portal findet ihr ganz unten ein Eingabefeld.
  Wir gehen im Verlauf der Schulung auf eure Fragen ein.
</p>
<p style="margin:18px 0;">
  <a href="${esc(link)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;">Frage stellen</a>
</p>
<p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">
  Falls der Button nicht funktioniert:<br>
  <a href="${esc(link)}" style="color:#0f766e;word-break:break-all;">${esc(link)}</a>
</p>
<p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">
  Das Schulungs-Portal mit Agenda und allen Infos:
  <a href="${esc(portalLink)}" style="color:#0f766e;">${esc(portalLink)}</a>
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  const text = [
    `Hallo,`,
    ``,
    `während der Schulung "${ev.title}" könnt ihr jederzeit Fragen einreichen.`,
    `Hier geht's zum Fragenfeld:`,
    link,
    ``,
    `Schulungs-Portal mit Agenda:`,
    portalLink,
    ``,
    `Beste Grüße aus Leipzig`,
    `das Team der Flüssigboden Akademie`,
  ].join("\n");

  let sent = 0;
  let failed = 0;
  for (const p of ev.participants) {
    if (p.status === "CANCELLED") continue;
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) { failed++; continue; }
    const res = await sendMail({
      to: email,
      subject: `Fragen zur Schulung „${ev.title}"`,
      text,
      html: htmlShell(appName, inner),
    });
    if (res.ok) sent++; else failed++;
  }

  const detail = failed > 0 ? `, ${failed} fehlgeschlagen` : "";
  return back({ ok: `Fragen-Link an ${sent} Teilnehmer versendet${detail}.` });
}
