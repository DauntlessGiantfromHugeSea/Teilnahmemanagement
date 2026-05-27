const LOGO = "https://fb-akademie.de/wp-content/uploads/2025/01/LogoFBAblue.png";

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
