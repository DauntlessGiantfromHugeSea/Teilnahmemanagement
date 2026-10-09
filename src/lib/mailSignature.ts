import type { User } from "@prisma/client";
import { prisma } from "./db";
import { escapeHtml } from "./email-templates";

// E-Mail-Signatur fuer Ticket-Antworten.
//
// Zwei Ebenen:
//   1. Pro Benutzer (Felder auf User): Grussformel, Name, Titel, Firma,
//      Telefon, Mobil/WhatsApp, Fax, E-Mail, Web, Anschrift, LinkedIn.
//      Pflegbar unter /account/signatur.
//   2. Firmenweit (AppSetting "mail.signature.company"): Logo, Rechtsangaben
//      und Vertraulichkeitshinweis - stehen unter jeder Signatur und werden
//      nur einmal zentral gepflegt (/admin/settings).

const KEY = "mail.signature.company";

export interface CompanySignature {
  /** Logo in Mails. Absolute URL oder ein Pfad aus der Media-Library ("/uploads/..."). */
  logoUrl: string;
  /** Breite des Logos in Pixeln (Mailclients brauchen eine feste Angabe). */
  logoWidth: number;
  accentColor: string;
  /** Firmenname in der Mail-Fusszeile - unabhaengig vom Postfach. */
  footerName: string;
  /** Kontaktadresse in der Fusszeile - unabhaengig vom Antwort-Postfach. */
  footerEmail: string;
  /** Optionale Telefonnummer in der Fusszeile. */
  footerPhone: string;
  legalLines: string[];
  disclaimerDe: string;
  disclaimerEn: string;
}

export const DEFAULT_COMPANY_SIGNATURE: CompanySignature = {
  logoUrl: "https://fluessigbodenakademie.de/wp-content/uploads/2025/07/FBA_tuerkis.png",
  logoWidth: 150,
  accentColor: "#0f766e",
  footerName: "Flüssigboden Akademie",
  footerEmail: "info@fb-akademie.de",
  footerPhone: "",
  legalLines: [
    "Amtsgericht Leipzig HRB 43225",
    "Geschäftsführer: Wolf-Hagen Stolzenburg",
    "Akademie für Flüssigboden und Anwendungen",
  ],
  disclaimerDe:
    "Diese E-Mail und eventuelle Anlagen können vertrauliche und/oder rechtlich geschützte " +
    "Informationen enthalten. Wenn Sie nicht der richtige Adressat sind oder diese E-Mail " +
    "irrtümlich erhalten haben, informieren Sie bitte sofort den Absender und vernichten Sie " +
    "diese E-Mail. Das unerlaubte Kopieren sowie die unbefugte Weitergabe dieser E-Mail sind " +
    "nicht gestattet.",
  disclaimerEn:
    "This e-mail and any attachments may contain confidential and/or privileged information. " +
    "If you are not the intended recipient (or have received this e-mail in error) please " +
    "notify the sender immediately and destroy this e-mail. Any unauthorized copying, " +
    "disclosure or distribution of the material in this e-mail is strictly forbidden.",
};

/**
 * Macht einen Media-Library-Pfad fuer Mails absolut. Relative URLs koennen
 * Mailclients nicht aufloesen - sie brauchen https://host/pfad.
 */
export function absoluteMailUrl(url: string): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  if (!base) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function getCompanySignature(): Promise<CompanySignature> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_COMPANY_SIGNATURE;
  try {
    const parsed = JSON.parse(row.value) as Partial<CompanySignature>;
    return { ...DEFAULT_COMPANY_SIGNATURE, ...parsed };
  } catch {
    return DEFAULT_COMPANY_SIGNATURE;
  }
}

export async function saveCompanySignature(value: CompanySignature): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: json },
    update: { value: json },
  });
}

// Die pro Benutzer pflegbaren Felder - genau die Teilmenge von User, die die
// Signatur braucht. So kann der Renderer auch mit einem Formular-Preview
// aufgerufen werden, ohne dass ein echter User-Datensatz existiert.
export type SignatureUser = Pick<
  User,
  | "name"
  | "email"
  | "sigEnabled"
  | "sigName"
  | "sigTitle"
  | "sigCompany"
  | "sigPhone"
  | "sigMobile"
  | "sigFax"
  | "sigEmail"
  | "sigWeb"
  | "sigAddress"
  | "sigLinkedIn"
  | "sigGreeting"
>;

export const DEFAULT_GREETING = "Mit besten Grüßen aus Leipzig";

