import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clearPending, createSession, getPending } from "@/lib/session";
import { hashLoginCode } from "@/lib/loginCode";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const pending = await getPending();
  if (!pending) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });

  const f = await req.formData();
  const code = String(f.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/login/email-code?error=Code+ungueltig` },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: pending.uid } });
  if (!user || !user.emailCodeEnabled || !user.loginCodeHash || !user.loginCodeExpiresAt) {
    return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
  }
  if (user.loginCodeExpiresAt < new Date()) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/login/email-code?error=Code+abgelaufen` },
    });
  }
  if (hashLoginCode(code) !== user.loginCodeHash) {
    await audit({ actorId: user.id, action: "EMAIL_CODE_FAILED", entityType: "Auth", entityId: user.id });
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/login/email-code?error=Code+falsch` },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { loginCodeHash: null, loginCodeExpiresAt: null, lastLoginAt: new Date() },
  });
  await clearPending();
  await createSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
  await audit({ actorId: user.id, action: "LOGIN", entityType: "Auth", entityId: user.id, diff: { method: "email-code" } });

  return new NextResponse(null, { status: 303, headers: { Location: `/dashboard` } });
}
