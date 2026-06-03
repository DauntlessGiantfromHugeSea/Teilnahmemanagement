// Versendet eine Mail an einen Teilnehmer mit Link aufs Zertifikats-Portal.
// Keine PDF-Anhaenge - der Teilnehmer loggt sich per OTP ein und laedt sich
// dort jedes Zertifikat selbst herunter.

import { sendMail } from "./mailer";
import { htmlShell } from "./mailTemplates";

export async function sendPortalInvite(args: {
  email: string;
  firstName: string;
  lastName: string;
  eventTitle: string;
  certCount: number;
}): Promise<{ ok: boolean; error?: string }> {
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const portal = `${appUrl}/meine-zertifikate`;
  const escape = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const n = args.certCount;
  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Ihre ${n === 1 ? "Bescheinigung ist" : "Bescheinigungen sind"} bereit</h1>
<p style="margin:0 0 12px 0;">Hallo ${escape(args.firstName)} ${escape(args.lastName)},</p>
<p style="margin:0 0 12px 0;">
  vielen Dank für Ihre Teilnahme an <strong>${escape(args.eventTitle)}</strong>.
  ${n === 1 ? "Ihre Bescheinigung steht" : `Ihre ${n} Bescheinigungen stehen`} im Zertifikats-Portal zum Download bereit.
</p>
<p style="margin:0 0 12px 0;">
  <strong>So funktioniert's:</strong><br>
  1. Öffnen Sie das Portal: <a href="${escape(portal)}" style="color:#0f766e;">${escape(portal)}</a><br>
  2. Geben Sie Ihre E-Mail-Adresse ein, mit der Sie sich angemeldet haben<br>
  3. Wir senden Ihnen einen 6-stelligen Code per Mail<br>
  4. Code eingeben — fertig. Sie sehen alle Bescheinigungen und können sie als PDF herunterladen.
</p>
<p style="margin:18px 0;">
  <a href="${escape(portal)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Zum Zertifikats-Portal</a>
</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;
  const text = [
    `Hallo ${args.firstName} ${args.lastName},`,
    ``,
    `Ihre ${n === 1 ? "Bescheinigung steht" : `${n} Bescheinigungen stehen`} zur Schulung "${args.eventTitle}" im Portal bereit:`,
    portal,
    ``,
    `Bitte geben Sie dort Ihre angemeldete E-Mail-Adresse ein - Sie erhalten dann einen 6-stelligen Code zur Anmeldung.`,
    ``,
    `Beste Grüße aus Leipzig`,
    `das Team der Flüssigboden Akademie`,
  ].join("\n");

  return sendMail({
    to: args.email,
    subject: n === 1
      ? `Ihre Bescheinigung: ${args.eventTitle}`
      : `Ihre ${n} Bescheinigungen: ${args.eventTitle}`,
    text,
    html: htmlShell(appName, inner),
  });
}
