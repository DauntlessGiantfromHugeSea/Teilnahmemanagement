import type { DayOption, Event } from "@prisma/client";

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(s: string): string {
  return escapeHtml(s).replace(/\n/g, "<br>");
}

function dayLabel(opt: DayOption, ev: Pick<Event, "day1Date" | "day2Date">): string {
  if (opt === "BOTH") return "Beide Tage";
  if (opt === "DAY_2") return ev.day2Date ? `2. Tag (${fmtDate(ev.day2Date)})` : "2. Tag";
  return ev.day1Date ? `1. Tag (${fmtDate(ev.day1Date)})` : "1. Tag";
}

export interface ConfirmationInput {
  event: Pick<Event, "title" | "day1Date" | "day2Date" | "location" | "meetingUrl" | "format" | "startTime" | "endTime">;
  participantName: string;
  participantEmail: string;
  dayOption: DayOption;
  appName: string;
  appUrl: string;
}

export function confirmationMail(input: ConfirmationInput): {
  subject: string;
  text: string;
  html: string;
} {
  const { event, participantName, dayOption, appName } = input;
  const subject = `Anmeldebestätigung: ${event.title}`;

  const dateLine =
    event.day1Date && event.day2Date
      ? `${fmtDate(event.day1Date)} – ${fmtDate(event.day2Date)}`
      : fmtDate(event.day1Date);

  const timeLine = event.startTime && event.endTime ? `${event.startTime} – ${event.endTime} Uhr` : "";

  const locLine =
    event.format === "WEBINAR"
      ? event.meetingUrl
        ? `Online-Webinar – Zugangslink folgt rechtzeitig per E-Mail.`
        : "Online-Webinar"
      : event.location
        ? `Veranstaltungsort: ${event.location}`
        : "Veranstaltungsort wird noch bekanntgegeben.";

  const dayLine = dayLabel(dayOption, event);

  const lines = [
    `Hallo ${participantName},`,
    "",
    `vielen Dank für Ihre Anmeldung zu „${event.title}“.`,
    "",
    `Termin: ${dateLine}`,
    timeLine ? `Zeit: ${timeLine}` : "",
    `Buchung: ${dayLine}`,
    locLine,
    "",
    "Wir melden uns mit weiteren Informationen rechtzeitig vor der Veranstaltung.",
    "Sollten Sie nicht teilnehmen können, antworten Sie bitte direkt auf diese E-Mail.",
    "",
    "Herzliche Grüße",
    appName,
  ].filter((l) => l !== "");
  const text = lines.join("\n");

  const html = `<!doctype html>
<html lang="de"><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.55;">
<p>Hallo ${escapeHtml(participantName)},</p>
<p>vielen Dank für Ihre Anmeldung zu <strong>${escapeHtml(event.title)}</strong>.</p>
<table cellpadding="4" style="border-collapse:collapse;margin:12px 0;">
  <tr><td style="color:#555;">Termin:</td><td><strong>${escapeHtml(dateLine)}</strong></td></tr>
  ${timeLine ? `<tr><td style="color:#555;">Zeit:</td><td>${escapeHtml(timeLine)}</td></tr>` : ""}
  <tr><td style="color:#555;">Buchung:</td><td>${escapeHtml(dayLine)}</td></tr>
  <tr><td style="color:#555;">Ort:</td><td>${nl2br(locLine)}</td></tr>
</table>
<p>Wir melden uns mit weiteren Informationen rechtzeitig vor der Veranstaltung.<br>
Sollten Sie nicht teilnehmen können, antworten Sie bitte direkt auf diese E-Mail.</p>
<p>Herzliche Grüße<br>${escapeHtml(appName)}</p>
</body></html>`;

  return { subject, text, html };
}

export interface AdminNotifyInput {
  event: Pick<Event, "title" | "day1Date" | "day2Date">;
  participantName: string;
  participantEmail: string;
  company: string;
  dayOption: DayOption;
  appUrl: string;
  participantId: string;
  eventId: string;
}

export function adminNotificationMail(input: AdminNotifyInput): {
  subject: string;
  text: string;
  html: string;
} {
  const { event, participantName, participantEmail, company, dayOption, appUrl } = input;
  const subject = `Neue Anmeldung: ${participantName} – ${event.title}`;
  const link = `${appUrl.replace(/\/$/, "")}/events/${input.eventId}/participants/${input.participantId}`;
  const dayLine = dayLabel(dayOption, event);

  const text = [
    `Neue Anmeldung eingegangen:`,
    ``,
    `Veranstaltung: ${event.title}`,
    `Name:          ${participantName}`,
    `E-Mail:        ${participantEmail}`,
    company ? `Firma:         ${company}` : "",
    `Buchung:       ${dayLine}`,
    ``,
    `Im System öffnen: ${link}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const html = `<!doctype html>
<html lang="de"><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">
<p><strong>Neue Anmeldung eingegangen</strong></p>
<table cellpadding="4" style="border-collapse:collapse;">
  <tr><td style="color:#555;">Veranstaltung:</td><td><strong>${escapeHtml(event.title)}</strong></td></tr>
  <tr><td style="color:#555;">Name:</td><td>${escapeHtml(participantName)}</td></tr>
  <tr><td style="color:#555;">E-Mail:</td><td>${escapeHtml(participantEmail)}</td></tr>
  ${company ? `<tr><td style="color:#555;">Firma:</td><td>${escapeHtml(company)}</td></tr>` : ""}
  <tr><td style="color:#555;">Buchung:</td><td>${escapeHtml(dayLine)}</td></tr>
</table>
<p><a href="${escapeHtml(link)}">Im System öffnen</a></p>
</body></html>`;

  return { subject, text, html };
}
