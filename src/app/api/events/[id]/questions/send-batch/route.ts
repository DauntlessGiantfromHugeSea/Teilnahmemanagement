// Sammelversand: schickt EINE Mail an alle aktiven Teilnehmer mit den
// vom Admin ausgewaehlten Fragen + Antworten. Speichert die Antworten in
// EventQuestion.answer und markiert die Fragen als ANSWERED.

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

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/questions?${new URLSearchParams(q).toString()}` },
  });

  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const f = await req.formData();
  const qids = f.getAll("qid").map((v) => String(v));
  const includeNames = f.get("includeNames") === "on";
  const mode = String(f.get("mode") ?? "send"); // "send" | "save" | "test"

  if (qids.length === 0) return back({ error: "Bitte mindestens eine Frage auswählen." });

  // Antworten je Frage einlesen + zugleich persistieren
  const event = await prisma.event.findUnique({
    where: { id: params.id },
    include: { participants: true },
  });
  if (!event) return back({ error: "Veranstaltung nicht gefunden." });

  const questions = await prisma.eventQuestion.findMany({
    where: { id: { in: qids }, eventId: params.id },
    orderBy: { createdAt: "asc" },
  });
  if (questions.length === 0) return back({ error: "Keine passenden Fragen gefunden." });

  const items: { id: string; text: string; name: string | null; answer: string }[] = [];
  for (const q of questions) {
    const answer = String(f.get(`answer-${q.id}`) ?? "").trim();
    await prisma.eventQuestion.update({
      where: { id: q.id },
      data: { answer: answer || null },
    });
    if (!answer) continue; // ohne Antwort nicht in Mail
    items.push({ id: q.id, text: q.text, name: q.name, answer });
  }

  if (mode === "save") {
    return back({ ok: `${questions.length} Antworten gespeichert.` });
  }

  if (items.length === 0) {
    return back({ error: "Keine der ausgewählten Fragen hat einen Antworttext." });
  }

  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const subject = `Antworten aus der Schulung „${event.title}"`;

  const blocks = items.map((it, i) => `
    <div style="margin:0 0 18px 0;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin-bottom:6px;">
        Frage ${i + 1}${includeNames && it.name ? ` · ${esc(it.name)}` : ""}
      </div>
      <div style="font-size:14px;color:#0f172a;margin:0 0 10px 0;white-space:pre-wrap;">${esc(it.text)}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#0f766e;margin-bottom:4px;font-weight:600;">Antwort</div>
      <div style="font-size:14px;color:#111827;white-space:pre-wrap;">${esc(it.answer)}</div>
    </div>`).join("");

  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Antworten aus der Schulung</h1>
<p style="margin:0 0 12px 0;">Hallo,</p>
<p style="margin:0 0 18px 0;">
  während Ihrer Schulung <strong>${esc(event.title)}</strong> wurden folgende Fragen gestellt.
  Hier finden Sie eine Übersicht mit unseren Antworten:
</p>
${blocks}
<p style="margin:18px 0 12px 0;color:#6b7280;font-size:13px;">
  Bei weiteren Fragen melden Sie sich gerne unter
  <a href="mailto:info@fb-akademie.de" style="color:#0f766e;">info@fb-akademie.de</a>.
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  const textParts = [
    `Hallo,`,
    ``,
    `Antworten zu den Fragen aus der Schulung "${event.title}":`,
    ``,
    ...items.flatMap((it, i) => [
      `--- Frage ${i + 1}${includeNames && it.name ? ` (${it.name})` : ""} ---`,
      it.text,
      ``,
      `Antwort:`,
      it.answer,
      ``,
    ]),
    `Bei weiteren Fragen: info@fb-akademie.de`,
    ``,
    `Beste Grüße aus Leipzig`,
    `das Team der Flüssigboden Akademie`,
  ];
  const text = textParts.join("\n");

  // Test-Modus: nur an Admin
  if (mode === "test") {
    const res = await sendMail({
      to: s.email,
      subject: `[TEST] ${subject}`,
      text: `[TEST-MAIL — geht nur an dich]\n\n${text}`,
      html: `<div style="margin:0 0 12px 0;padding:8px 12px;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;font-size:12px;color:#92400e;"><strong>TEST-MAIL</strong> — wird nur an dich (${esc(s.email)}) versendet.</div>${htmlShell(appName, inner)}`,
    });
    if (!res.ok) return back({ error: `Test-Versand fehlgeschlagen: ${res.error ?? "?"}` });
    return back({ ok: `Test-Sammelmail mit ${items.length} Fragen an ${s.email} versendet.` });
  }

  let sent = 0;
  let failed = 0;
  for (const p of event.participants) {
    if (p.status === "CANCELLED") continue;
    const dec = decryptParticipant(p);
    const email = (dec.email ?? "").trim();
    if (!email || !EMAIL_RE.test(email)) { failed++; continue; }
    const res = await sendMail({ to: email, subject, text, html: htmlShell(appName, inner) });
    if (res.ok) sent++; else failed++;
  }

  // Beantwortete Fragen markieren
  await prisma.eventQuestion.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { status: "ANSWERED", answeredAt: new Date() },
  });

  const detail = failed > 0 ? `, ${failed} fehlgeschlagen` : "";
  return back({ ok: `Sammelmail mit ${items.length} Fragen an ${sent} Teilnehmer versendet${detail}.` });
}
