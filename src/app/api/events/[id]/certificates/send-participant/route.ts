// Versendet alle freigegebenen Zertifikate EINES Teilnehmers in einer
// einzelnen Mail mit allen PDFs als Anhang. Skippt bereits versendete.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { parseCertificateData } from "@/lib/certificates";
import { renderCertificatePdf } from "@/lib/certificatePdf";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const f = await req.formData();
  const participantId = String(f.get("participantId") ?? "");

  const back = (q: Record<string, string>) => new NextResponse(null, {
    status: 303,
    headers: { Location: `/events/${params.id}/certificates?${new URLSearchParams(q).toString()}` },
  });

  if (!participantId) return back({ error: "Teilnehmer fehlt." });
  if (!isMailingConfigured()) return back({ error: "SMTP nicht konfiguriert." });

  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    include: {
      event: true,
      certificates: { where: { status: "RELEASED" } },
    },
  });
  if (!participant || participant.eventId !== params.id) {
    return back({ error: "Teilnehmer nicht gefunden." });
  }

  const dec = decryptParticipant(participant);
  const email = (dec.email ?? "").trim();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !EMAIL_RE.test(email)) {
    return back({ error: `Keine gültige E-Mail-Adresse für ${dec.firstName} ${dec.lastName}.` });
  }

  const todo = participant.certificates.filter((c) => !c.sentAt);
  if (todo.length === 0) {
    const total = participant.certificates.length;
    return back({
      ok: total === 0
        ? `Keine freigegebenen Zertifikate für ${dec.firstName} ${dec.lastName}.`
        : `Alle ${total} freigegebenen Zertifikate wurden bereits versendet.`,
    });
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";

  const attachments: { filename: string; content: Uint8Array; contentType: string }[] = [];
  const lines: { number: string; type: string; validate: string }[] = [];
  for (const c of todo) {
    try {
      const data = parseCertificateData(c.data);
      const validateUrl = `${appUrl}/zertifikat/${c.slug}`;
      const pdf = await renderCertificatePdf({
        type: c.type, number: c.number, data, validateUrl,
      });
      const safeName = c.number.replace(/[\\/?*\[\]:]/g, "-");
      attachments.push({ filename: `${safeName}.pdf`, content: pdf, contentType: "application/pdf" });
      lines.push({ number: c.number, type: c.type === "ZERTIFIKAT" ? "Zertifikat" : "Teilnahmebescheinigung", validate: validateUrl });
    } catch (e: any) {
      return back({ error: `Render-Fehler bei ${c.number}: ${e?.message ?? e}` });
    }
  }

  const escape = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = lines.map((l) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${escape(l.type)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${escape(l.number)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;"><a href="${escape(l.validate)}" style="color:#0f766e;">prüfen</a></td>
    </tr>`).join("");
  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Ihre Zertifikate</h1>
<p style="margin:0 0 12px 0;">Hallo ${escape(dec.firstName ?? "")} ${escape(dec.lastName ?? "")},</p>
<p style="margin:0 0 12px 0;">
  vielen Dank für Ihre Teilnahme an <strong>${escape(participant.event.title)}</strong>.
  Anbei finden Sie Ihre ${todo.length === 1 ? "Bescheinigung" : `${todo.length} Bescheinigungen`}
  als PDF-Anhang. Jede ist über die Validierungs-URL online überprüfbar.
</p>
<table style="border-collapse:collapse;font-size:13px;margin:8px 0 16px 0;">${rows}</table>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;
  const text = [
    `Hallo ${dec.firstName ?? ""} ${dec.lastName ?? ""},`,
    ``,
    `im Anhang finden Sie ${todo.length === 1 ? "Ihre Bescheinigung" : `Ihre ${todo.length} Bescheinigungen`} zur Schulung "${participant.event.title}":`,
    ...lines.map((l) => `  - ${l.type} ${l.number} (Validierung: ${l.validate})`),
    ``,
    `Beste Grüße aus Leipzig`,
    `das Team der Flüssigboden Akademie`,
  ].join("\n");

  const res = await sendMail({
    to: email,
    subject: todo.length === 1
      ? `Ihre Bescheinigung: ${participant.event.title}`
      : `Ihre ${todo.length} Bescheinigungen: ${participant.event.title}`,
    text,
    html: htmlShell(appName, inner),
    attachments,
  });
  if (!res.ok) {
    return back({ error: `Versand fehlgeschlagen: ${res.error ?? "unbekannt"}` });
  }

  await prisma.certificate.updateMany({
    where: { id: { in: todo.map((c) => c.id) } },
    data: { sentAt: new Date(), sentTo: email },
  });

  return back({ ok: `${todo.length} ${todo.length === 1 ? "Zertifikat" : "Zertifikate"} an ${email} versendet.` });
}
