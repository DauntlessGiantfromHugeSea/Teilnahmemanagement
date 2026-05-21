import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyTotp } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";
import { clearPending, createSession, getPending } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const base = url.origin;
  const pending = await getPending();
  if (!pending) return NextResponse.redirect(`${base}/login`, { status: 303 });

  const form = await req.formData();
  const code = String(form.get("code") ?? "");
  const user = await prisma.user.findUnique({ where: { id: pending.uid } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return NextResponse.redirect(`${base}/login`, { status: 303 });
  }
  const secret = safeDecrypt(user.totpSecret);
  if (!secret || !verifyTotp(secret, code)) {
    await audit({ actorId: user.id, action: "TOTP_FAILED", entityType: "Auth", entityId: user.id });
    return NextResponse.redirect(`${base}/login/totp?error=1`, { status: 303 });
  }

  await clearPending();
  await createSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ actorId: user.id, action: "LOGIN", entityType: "Auth", entityId: user.id });

  return NextResponse.redirect(`${base}/dashboard`, { status: 303 });
}
