import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { parseIframeHosts, buildFrameAncestors } from "./lib/iframeHosts";

const PUBLIC = [
  /^\/login(\/.*)?$/,
  /^\/api\/auth\/.*/,
  /^\/api\/public\/.*/,
  /^\/anmeldung(\/.*)?$/,
  /^\/api\/auth\/microsoft\/.+$/,
  /^\/zertifikat(\/.+)?$/,
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

function applyEmbedHeaders(req: NextRequest, res: NextResponse) {
  const { pathname } = req.nextUrl;
  if (!EMBEDDABLE.some((r) => r.test(pathname))) return res;
  const hosts = parseIframeHosts(process.env.IFRAME_HOSTS);
  const ancestors = buildFrameAncestors(hosts);
  // CSP frame-ancestors hat Vorrang ueber X-Frame-Options.
  res.headers.set("Content-Security-Policy", `frame-ancestors ${ancestors}`);
  // X-Frame-Options entfernen, falls vorgelagerte Proxies SAMEORIGIN setzen.
  res.headers.delete("X-Frame-Options");
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) {
    return applyEmbedHeaders(req, NextResponse.next());
  }

  const token = req.cookies.get("tm_session")?.value;
  const pending = req.cookies.get("tm_2fa_pending")?.value;
  const secret = process.env.SESSION_SECRET;

  // Erlaubt mit Pending-Cookie: 2FA-Erstpflicht-Einrichtung
  const isFirstTimeSetup =
    pending &&
    (pending && (pathname.startsWith("/account/2fa/setup") || pathname === "/api/account/2fa/enable"));
  if (isFirstTimeSetup) return applyEmbedHeaders(req, NextResponse.next());

  if (!token || !secret) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return applyEmbedHeaders(req, NextResponse.next());
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
