const LOGO = "https://fluessigbodenakademie.de/wp-content/uploads/2025/01/LogoFBAblue.png";

export function brandWrap(innerHtml: string, opts?: { unsubscribeUrl?: string }): string {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="text-align:center;padding:16px 0;">
      <img src="${LOGO}" alt="FB-Akademie" style="height:48px;width:auto;">
    </div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      ${innerHtml}
    </div>
    <div style="text-align:center;color:#94a3b8;font-size:12px;padding:18px 8px;">
      <div>FLÜSSIGBODEN AKADEMIE &middot; ${year}</div>
      ${
        opts?.unsubscribeUrl
          ? `<div style="margin-top:8px;"><a href="${opts.unsubscribeUrl}" style="color:#94a3b8;">Newsletter abbestellen</a></div>`
          : ""
      }
    </div>
  </div>
</body></html>`;
}

export function optInEmail(confirmUrl: string, firstName?: string | null): { subject: string; html: string } {
  const hi = firstName ? `Hallo ${escapeHtml(firstName)},` : "Hallo,";
  const html = brandWrap(`
    <h1 style="font-size:20px;margin:0 0 12px;">Bitte bestätige deine Anmeldung</h1>
    <p style="line-height:1.6;">${hi}</p>
    <p style="line-height:1.6;">vielen Dank für dein Interesse an unserem Newsletter. Bitte bestätige deine
    E-Mail-Adresse mit einem Klick auf den folgenden Button:</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${confirmUrl}" style="background:#1f3a8a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block;font-weight:bold;">Anmeldung bestätigen</a>
    </p>
    <p style="line-height:1.6;color:#64748b;font-size:13px;">Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:<br>
    <span style="word-break:break-all;">${confirmUrl}</span></p>
    <p style="line-height:1.6;color:#64748b;font-size:13px;">Wenn du dich nicht angemeldet hast, ignoriere diese E-Mail einfach.</p>
  `);
  return { subject: "Bitte bestätige deine Newsletter-Anmeldung", html };
}

export function welcomeEmail(unsubscribeUrl: string, firstName?: string | null): { subject: string; html: string } {
  const hi = firstName ? `Hallo ${escapeHtml(firstName)},` : "Hallo,";
  const html = brandWrap(
    `
    <h1 style="font-size:20px;margin:0 0 12px;">Willkommen!</h1>
    <p style="line-height:1.6;">${hi}</p>
    <p style="line-height:1.6;">deine Anmeldung zum Newsletter der Flüssigboden Akademie ist bestätigt.
    Wir halten dich ab jetzt über Schulungen und Neuigkeiten auf dem Laufenden.</p>
  `,
    { unsubscribeUrl }
  );
  return { subject: "Willkommen beim FB-Akademie Newsletter", html };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Ersetzt Platzhalter in Kampagnen-HTML.
export function renderTemplate(
  html: string,
  vars: { firstName?: string | null; lastName?: string | null; unsubscribeUrl: string }
): string {
  return html
    .replace(/\{\{\s*firstName\s*\}\}/g, escapeHtml(vars.firstName ?? ""))
    .replace(/\{\{\s*lastName\s*\}\}/g, escapeHtml(vars.lastName ?? ""))
    .replace(/\{\{\s*unsubscribe\s*\}\}/g, vars.unsubscribeUrl);
}

// === Event-Nachgang-Mail =================================================
// Eigene Brand-Huelle fuer Mails an Event-Teilnehmer. Verwendet das
// tuerkise Logo (MAIL_LOGO_URL aus .env, Fallback auf den oeffentlichen
// fluessigbodenakademie.de-Pfad) sowie die Brand-Farbe MAIL_BRAND_COLOR.

const DEFAULT_TURQUOISE_LOGO =
  "https://fluessigbodenakademie.de/wp-content/uploads/2025/07/FBA_tuerkis.png";

export function eventLogoUrl(): string {
  return process.env.MAIL_LOGO_URL?.trim() || DEFAULT_TURQUOISE_LOGO;
}

export function eventBrandColor(): string {
  return (process.env.MAIL_BRAND_COLOR?.trim() || "#0f766e").replace(/[^0-9a-fA-F#]/g, "");
}

export function eventMailWrap(innerHtml: string, opts?: { logoUrl?: string; brandColor?: string }): string {
  const logo = opts?.logoUrl ?? eventLogoUrl();
  const brand = opts?.brandColor ?? eventBrandColor();
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="text-align:center;padding:16px 0;">
      <img src="${logo}" alt="Flüssigboden Akademie" style="height:56px;width:auto;">
    </div>
    <div style="height:4px;background:${brand};border-radius:2px;margin:0 0 16px 0;"></div>
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px;">
      ${innerHtml}
    </div>
    <div style="text-align:center;color:#94a3b8;font-size:12px;padding:18px 8px;">
      FLÜSSIGBODEN AKADEMIE &middot; ${year}
    </div>
  </div>
</body></html>`;
}

// Wandelt Plain-Text mit Absatz- und Zeilenumbruechen in einfaches HTML.
export function plainBodyToHtml(plain: string): string {
  if (!plain.trim()) return "";
  return plain
    .split(/\n\s*\n/)
    .map(
      (par) =>
        `<p style="margin:0 0 14px 0;color:#374151;line-height:1.55;">${escapeHtml(
          par
        ).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

export interface FollowupTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

export const FOLLOWUP_TEMPLATES: FollowupTemplate[] = [
  {
    id: "thanks",
    label: "Vielen Dank für Ihre Teilnahme",
    subject: "Vielen Dank für Ihre Teilnahme: {eventTitle}",
    body: `Hallo {firstName},

vielen Dank, dass Sie an unserer Veranstaltung "{eventTitle}" am {eventDate} teilgenommen haben.

Wir hoffen, der Tag war für Sie inhaltlich wertvoll. Bei Rückfragen erreichen Sie uns jederzeit unter info@fb-akademie.de.

Beste Grüße aus Leipzig
Das Team der Flüssigboden Akademie`,
  },
  {
    id: "feedback",
    label: "Feedback gewünscht",
    subject: "Ihr Feedback zur Veranstaltung {eventTitle}",
    body: `Hallo {firstName},

wir würden uns sehr über eine kurze Rückmeldung zur Veranstaltung "{eventTitle}" freuen.

Was hat Ihnen besonders gefallen, was würden Sie sich beim nächsten Mal anders wünschen? Antworten Sie einfach auf diese E-Mail.

Vielen Dank vorab und beste Grüße aus Leipzig
Das Team der Flüssigboden Akademie`,
  },
  {
    id: "blank",
    label: "Leere Vorlage",
    subject: "",
    body: "",
  },
];

export interface FollowupVars {
  firstName: string;
  lastName: string;
  eventTitle: string;
  eventDate: string;
}

export function renderFollowup(text: string, vars: FollowupVars): string {
  return text
    .replace(/\{firstName\}/g, vars.firstName)
    .replace(/\{lastName\}/g, vars.lastName)
    .replace(/\{eventTitle\}/g, vars.eventTitle)
    .replace(/\{eventDate\}/g, vars.eventDate);
}
