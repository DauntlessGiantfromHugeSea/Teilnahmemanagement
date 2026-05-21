import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createPending } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  const url = new URL(req.url);
  const base = `${url.origin}`;

  if (!email || !password) {
    return NextResponse.redirect(`${base}/login?error=invalid`, { status: 303 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.redirect(`${base}/login?error=invalid`, { status: 303 });
  }
  if (!user.active) {
    return NextResponse.redirect(`${base}/login?error=inactive`, { status: 303 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await audit({ actorId: user.id, action: "LOGIN_FAILED", entityType: "Auth", entityId: user.id });
    return NextResponse.redirect(`${base}/login?error=invalid`, { status: 303 });
  }

  if (user.totpEnabled) {
    await createPending(user.id);
    return NextResponse.redirect(`${base}/login/totp`, { status: 303 });
  }

  // 2FA noch nicht eingerichtet -> erzwingen
  await createPending(user.id);
  return NextResponse.redirect(`${base}/account/2fa/setup`, { status: 303 });
}
