import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = [
  /^\/login(\/.*)?$/,
  /^\/api\/auth\/.*/,
  /^\/_next\/.*/,
  /^\/favicon\.ico$/,
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();

  const token = req.cookies.get("tm_session")?.value;
  const pending = req.cookies.get("tm_2fa_pending")?.value;
  const secret = process.env.SESSION_SECRET;

  // Erlaubt mit Pending-Cookie: 2FA-Erstpflicht-Einrichtung
  const isFirstTimeSetup =
    pending &&
    (pending && (pathname.startsWith("/account/2fa/setup") || pathname === "/api/account/2fa/enable"));
  if (isFirstTimeSetup) return NextResponse.next();

  if (!token || !secret) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
