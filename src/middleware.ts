import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { parseIframeHosts, buildFrameAncestors } from "./lib/iframeHosts";

// Die Middleware laeuft in der Edge-Runtime und darf nichts aus
// src/lib/session.ts importieren (das zieht Prisma nach). Die
// Audience-Werte stehen deshalb in einem eigenen, abhaengigkeitsfreien
// Modul - eine Quelle fuer beide Seiten statt zweier Kopien.
import { AUD_PENDING, AUD_SESSION } from "./lib/authAudience";

const PUBLIC = [
  /^\/login(\/.*)?$/,
  /^\/api\/auth\/.*/,
  /^\/api\/public\/.*/,
  /^\/anmeldung(\/.*)?$/,
  /^\/api\/auth\/microsoft\/.+$/,
  /^\/api\/cron\/.+$/,
  /^\/zertifikat(\/.+)?$/,
  /^\/portal\/.+$/,
  /^\/api\/portal\/.+$/,
  /^\/api\/zertifikat\/.+$/,
  /^\/meine-zertifikate(\/.*)?$/,
  /^\/api\/meine-zertifikate(\/.*)?$/,
  /^\/feedback\/.+$/,
  /^\/api\/feedback\/.+$/,
  /^\/set-password(\/.*)?$/,
  /^\/newsletter\/(confirm|unsubscribe)(\/.*)?$/,
  /^\/_next\/.*/,
  /^\/favicon\.ico$/,
  /^\/manifest\.webmanifest$/,
  /^\/sw\.js$/,
  /^\/icon[^/]*\.(png|svg)$/,
  /^\/apple-touch-icon\.png$/,
  /^\/favicon-(16|32)\.png$/,
  /^\/logo(-[a-z0-9-]+)?\.png$/,
  /^\/favicon\.png$/,
  /^\/uploads\/.+/,
];

// Pfade, die als iframe eingebettet werden duerfen.
const EMBEDDABLE = [/^\/anmeldung(\/.*)?$/, /^\/uploads\/.+/];

// Cloudflare Turnstile auf den oeffentlichen Anmeldeseiten ist die einzige
// Fremdherkunft, von der Code geladen wird.
const TURNSTILE = "https://challenges.cloudflare.com";

/**
 * Setzt die Sicherheits-Header fuer jede Antwort.
 *
 * Die Content-Security-Policy gilt anwendungsweit. Sie verhindert vor allem,
 * dass eingeschleuster Inhalt Code von fremden Servern nachlaedt, Formulare
 * umlenkt oder die Basis-URL der Seite verbiegt.
 *
 * Ehrliche Einschraenkung: script-src enthaelt noch 'unsafe-inline', weil
 * mehrere Seiten kleine Inline-Skripte mitbringen (Druckansicht, Summen in
 * der Buchhaltung). Gegen eingeschleustes Inline-Script schuetzt die Policy
 * damit nicht - das kann erst eine Nonce-Variante, die jedes dieser Skripte
 * umstellen muss. Der Weg nach draussen ist aber zu.
 */
function applySecurityHeaders(req: NextRequest, res: NextResponse) {
  const { pathname } = req.nextUrl;
  const embeddable = EMBEDDABLE.some((r) => r.test(pathname));

  let ancestors = "'none'";
  if (embeddable) {
    ancestors = buildFrameAncestors(parseIframeHosts(process.env.IFRAME_HOSTS));
    // CSP frame-ancestors hat Vorrang ueber X-Frame-Options; letzteres
    // entfernen, falls ein vorgelagerter Proxy SAMEORIGIN erzwingt.
    res.headers.delete("X-Frame-Options");
  }

  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
      `frame-ancestors ${ancestors}`,
      // Mailbilder und hochgeladene Bilder kommen von beliebigen Servern.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline' ${TURNSTILE}`,
      `frame-src 'self' blob: ${TURNSTILE}`,
      `connect-src 'self' ${TURNSTILE}`,
    ].join("; ")
  );
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) {
    return applySecurityHeaders(req, NextResponse.next());
  }

  const token = req.cookies.get("tm_session")?.value;
  const pending = req.cookies.get("tm_2fa_pending")?.value;
  const secret = process.env.SESSION_SECRET;

  // Pfade der 2FA-Erstpflicht-Einrichtung. Sie sind die einzigen, die ohne
  // vollwertige Sitzung erreichbar sind.
  // Exakte Pfade: "startsWith" wuerde auch /account/2fa/setup-email
  // einschliessen, das diesen Ausnahmeweg nicht braucht.
  const isSetupPath =
    pathname === "/account/2fa/setup" || pathname === "/api/account/2fa/enable";

  if (isSetupPath && pending && secret) {
    // Nur ein Zwischenstand, der ausdruecklich zur Erst-Einrichtung
    // ausgestellt wurde, oeffnet diese Pfade. Ein Zwischenstand aus dem
    // normalen Login ("totp": Konto hat bereits einen Faktor) darf hier
    // nicht durch, sonst liesse sich der vorhandene zweite Faktor allein
    // mit dem Passwort durch einen neuen ersetzen.
    try {
      const { payload } = await jwtVerify(pending, new TextEncoder().encode(secret), {
        audience: AUD_PENDING,
      });
      if (payload.stage === "setup") return applySecurityHeaders(req, NextResponse.next());
    } catch {
      // faellt unten auf die normale Sitzungspruefung zurueck
    }
  }

  if (!token || !secret) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  try {
    // Audience-Pruefung: ein Pending- oder Portal-Token im Sitzungscookie
    // ist zwar korrekt signiert, aber nicht fuer diesen Zweck ausgestellt.
    await jwtVerify(token, new TextEncoder().encode(secret), { audience: AUD_SESSION });
    return applySecurityHeaders(req, NextResponse.next());
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
