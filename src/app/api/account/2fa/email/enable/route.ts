import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPending, getSession, createSession, clearPending } from "@/lib/session";
import { hashLoginCode } from "@/lib/loginCode";
import { generateRecoveryCodes } from "@/lib/auth";
import { encryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  const pending = session ? null : await getPending();
  const uid = session?.uid ?? pending?.uid;
  if (!uid) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });

  const f = await req.formData();
  const code = String(f.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/account/2fa/setup-email?error=Code+ungueltig` },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user || !user.loginCodeHash || !user.loginCodeExpiresAt) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/account/2fa/setup-email?error=Kein+aktiver+Code` },
    });
  }
  if (user.loginCodeExpiresAt < new Date()) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/account/2fa/setup-email?error=Code+abgelaufen` },
    });
  }
  if (hashLoginCode(code) !== user.loginCodeHash) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: `/account/2fa/setup-email?error=Code+falsch` },
    });
  }

  // Recovery-Codes nur erzeugen, wenn noch keine existieren
  const updateData: any = {
    emailCodeEnabled: true,
    loginCodeHash: null,
    loginCodeExpiresAt: null,
  };
  if (!user.recoveryCodes) {
    const recovery = generateRecoveryCodes(10);
    updateData.recoveryCodes = encryptField(JSON.stringify(recovery));
    await prisma.user.update({ where: { id: user.id }, data: updateData });
    await audit({ actorId: user.id, action: "EMAIL_CODE_ENABLED", entityType: "Auth", entityId: user.id });
    if (!session) {
      await createSession({ uid: user.id, role: user.role, name: user.name, email: user.email });
      await clearPending();
    }
    const params = new URLSearchParams({ codes: recovery.join(",") });
    return new NextResponse(null, { status: 303, headers: { Location: `/account/2fa/recovery?${params}` } });
  }

  await prisma.user.update({ where: { id: user.id }, data: updateData });
  await audit({ actorId: user.id, action: "EMAIL_CODE_ENABLED", entityType: "Auth", entityId: user.id });
  if (!session) {
    await createSession({ uid: user.id, role: user.role, name: user.name, email: user.email });
    await clearPending();
  }
  return new NextResponse(null, { status: 303, headers: { Location: `/account?ok=email-2fa` } });
}
