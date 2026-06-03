import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canWriteEvent } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { decryptParticipant } from "@/lib/participants";
import { parseCertificateData } from "@/lib/certificates";
import { renderCertificatePdf } from "@/lib/certificatePdf";
import { sendMail, isMailingConfigured } from "@/lib/mailer";
import { htmlShell } from "@/lib/mailTemplates";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return new NextResponse("Forbidden", { status: 403 });
  if (!(await canWriteEvent(s, params.id))) return new NextResponse("Forbidden", { status: 403 });

  const back = (q: Record<string, string>) => {
    const qs = new URLSearchParams(q).toString();
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/events/${params.id}/certificates?${qs}` },
    });
  };

  if (!isMailingConfigured()) return back({ error: "Mailversand nicht konfiguriert." });

  const certs = await prisma.certificate.findMany({
    where: {
      status: "RELEASED",
      sentAt: null,
      participant: { eventId: params.id },
    },
    include: { participant: true },
  });

  if (certs.length === 0) return back({ ok: "Nichts zu versenden." });

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let sent = 0;
  let failed = 0;
  const invalid: string[] = [];
  for (const cert of certs) {
    if (!cert.participant) { failed++; continue; }
    const dec = decryptParticipant(cert.participant);
    const rawEmail = (dec.email ?? "").trim();
    const email = rawEmail;
    if (!email || !EMAIL_RE.test(email)) {
      failed++;
      invalid.push(`${dec.firstName ?? ""} ${dec.lastName ?? ""} (${cert.number})`.trim());
      console.warn(`[cert send-batch] Ungültige E-Mail bei ${cert.number}: ${JSON.stringify(rawEmail)}`);
      continue;
    }

    try {
    const validateUrl = `${appUrl}/zertifikat/${cert.slug}`;
    const data = parseCertificateData(cert.data);
    const pdf = await renderCertificatePdf({
      type: cert.type, number: cert.number, data, validateUrl,
    });
    const isZ = cert.type === "ZERTIFIKAT";
    const subject = isZ
      ? `Ihr Zertifikat: ${data.eventTitle}`
      : `Ihre Teilnahmebescheinigung: ${data.eventTitle}`;
    const escape = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">
  ${isZ ? "Ihr Zertifikat" : "Ihre Teilnahmebescheinigung"}
</h1>
<p style="margin:0 0 12px 0;">Hallo ${escape(data.firstName)} ${escape(data.lastName)},</p>
<p style="margin:0 0 12px 0;">
  vielen Dank für Ihre Teilnahme an <strong>${escape(data.eventTitle)}</strong> am ${escape(data.eventDateShort)}.
  Im Anhang finden Sie Ihr persönliches Dokument.
</p>
<p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">
  Nummer: <span style="font-family:monospace;color:#111827;">${escape(cert.number)}</span><br>
  Validierung: <a href="${escape(validateUrl)}" style="color:#0f766e;">${escape(validateUrl)}</a>
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;
    const text = `Hallo ${data.firstName} ${data.lastName},\n\nim Anhang finden Sie Ihr ${isZ ? "Zertifikat" : "Ihre Teilnahmebescheinigung"} zur Schulung "${data.eventTitle}" vom ${data.eventDateShort}.\n\nNummer: ${cert.number}\nValidierung: ${validateUrl}\n\nBeste Grüße aus Leipzig\ndas Team der Flüssigboden Akademie`;
    const safeName = cert.number.replace(/[\\/?*\[\]:]/g, "-");

    const res = await sendMail({
      to: email, subject, text, html: htmlShell(appName, inner),
      attachments: [{ filename: `${safeName}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    if (res.ok) {
      sent++;
      await prisma.certificate.update({
        where: { id: cert.id },
        data: { sentAt: new Date(), sentTo: email },
      });
    } else {
      failed++;
    }
    } catch (e: any) {
      console.error(`[cert send-batch] Fehler bei ${cert.number}:`, e);
      failed++;
    }
  }

  if (failed > 0) {
    const detail = invalid.length > 0 ? ` Ungültige Adressen: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? " …" : ""}` : "";
    return back({ ok: `${sent} versendet, ${failed} fehlgeschlagen.${detail}` });
  }
  return back({ ok: `${sent} Mails versendet.` });
}
