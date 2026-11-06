import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyTotp } from "@/lib/auth";
import { safeDecrypt } from "@/lib/crypto";
import { clearPending, createSession, getPending } from "@/lib/session";
import { audit } from "@/lib/audit";
import { checkTwoFaGate, clearTwoFaFailures, lockedMessage, registerTwoFaFailure } from "@/lib/twoFactorLimit";

export async function POST(req: Request) {
  const pending = await getPending();
  // Nur der Zwischenstand "totp" (zweiter Faktor vorhanden) gehoert hierher.
  if (!pending || pending.stage !== "totp") {
    return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
  }

  const form = await req.formData();
  const code = String(form.get("code") ?? "");
  const user = await prisma.user.findUnique({ where: { id: pending.uid } });
  if (!user || !user.totpEnabled || !user.totpSecret) {
    return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
  }
  // Versuchsbegrenzung vor der Pruefung: ein 6-stelliger Code ist sonst
  // durchprobierbar.
  const gate = await checkTwoFaGate(user.id);
  if (gate.locked) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/login/totp?error=${encodeURIComponent(lockedMessage(gate.until))}` },
    });
  }

  const secret = safeDecrypt(user.totpSecret);
  if (!secret || !verifyTotp(secret, code)) {
    await audit({ actorId: user.id, action: "TOTP_FAILED", entityType: "Auth", entityId: user.id });
    const after = await registerTwoFaFailure(user.id);
    const msg = after.locked ? lockedMessage(after.until) : "Code ungültig.";
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/login/totp?error=${encodeURIComponent(msg)}` },
    });
  }

  await clearTwoFaFailures(user.id);
  await clearPending();
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
