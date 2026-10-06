// Einladungen zu einer Veranstaltung an selbst eingetragene Adressen.
//
// Bewusst ohne Speicherung: es wird nichts zu den Empfaengern angelegt und
// nichts nachverfolgt. Die Anmeldung laeuft anschliessend ueber die normale
// Anmeldeseite.

import type { Event } from "@prisma/client";
import { formatEventDates } from "./eventDates";
import { htmlShell } from "./mailTemplates";

const URL_RE = /\b(https?:\/\/[^\s<>"']+)/g;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Termin samt Uhrzeit als eine Zeile, z.B. "Dienstag, 16. Juni 2026, 09:00 – 16:30 Uhr". */
export function eventDateLine(
  ev: Pick<Event, "day1Date" | "day2Date" | "extraDays" | "startTime" | "endTime">,
): string {
  const dates = formatEventDates(ev, { long: true });
  if (dates === "-") return "";
  const time = ev.startTime && ev.endTime ? `${ev.startTime} – ${ev.endTime} Uhr` : "";
  return time ? `${dates}, ${time}` : dates;
}

/** Anmeldeseite dieser Veranstaltung - Vorbelegung fuer das Link-Feld. */
export function defaultInviteUrl(eventId: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/anmeldung/${eventId}`;
}

export interface InviteVars {
  [key: string]: string;
  firstName: string;
  lastName: string;
  eventTitle: string;
  eventDate: string;
  link: string;
}

/**
 * Setzt die Platzhalter ein. Fehlt ein Name, bliebe sonst "Hallo ," stehen -
 * deshalb werden Satzzeichen, die dadurch in der Luft haengen, eingesammelt.
 */
export function applyPlaceholders(template: string, vars: InviteVars): string {
  const filled = template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
  return filled
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")        // Luecke, wo der Name fehlte
        .replace(/[ \t]+([,.;:!?])/g, "$1") // "Hallo ," -> "Hallo,"
        .replace(/[ \t]+$/, ""),
    )
    .join("\n");
}

function btn(label: string, href: string): string {
  const brand = (process.env.MAIL_BRAND_COLOR?.trim() || "#0f766e").replace(/[^0-9a-fA-F#]/g, "");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;"><tr><td style="border-radius:8px;background:${esc(brand)};">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">${esc(label)}</a>
  </td></tr></table>`;
}

/**
 * Baut den HTML-Teil: Absaetze, verlinkte URLs und - sofern der Text den
 * Link nicht selbst enthaelt - eine Anmelde-Schaltflaeche am Ende.
 */
export function inviteHtml(plainBody: string, link: string): string {
  const paragraphs = esc(plainBody)
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 12px 0;">${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  // Die blanke URL im Fliesstext durch einen klickbaren Link ersetzen und
  // zusaetzlich einen Knopf anbieten - manche Mailprogramme zeigen lange
  // URLs sonst umgebrochen und unklickbar an.
  const linked = paragraphs.replace(URL_RE, (u) => `<a href="${u}" style="color:#0f766e;">${u}</a>`);
  return linked + btn("Jetzt zur Schulung anmelden", link);
}

export interface BuiltMail {
  subject: string;
  text: string;
  html: string;
}

export function buildInviteMail(args: {
  subject: string;
  body: string;
  vars: InviteVars;
  appName: string;
}): BuiltMail {
  const subject = applyPlaceholders(args.subject, args.vars);
  let text = applyPlaceholders(args.body, args.vars);

  // Wer den Platzhalter nicht benutzt, soll den Link trotzdem im reinen
  // Textteil finden - sonst fehlt er Empfaengern ohne HTML-Ansicht.
  if (!text.includes(args.vars.link)) {
    text = `${text}\n\nZur Anmeldung: ${args.vars.link}`;
  }

  return {
    subject,
    text,
    html: htmlShell(args.appName, inviteHtml(text, args.vars.link)),
  };
}
