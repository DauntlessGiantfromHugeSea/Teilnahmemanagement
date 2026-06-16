// Schickt die vom Admin getippte Antwort als Mail an alle aktiven
// (nicht stornierten) Teilnehmer des Events mit gueltiger E-Mail-Adresse.
// Optional wird die urspruengliche Frage anonymisiert mitgeschickt.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function esc(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: { id: string; qid: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/questions?${new URLSearchParams(q).toString()}` },
  });

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const f = await req.formData();
  const answer = String(f.get("answer") ?? "").trim();
  const includeQuestion = f.get("includeQuestion") === "on";
  if (!answer) return back({ error: "Bitte einen Antworttext eingeben." });

  const q = await prisma.eventQuestion.findUnique({
    where: { id: params.qid },
    include: { event: { include: { participants: true } } },
  });
  if (!q || q.eventId !== params.id) return back({ error: "Frage nicht gefunden." });

  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const subject = `Antwort aus der Schulung „${q.event.title}"`;

  const quote = includeQuestion
    ? `<blockquote style="margin:0 0 14px 0;padding:10px 14px;border-left:3px solid #0f766e;background:#f0fdfa;border-radius:6px;font-size:13px;color:#0f172a;">${esc(q.text).replace(/\n/g, "<br>")}</blockquote>`
    : "";
  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Antwort aus der Schulung</h1>
<p style="margin:0 0 12px 0;">Hallo,</p>
<p style="margin:0 0 12px 0;">
  während Ihrer Schulung <strong>${esc(q.event.title)}</strong> wurde folgende Frage gestellt:
</p>
${quote}
<p style="margin:0 0 6px 0;font-weight:600;">Unsere Antwort:</p>
<p style="margin:0 0 12px 0;white-space:pre-wrap;">${esc(answer)}</p>
<p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">
  Bei weiteren Fragen melden Sie sich gerne unter
  <a href="mailto:info@fb-akademie.de" style="color:#0f766e;">info@fb-akademie.de</a>.
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  const text = [
    `Hallo,`,
    ``,
    `Antwort auf eine Frage aus Ihrer Schulung "${q.event.title}":`,
    ...(includeQuestion ? [``, `Frage:`, q.text, ``] : [``]),
    `Antwort:`,
    answer,
    ``,
    `Bei weiteren Fragen: info@fb-akademie.de`,
    ``,
    `Beste Grüße aus Leipzig`,
    `das Team der Flüssigboden Akademie`,
  ].join("\n");

  let sent = 0;
  let failed = 0;
  for (const p of q.event.participants) {
    if (p.status === "CANCELLED") continue;
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) { failed++; continue; }
    const res = await sendMail({
      to: email,
      subject,
      text,
      html: htmlShell(appName, inner),
    });
    if (res.ok) sent++; else failed++;
  }

  await prisma.eventQuestion.update({
    where: { id: q.id },
    data: { status: "ANSWERED", answeredAt: new Date() },
  });

  const detail = failed > 0 ? `, ${failed} fehlgeschlagen` : "";
  return back({ ok: `Antwort an ${sent} Teilnehmer versendet${detail}.` });
}
