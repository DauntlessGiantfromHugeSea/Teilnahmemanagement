import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { createPending, createSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!email || !password) {
    return new NextResponse(null, { status: 303, headers: { Location: `/login?error=invalid` } });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return new NextResponse(null, { status: 303, headers: { Location: `/login?error=invalid` } });
  }
  if (!user.active) {
    return new NextResponse(null, { status: 303, headers: { Location: `/login?error=inactive` } });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await audit({ actorId: user.id, action: "LOGIN_FAILED", entityType: "Auth", entityId: user.id });
    return new NextResponse(null, { status: 303, headers: { Location: `/login?error=invalid` } });
  }

  if (user.totpEnabled) {
    await createPending(user.id);
    return new NextResponse(null, { status: 303, headers: { Location: `/login/totp` } });
  }

  // 2FA noch nicht eingerichtet
  if (user.totpRequired) {
    // Pflicht: User muss 2FA einrichten
    await createPending(user.id);
    return new NextResponse(null, { status: 303, headers: { Location: `/account/2fa/setup` } });
  }

  // 2FA-Pflicht deaktiviert -> direkt einloggen
  await createSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ actorId: user.id, action: "LOGIN", entityType: "Auth", entityId: user.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/dashboard` } });
}
