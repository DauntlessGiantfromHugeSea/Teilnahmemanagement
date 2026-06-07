// 24h-Erinnerungsmail mit Portal-Link.
//
// Wird automatisch vom Cron-Endpoint /api/cron/reminders aufgerufen und kann
// fuer Tests auch manuell pro Event ausgeloest werden.

import { sendMail } from "./mailer";
import { htmlShell } from "./mailTemplates";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDateLong(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export interface ReminderArgs {
  email: string;
  firstName: string;
  lastName: string;
  eventTitle: string;
  eventId: string;
  day1Date: Date | null;
  day2Date: Date | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
}

export async function sendReminderMail(args: ReminderArgs): Promise<{ ok: boolean; error?: string }> {
  const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const appName = process.env.APP_NAME ?? "Flüssigboden Akademie";
  const portal = `${appUrl}/portal/${args.eventId}`;
  const isTwoDay = !!(args.day1Date && args.day2Date);
  const dateLine = isTwoDay
    ? `${fmtDateLong(args.day1Date)} und ${fmtDateLong(args.day2Date)}`
    : fmtDateLong(args.day1Date);
  const timeLine = args.startTime && args.endTime ? `${args.startTime} – ${args.endTime} Uhr` : "";
  const locLine = args.location ?? "";

  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;color:#111827;font-weight:600;">Morgen geht's los!</h1>
<p style="margin:0 0 12px 0;">Hallo ${esc(args.firstName)} ${esc(args.lastName)},</p>
<p style="margin:0 0 12px 0;">
  nur eine kurze Erinnerung: morgen findet Ihre Schulung
  <strong>${esc(args.eventTitle)}</strong> statt. Wir freuen uns auf Sie!
</p>
<div style="margin:14px 0;padding:12px 14px;background:#f8fafc;border-left:3px solid #0f766e;border-radius:6px;font-size:13px;">
  <div><strong>Datum:</strong> ${esc(dateLine)}</div>
  ${timeLine ? `<div><strong>Uhrzeit:</strong> ${esc(timeLine)}</div>` : ""}
  ${locLine ? `<div><strong>Ort:</strong> ${esc(locLine)}</div>` : ""}
</div>
<p style="margin:0 0 12px 0;">
  Unter dem folgenden Link finden Sie das <strong>Schulungs-Portal</strong> mit
  der aktuellen Agenda, dem WLAN-Zugang und allen organisatorischen Hinweisen
  zur Veranstaltung. Sie können den Link gerne schon jetzt anschauen — wir
  aktualisieren ihn laufend.
</p>
<p style="margin:18px 0;">
  <a href="${esc(portal)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;">Zum Schulungs-Portal</a>
</p>
<p style="margin:0 0 12px 0;color:#6b7280;font-size:13px;">
  Falls der Button nicht funktioniert: <a href="${esc(portal)}" style="color:#0f766e;">${esc(portal)}</a>
</p>
<p style="margin:18px 0 12px 0;padding:10px 12px;background:#fef3c7;border-radius:6px;font-size:13px;color:#92400e;">
  <strong>Bei Fragen oder kurzfristigen Änderungen</strong> schreiben Sie uns
  <strong>unbedingt</strong> an
  <a href="mailto:info@fb-akademie.de" style="color:#92400e;text-decoration:underline;">info@fb-akademie.de</a>.
</p>
<p style="margin:18px 0 0 0;">Bis morgen — beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  const text = [
    `Hallo ${args.firstName} ${args.lastName},`,
    ``,
    `morgen findet Ihre Schulung "${args.eventTitle}" statt.`,
    ``,
    `Datum: ${dateLine}`,
    ...(timeLine ? [`Uhrzeit: ${timeLine}`] : []),
    ...(locLine ? [`Ort: ${locLine}`] : []),
    ``,
    `Schulungs-Portal mit Agenda und Infos:`,
    portal,
    ``,
    `Bei Fragen oder kurzfristigen Aenderungen schreiben Sie uns UNBEDINGT an info@fb-akademie.de.`,
    ``,
    `Bis morgen - beste Gruesse aus Leipzig`,
    `das Team der Fluessigboden Akademie`,
  ].join("\n");

  return sendMail({
    to: args.email,
    subject: `Erinnerung: morgen ${args.eventTitle}`,
    text,
    html: htmlShell(appName, inner),
  });
}
