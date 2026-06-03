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

  const cert = await prisma.certificate.findUnique({
    where: { id: params.id },
    include: { participant: true },
  });
  if (!cert) return new NextResponse("Not found", { status: 404 });
  if (!(await canWriteEvent(s, cert.participant.eventId))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const eventId = cert.participant.eventId;
  const back = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/events/${eventId}/certificates?${qs}` },
    });
  };

  if (cert.status !== "RELEASED") {
    return back({ error: "Nur freigegebene Zertifikate können versendet werden." });
  }
  if (!isMailingConfigured()) {
    return back({ error: "Mailversand ist nicht konfiguriert (SMTP fehlt)." });
  }
  const dec = decryptParticipant(cert.participant);
  const email = dec.email;
  if (!email) {
    return back({ error: "Teilnehmer hat keine E-Mail-Adresse." });
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const validateUrl = `${appUrl}/zertifikat/${cert.slug}`;
  const pdf = await renderCertificatePdf({
    type: cert.type,
    number: cert.number,
    data: parseCertificateData(cert.data),
    validateUrl,
  });

  const data = parseCertificateData(cert.data);
  const isZ = cert.type === "ZERTIFIKAT";
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const subject = isZ
    ? `Ihr Zertifikat: ${data.eventTitle}`
    : `Ihre Teilnahmebescheinigung: ${data.eventTitle}`;

  const escape = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#111827;font-weight:600;">
  ${isZ ? "Ihr Zertifikat" : "Ihre Teilnahmebescheinigung"}
</h1>
<p style="margin:0 0 12px 0;">Hallo ${escape(data.firstName)} ${escape(data.lastName)},</p>
<p style="margin:0 0 12px 0;">
  vielen Dank für Ihre Teilnahme an <strong>${escape(data.eventTitle)}</strong> am
  ${escape(data.eventDateShort)}. Im Anhang finden Sie Ihr persönliches
  ${isZ ? "Zertifikat" : "Teilnahmebescheinigung"}.
</p>
<p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">
  Nummer: <span style="font-family:monospace;color:#111827;">${escape(cert.number)}</span><br>
  Validierung: <a href="${escape(validateUrl)}" style="color:#0f766e;">${escape(validateUrl)}</a>
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  const html = htmlShell(appName, inner);
  const text = [
    `Hallo ${data.firstName} ${data.lastName},`,
    "",
    `im Anhang finden Sie Ihr ${isZ ? "Zertifikat" : "Ihre Teilnahmebescheinigung"} zur Schulung "${data.eventTitle}" vom ${data.eventDateShort}.`,
    "",
    `Nummer: ${cert.number}`,
    `Validierung: ${validateUrl}`,
    "",
    "Beste Grüße aus Leipzig",
    "das Team der Flüssigboden Akademie",
  ].join("\n");

  const safeName = cert.number.replace(/[\\/?*\[\]:]/g, "-");
  const res = await sendMail({
    to: email,
    subject,
    text,
    html,
    attachments: [
      {
        filename: `${safeName}.pdf`,
        content: pdf,
        contentType: "application/pdf",
      },
    ],
  });

  if (!res.ok) {
    return back({ error: `Versand fehlgeschlagen: ${res.error ?? "unbekannt"}` });
  }

  await prisma.certificate.update({
    where: { id: cert.id },
    data: { sentAt: new Date(), sentTo: email },
  });
  return back({ ok: `Versendet an ${email}.` });
}