function telHref(num: string): string {
  return `tel:${num.replace(/[^\d+]/g, "")}`;
}
function waHref(num: string): string {
  return `https://wa.me/${num.replace(/[^\d]/g, "")}`;
}
function webHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Inline-SVG-Icons: keine externen Bilder, die ein Mailclient blockieren
// koennte, und in hell wie dunkel lesbar (currentColor).
function icon(path: string, color: string): string {
  return (
    `<span style="display:inline-block;width:16px;color:${color};vertical-align:middle;">` +
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg></span>`
  );
}

const ICONS = {
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  printer: '<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
};

function row(iconHtml: string, inner: string): string {
  return `<tr><td style="padding:2px 8px 2px 0;">${iconHtml}</td><td style="padding:2px 0;font-size:13px;">${inner}</td></tr>`;
}

function link(href: string, label: string, color: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${color};text-decoration:none;">${escapeHtml(label)}</a>`;
}

/**
 * Rendert die vollstaendige Signatur als HTML-Block (Grussformel, Kontaktdaten,
 * Logo, Rechtsangaben, Vertraulichkeitshinweis).
 */
export function renderSignatureHtml(user: SignatureUser, company: CompanySignature): string {
  if (!user.sigEnabled) return "";

  const accent = company.accentColor || DEFAULT_COMPANY_SIGNATURE.accentColor;
  const linkColor = "#2563eb";
  const name = (user.sigName || user.name || "").trim();
  const email = (user.sigEmail || user.email || "").trim();
  const greeting = (user.sigGreeting || DEFAULT_GREETING).trim();

  const rows: string[] = [];
  if (user.sigPhone) {
    let cell = link(telHref(user.sigPhone), user.sigPhone, linkColor);
    if (user.sigMobile) {
      cell +=
        `&nbsp;&nbsp;${icon(ICONS.chat, accent)}&nbsp;` +
        link(waHref(user.sigMobile), user.sigMobile, linkColor);
    }
    rows.push(row(icon(ICONS.phone, accent), cell));
  } else if (user.sigMobile) {
    rows.push(row(icon(ICONS.phone, accent), link(telHref(user.sigMobile), user.sigMobile, linkColor)));
  }
  if (email) rows.push(row(icon(ICONS.mail, accent), link(`mailto:${email}`, email, linkColor)));
  if (user.sigWeb) rows.push(row(icon(ICONS.globe, accent), link(webHref(user.sigWeb), user.sigWeb, linkColor)));
  if (user.sigFax) rows.push(row(icon(ICONS.printer, accent), `<span style="color:#475569;">${escapeHtml(user.sigFax)}</span>`));
  if (user.sigAddress) rows.push(row(icon(ICONS.pin, accent), `<span style="color:#475569;">${escapeHtml(user.sigAddress)}</span>`));

  const linkedIn = user.sigLinkedIn
    ? `<div style="padding-top:10px;">${link(webHref(user.sigLinkedIn), "LinkedIn", linkColor)}</div>`
    : "";

  const legal = company.legalLines
    .filter(Boolean)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("");

  const logoWidth = company.logoWidth || DEFAULT_COMPANY_SIGNATURE.logoWidth;
  const logoHref = absoluteMailUrl(company.logoUrl);
  const logo = logoHref
    ? `<img src="${escapeHtml(logoHref)}" alt="" width="${logoWidth}" style="height:auto;width:${logoWidth}px;display:block;">`
    : "";

  return `
<div style="margin-top:28px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="font-size:14px;line-height:1.6;">${escapeHtml(greeting)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;width:100%;">
    <tr>
      <td style="vertical-align:top;padding-right:24px;">
        <div style="font-size:14px;font-weight:bold;">${escapeHtml(name)}</div>
        ${user.sigTitle ? `<div style="font-size:13px;font-style:italic;color:#334155;">${escapeHtml(user.sigTitle)}</div>` : ""}
        ${user.sigCompany ? `<div style="font-size:13px;font-weight:bold;">${escapeHtml(user.sigCompany)}</div>` : ""}
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
          ${rows.join("")}
        </table>
        ${linkedIn}
      </td>
      <td style="vertical-align:top;text-align:right;width:${logoWidth + 10}px;">${logo}</td>
    </tr>
  </table>
  <div style="margin-top:22px;font-size:12px;line-height:1.6;color:#334155;">${legal}</div>
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid #cbd5e1;font-size:11px;line-height:1.5;color:#64748b;">
    <div>${escapeHtml(company.disclaimerDe)}</div>
    <div style="margin-top:6px;">${escapeHtml(company.disclaimerEn)}</div>
  </div>
</div>`.trim();
}

/** Text-Fallback fuer Clients ohne HTML. */
export function renderSignatureText(user: SignatureUser, company: CompanySignature): string {
  if (!user.sigEnabled) return "";
  const parts: string[] = [];
  parts.push(user.sigGreeting || DEFAULT_GREETING);
  parts.push("");
  parts.push(user.sigName || user.name || "");
  if (user.sigTitle) parts.push(user.sigTitle);
  if (user.sigCompany) parts.push(user.sigCompany);
  if (user.sigPhone) parts.push(`Tel: ${user.sigPhone}`);
  if (user.sigMobile) parts.push(`Mobil: ${user.sigMobile}`);
  if (user.sigFax) parts.push(`Fax: ${user.sigFax}`);
  const email = user.sigEmail || user.email;
  if (email) parts.push(email);
  if (user.sigWeb) parts.push(user.sigWeb);
  if (user.sigAddress) parts.push(user.sigAddress);
  parts.push("");
  parts.push(...company.legalLines.filter(Boolean));
  return parts.join("\n").trim();
}
