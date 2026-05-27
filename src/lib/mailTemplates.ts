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

// Gemeinsame HTML-Huelle - professionelles, schlichtes Layout:
//   - schmaler Brand-Farbstreifen oben
//   - Logo zentriert auf weisser Karte
//   - Inhalt mit ordentlicher Typografie
//   - Footer mit Absender + Antwort-Adresse
//
// Konfigurierbar via Env:
//   MAIL_LOGO_URL       absolute URL zum Logo (PNG)
//   MAIL_BRAND_COLOR    Hex z.B. "#0f766e" (Default: tuerkis)
//   MAIL_FOOTER_LINE    optionale zusaetzliche Zeile (z.B. Impressum-Link)
function htmlShell(appName: string, inner: string): string {
  const logo = process.env.MAIL_LOGO_URL?.trim();
  const brand = (process.env.MAIL_BRAND_COLOR?.trim() || "#0f766e").replace(/[^0-9a-fA-F#]/g, "");
  const replyTo = process.env.MAIL_REPLY_TO?.trim();
  const footerExtra = process.env.MAIL_FOOTER_LINE?.trim();

  const logoBlock = logo
    ? `<div style="text-align:center;padding:28px 24px 8px 24px;">
         <img src="${escapeHtml(logo)}" alt="${escapeHtml(appName)}" style="max-height:64px;height:auto;width:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />
       </div>`
    : `<div style="text-align:center;padding:28px 24px 8px 24px;font-size:18px;font-weight:600;color:#111;">${escapeHtml(appName)}</div>`;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(appName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <tr><td style="height:4px;background:${escapeHtml(brand)};line-height:4px;font-size:0;">&nbsp;</td></tr>
      <tr><td>${logoBlock}</td></tr>
      <tr><td style="padding:8px 32px 24px 32px;font-size:15px;line-height:1.6;color:#1f2937;">${inner}</td></tr>
      <tr><td style="padding:18px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.6;">
        <div><strong style="color:#374151;">${escapeHtml(appName)}</strong></div>
        ${replyTo ? `<div>Antworten bitte an <a href="mailto:${escapeHtml(replyTo)}" style="color:${escapeHtml(brand)};text-decoration:none;">${escapeHtml(replyTo)}</a></div>` : ""}
        ${footerExtra ? `<div style="margin-top:6px;">${escapeHtml(footerExtra)}</div>` : ""}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function btn(label: string, href: string): string {
  const brand = (process.env.MAIL_BRAND_COLOR?.trim() || "#0f766e").replace(/[^0-9a-fA-F#]/g, "");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;"><tr><td style="border-radius:8px;background:${escapeHtml(brand)};">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
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

  const text = [
    `Hallo ${participantName},`,
    "",
    `vielen Dank für Ihre Anmeldung zu „${event.title}“. Wir bestätigen Ihnen hiermit den Eingang Ihrer Anmeldung.`,
    "",
    `Termin:   ${dateLine}`,
    timeLine ? `Zeit:     ${timeLine}` : "",
    `Buchung:  ${dayLine}`,
    `Ort:      ${locLine.replace(/^Veranstaltungsort:\s*/, "")}`,
    "",
    "Sie erhalten rechtzeitig vor der Veranstaltung weitere organisatorische Informationen.",
    "Bei Rückfragen oder einer notwendigen Stornierung wenden Sie sich bitte an unser Team unter info@fb-akademie.de.",
    "",
    "Beste Grüße aus Leipzig",
    "das Team der Flüssigboden Akademie",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const rowStyle = "padding:6px 0;color:#374151;vertical-align:top;";
  const labelStyle = "color:#6b7280;font-size:13px;padding-right:14px;white-space:nowrap;width:1%;";
  const valueStyle = "font-size:14px;color:#111827;";
  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#111827;font-weight:600;">Anmeldung bestätigt</h1>
<p style="margin:0 0 12px 0;">Hallo ${escapeHtml(participantName)},</p>
<p style="margin:0 0 16px 0;">vielen Dank für Ihre Anmeldung zu <strong>${escapeHtml(event.title)}</strong>. Wir bestätigen Ihnen hiermit den Eingang Ihrer Anmeldung.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;border-collapse:collapse;width:100%;">
  <tr><td style="${rowStyle}${labelStyle}">Termin</td><td style="${rowStyle}${valueStyle}"><strong>${escapeHtml(dateLine)}</strong></td></tr>
  ${timeLine ? `<tr><td style="${rowStyle}${labelStyle}">Zeit</td><td style="${rowStyle}${valueStyle}">${escapeHtml(timeLine)}</td></tr>` : ""}
  <tr><td style="${rowStyle}${labelStyle}">Buchung</td><td style="${rowStyle}${valueStyle}">${escapeHtml(dayLine)}</td></tr>
  <tr><td style="${rowStyle}${labelStyle}">Ort</td><td style="${rowStyle}${valueStyle}">${nl2br(locLine.replace(/^Veranstaltungsort:\s*/, ""))}</td></tr>
</table>
<p style="margin:0 0 12px 0;">Sie erhalten rechtzeitig vor der Veranstaltung weitere organisatorische Informationen.</p>
<p style="margin:0 0 16px 0;color:#374151;">Bei Rückfragen oder einer notwendigen Stornierung wenden Sie sich bitte an unser Team unter <a href="mailto:info@fb-akademie.de" style="color:#0f766e;text-decoration:none;">info@fb-akademie.de</a>.</p>
<p style="margin:0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  return { subject, text, html: htmlShell(appName, inner) };
}

export interface LoginCodeMailInput {
  recipientName: string;
  code: string;
  appName: string;
  expiresInMinutes: number;
  purpose: "login" | "enable";
}

export function loginCodeMail(input: LoginCodeMailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const { recipientName, code, appName, expiresInMinutes, purpose } = input;
  const isEnable = purpose === "enable";
  const subject = isEnable
    ? `Bestätigungscode für E-Mail-2FA – ${appName}`
    : `Ihr Login-Code: ${code}`;
  const intro = isEnable
    ? `Sie möchten die 2-Faktor-Authentifizierung per E-Mail aktivieren. Bitte geben Sie zur Bestätigung folgenden Code ein:`
    : `Bitte geben Sie zur Anmeldung folgenden Code ein:`;

  const text = [
    `Hallo ${recipientName},`,
    "",
    intro,
    "",
    `    ${code}`,
    "",
    `Der Code ist ${expiresInMinutes} Minuten gültig.`,
    "Falls Sie diese Anmeldung nicht ausgelöst haben, ignorieren Sie diese E-Mail.",
    "",
    "Beste Grüße aus Leipzig",
    "das Team der Flüssigboden Akademie",
  ].join("\n");

  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#111827;font-weight:600;">${isEnable ? "Bestätigungscode" : "Ihr Login-Code"}</h1>
<p style="margin:0 0 8px 0;">Hallo ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 16px 0;">${escapeHtml(intro)}</p>
<div style="margin:14px 0 18px 0;text-align:center;">
  <div style="display:inline-block;font-family:'SFMono-Regular',Menlo,Monaco,Consolas,'Liberation Mono',monospace;font-size:30px;font-weight:700;letter-spacing:10px;color:#111827;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:14px 22px;">
    ${escapeHtml(code)}
  </div>
</div>
<p style="margin:0 0 6px 0;color:#6b7280;font-size:12px;">Der Code ist <strong>${expiresInMinutes} Minuten</strong> gültig.</p>
<p style="margin:0 0 16px 0;color:#6b7280;font-size:12px;">Falls Sie diese Anmeldung nicht ausgelöst haben, ignorieren Sie diese E-Mail.</p>
<p style="margin:0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  return { subject, text, html: htmlShell(appName, inner) };
}

export interface InviteMailInput {
  recipientName: string;
  link: string;
  appName: string;
  expiresAt: Date;
  mode: "invite" | "reset";
}

export function inviteMail(input: InviteMailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const { recipientName, link, appName, expiresAt, mode } = input;
  const isInvite = mode === "invite";
  const subject = isInvite
    ? `Ihr Zugang zu ${appName}`
    : `Passwort zurücksetzen – ${appName}`;
  const heading = isInvite ? "Willkommen" : "Passwort zurücksetzen";
  const intro = isInvite
    ? `Sie wurden zur Mitnutzung von ${appName} eingeladen. Bitte legen Sie über den folgenden Link ein Passwort fest, um Ihren Zugang zu aktivieren.`
    : `Für Ihren Account in ${appName} wurde ein Passwort-Reset angefordert. Bitte vergeben Sie über den folgenden Link ein neues Passwort.`;
  const expires = expiresAt.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const text = [
    `Hallo ${recipientName},`,
    "",
    intro,
    "",
    link,
    "",
    `Der Link ist gültig bis ${expires}.`,
    "Falls Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren.",
    "",
    "Beste Grüße aus Leipzig",
    "das Team der Flüssigboden Akademie",
  ].join("\n");

  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#111827;font-weight:600;">${escapeHtml(heading)}</h1>
<p style="margin:0 0 12px 0;">Hallo ${escapeHtml(recipientName)},</p>
<p style="margin:0 0 8px 0;">${escapeHtml(intro)}</p>
${btn(isInvite ? "Passwort festlegen" : "Neues Passwort vergeben", link)}
<p style="margin:0 0 8px 0;color:#6b7280;font-size:12px;">Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br><span style="word-break:break-all;color:#374151;">${escapeHtml(link)}</span></p>
<p style="margin:14px 0 0 0;color:#6b7280;font-size:12px;">Der Link ist gültig bis <strong>${escapeHtml(expires)}</strong>.<br>Falls Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren.</p>
<p style="margin:18px 0 0 0;">Beste Grüße aus Leipzig<br>das Team der Flüssigboden Akademie</p>`;

  return { subject, text, html: htmlShell(appName, inner) };
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
  const appName = process.env.APP_NAME ?? "Teilnahmemanagement";
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

  const rowStyle = "padding:6px 0;vertical-align:top;";
  const labelStyle = "color:#6b7280;font-size:13px;padding-right:14px;white-space:nowrap;width:1%;";
  const valueStyle = "font-size:14px;color:#111827;";
  const inner = `
<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#111827;font-weight:600;">Neue Anmeldung eingegangen</h1>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px 0;border-collapse:collapse;width:100%;">
  <tr><td style="${rowStyle}${labelStyle}">Veranstaltung</td><td style="${rowStyle}${valueStyle}"><strong>${escapeHtml(event.title)}</strong></td></tr>
  <tr><td style="${rowStyle}${labelStyle}">Name</td><td style="${rowStyle}${valueStyle}">${escapeHtml(participantName)}</td></tr>
  <tr><td style="${rowStyle}${labelStyle}">E-Mail</td><td style="${rowStyle}${valueStyle}"><a href="mailto:${escapeHtml(participantEmail)}" style="color:#0f766e;text-decoration:none;">${escapeHtml(participantEmail)}</a></td></tr>
  ${company ? `<tr><td style="${rowStyle}${labelStyle}">Firma</td><td style="${rowStyle}${valueStyle}">${escapeHtml(company)}</td></tr>` : ""}
  <tr><td style="${rowStyle}${labelStyle}">Buchung</td><td style="${rowStyle}${valueStyle}">${escapeHtml(dayLine)}</td></tr>
</table>
${btn("Im System öffnen", link)}`;

  return { subject, text, html: htmlShell(appName, inner) };
}
