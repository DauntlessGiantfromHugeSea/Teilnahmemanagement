import { NextResponse } from "next/server";
import { verifyOtp, setPortalCookie } from "@/lib/certPortal";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const f = await req.formData();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const code = String(f.get("code") ?? "").trim();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return back(email, "Bitte E-Mail und 6-stelligen Code eingeben.");
  }
  const ok = await verifyOtp(email, code);
  if (!ok) {
    return back(email, "Ungültiger oder abgelaufener Code.");
  }
  await setPortalCookie(email);
  return new NextResponse(null, { status: 303, headers: { Location: "/meine-zertifikate" } });
}

function back(email: string, error: string) {
  const qs = new URLSearchParams({ email, error }).toString();
  return new NextResponse(null, { status: 303, headers: { Location: `/meine-zertifikate/code?${qs}` } });
}
