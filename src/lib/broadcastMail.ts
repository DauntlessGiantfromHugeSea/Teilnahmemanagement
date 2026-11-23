// Layout und Textsatz fuer Rundmails.
//
// Das Design kommt aus den Einstellungen unter /admin/mail-design
// (CompanySignature: Logo, Akzentfarbe, Fusszeile). Damit sieht eine
// Rundmail genauso aus wie eine Ticket-Antwort, und es gibt nur eine Stelle,
// an der das Aussehen gepflegt wird.
//
// Aufbau, von oben nach unten:
//   farbiges Kopfband mit Logo  ->  weisse Inhaltskarte  ->  Fusszeile
//
// Alles mit Tabellen und Inline-Styles: Mailclients (besonders Outlook)
// ignorieren <style>-Bloecke und moderne CSS-Eigenschaften.

import { escapeHtml } from "./email-templates";
import {
  DEFAULT_COMPANY_SIGNATURE,
  absoluteMailUrl,
  type CompanySignature,
} from "./mailSignature";

// --------------------------------------------------------------- Textsatz

/** Nur diese Schemata werden verlinkt - niemals javascript: oder data:. */
const SAFE_SCHEME = /^(https?:\/\/|mailto:)/i;

// Erkennt nackte URLs und E-Mail-Adressen im Fliesstext. Laeuft auf dem
// bereits HTML-escapten Text, deshalb kein "<" oder ">" in der Zeichenklasse.
const BARE_URL = /\b(https?:\/\/[^\s"']+[^\s"'.,;:)\]])/g;
const BARE_MAIL = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;

/** Satzzeichen am Ende einer URL gehoeren meist zum Satz, nicht zum Link. */
function anchor(href: string, label: string, accent: string): string {
  return (
    `<a href="${href}" style="color:${accent};text-decoration:underline;">` +
    `${label}</a>`
  );
}

interface Placeholder {
  token: string;
  html: string;
}

/**
 * Wandelt die im Editor eingegebene Auszeichnung in Mail-HTML.
 *
 * Bewusst klein gehalten - was hier nicht vorkommt, kann auch nicht kaputt
 * gehen:
 *
 *   # Überschrift          Zwischenüberschrift
 *   **fett**               fetter Text
 *   [Text](https://…)      benannter Link
 *   https://…              wird automatisch verlinkt
 *   - Punkt                Aufzählung
 *   Leerzeile              neuer Absatz
 *
 * Der Text wird ZUERST escapt; danach werden nur noch die eigenen Marken
 * ersetzt. Eingetippte spitze Klammern koennen so kein HTML erzeugen.
 */
export function markupToHtml(src: string, accentColor?: string): string {
  const accent = accentColor || DEFAULT_COMPANY_SIGNATURE.accentColor;
  let text = escapeHtml(src.replace(/\r\n/g, "\n"));

  // Fertige Links als Platzhalter herausnehmen, damit die Automatik unten
  // nicht innerhalb eines bereits gebauten <a> noch einmal verlinkt.
  const stash: Placeholder[] = [];
  const park = (html: string): string => {
    const token = `\u0000L${stash.length}\u0000`;
    stash.push({ token, html });
    return token;
  };

  // [Text](URL)
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
    if (!SAFE_SCHEME.test(href)) return whole;
    return park(anchor(href, label, accent));
  });

  // nackte URLs
  text = text.replace(BARE_URL, (url) => park(anchor(url, url, accent)));

  // nackte E-Mail-Adressen
  text = text.replace(BARE_MAIL, (mail) => park(anchor(`mailto:${mail}`, mail, accent)));

  // **fett**
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong style="color:#111827;">$1</strong>');

  // Bloecke bilden: Absaetze, Überschriften, Listen
  const blocks = text.split(/\n{2,}/);
  const html = blocks
    .map((raw) => {
      const block = raw.trim();
      if (!block) return "";

      const lines = block.split("\n");

      // Aufzählung: jede Zeile beginnt mit "- "
      if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
        const items = lines
          .map((l) => `<li style="margin:0 0 6px 0;">${l.trim().replace(/^[-*]\s+/, "")}</li>`)
          .join("");
        return `<ul style="margin:0 0 16px 0;padding-left:20px;">${items}</ul>`;
      }

      // Überschrift
      if (/^#\s+/.test(block)) {
        return (
          `<h2 style="margin:24px 0 10px 0;font-size:18px;line-height:1.35;` +
          `font-weight:600;color:#111827;">${block.replace(/^#\s+/, "")}</h2>`
        );
      }

      return (
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#374151;">` +
        `${lines.join("<br>")}</p>`
      );
    })
    .filter(Boolean)
    .join("\n");

  // Platzhalter zurueckschreiben
  return stash.reduce((acc, p) => acc.split(p.token).join(p.html), html);
}

/** Textfassung derselben Eingabe - fuer Clients ohne HTML und Spamfilter. */
export function markupToText(src: string): string {
  return src
    .replace(/\r\n/g, "\n")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1: $2")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^#\s+/gm, "")
    .trim();
}

// ----------------------------------------------------------------- Layout

export interface BroadcastLayout {
  company: CompanySignature;
  /** Inhalt als fertiges HTML (aus markupToHtml). */
  bodyHtml: string;
  /** Vorschautext in der Mailliste. Wird nicht sichtbar dargestellt. */
  preheader?: string;
  /** Optionale Schaltflaeche unter dem Text. */
  ctaLabel?: string;
  ctaUrl?: string;
  /** Kleiner Hinweis ueber der Fusszeile, z.B. warum jemand die Mail bekommt. */
  footerNote?: string;
}

function headerBlock(company: CompanySignature, accent: string): string {
  const logoHref = absoluteMailUrl(company.logoUrl);
  const width = company.logoWidth || DEFAULT_COMPANY_SIGNATURE.logoWidth;
  const band = company.headerStyle !== "plain";

  const logo = logoHref
    ? `<img src="${escapeHtml(logoHref)}" alt="${escapeHtml(company.footerName)}" width="${width}" ` +
      `style="width:${width}px;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;">`
    : `<span style="font-size:22px;font-weight:600;letter-spacing:0.5px;` +
      `color:${band ? "#ffffff" : "#111827"};">${escapeHtml(company.footerName)}</span>`;

  if (band) {
    return (
      `<tr><td align="center" style="background:${accent};padding:28px 24px;line-height:1;">` +
      `${logo}</td></tr>`
    );
  }
  // Weisser Kopf mit duennem Farbstreifen: vertraegt sich mit jedem Logo.
  return (
    `<tr><td align="center" style="background:#ffffff;padding:30px 24px 22px 24px;line-height:1;">` +
    `${logo}</td></tr>` +
    `<tr><td style="height:3px;background:${accent};line-height:3px;font-size:0;">&nbsp;</td></tr>`
  );
}

function ctaBlock(label: string, url: string, accent: string): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 24px 0;">
  <tr><td style="border-radius:8px;background:${accent};">
    <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;color:#ffffff;
       text-decoration:none;font-weight:600;font-size:15px;border-radius:8px;">${escapeHtml(label)}</a>
  </td></tr>
</table>`;
}

function footerBlock(company: CompanySignature, note?: string): string {
  const year = new Date().getFullYear();
  const contact: string[] = [];
  if (company.footerEmail) {
    contact.push(
      `<a href="mailto:${escapeHtml(company.footerEmail)}" ` +
        `style="color:#6b7280;text-decoration:none;">${escapeHtml(company.footerEmail)}</a>`
    );
  }
  if (company.footerPhone) contact.push(escapeHtml(company.footerPhone));

  return `
<tr><td style="padding:22px 32px 28px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
  ${note ? `<div style="font-size:12px;line-height:1.6;color:#9ca3af;margin-bottom:10px;">${escapeHtml(note)}</div>` : ""}
  ${contact.length ? `<div style="font-size:12px;line-height:1.6;color:#6b7280;">${contact.join(" &middot; ")}</div>` : ""}
  <div style="font-size:12px;line-height:1.6;color:#9ca3af;margin-top:6px;">
    &copy; ${year} ${escapeHtml(company.footerName)}. Alle Rechte vorbehalten.
  </div>
</td></tr>`;
}

/**
 * Baut die vollstaendige Rundmail. Reine Funktion - ohne Datenbank und ohne
 * Netz pruefbar, damit sich das Layout in Tests festnageln laesst.
 */
export function renderBroadcastHtml(input: BroadcastLayout): string {
  const company = input.company;
  const accent = (company.accentColor || DEFAULT_COMPANY_SIGNATURE.accentColor).trim();
  const title = company.footerName || DEFAULT_COMPANY_SIGNATURE.footerName;

  const cta =
    input.ctaLabel && input.ctaUrl && SAFE_SCHEME.test(input.ctaUrl)
      ? ctaBlock(input.ctaLabel, input.ctaUrl, accent)
      : "";

  // Vorschautext: sichtbar in der Mailliste, unsichtbar in der geoeffneten
  // Mail. Die Leerzeichen danach verhindern, dass der Client den Anfang des
  // eigentlichen Texts hinterherzieht.
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">` +
      `${escapeHtml(input.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>`
    : "";

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef0f3;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  color:#374151;-webkit-font-smoothing:antialiased;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0f3;">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;
      box-shadow:0 1px 4px rgba(15,23,42,0.08);">
      ${headerBlock(company, accent)}
      <tr><td style="padding:34px 32px 10px 32px;">
        ${input.bodyHtml}
        ${cta}
      </td></tr>
      ${footerBlock(company, input.footerNote)}
    </table>
  </td></tr>
</table>
</body></html>`;
}

// ------------------------------------------------------------ Platzhalter

export type BroadcastVars = Record<string, string>;

/**
 * Ersetzt {firstName} und Co. Unbekannte Platzhalter werden geleert, damit
 * keine geschweiften Klammern beim Empfaenger landen.
 */
export function fillPlaceholders(src: string, vars: BroadcastVars): string {
  return src.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

/** Platzhalter, die der Editor anbietet. */
export const BROADCAST_PLACEHOLDERS = [
  "firstName",
  "lastName",
  "company",
  "eventTitle",
  "eventDate",
] as const;
