import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/crypto";
import { clearPending, createSession, getPending } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const pending = await getPending();
  if (!pending) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });

  const form = await req.formData();
  const code = String(form.get("code") ?? "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { id: pending.uid } });
  if (!user || !user.recoveryCodes) {
    return new NextResponse(null, { status: 303, headers: { Location: `/login/recovery?error=1` } });
  }
  let codes: string[] = [];
  try {
    codes = JSON.parse(decryptField(user.recoveryCodes) ?? "[]");
  } catch {
    codes = [];
  }
  const idx = codes.findIndex((c) => c.toLowerCase() === code);
  if (idx === -1) {
    await audit({ actorId: user.id, action: "RECOVERY_FAILED", entityType: "Auth", entityId: user.id });
    return new NextResponse(null, { status: 303, headers: { Location: `/login/recovery?error=1` } });
  }
  codes.splice(idx, 1);

  // 2FA wird zurueckgesetzt, User muss neu einrichten
  await prisma.user.update({
    where: { id: user.id },
    data: {
      recoveryCodes: encryptField(JSON.stringify(codes)),
      totpEnabled: false,
      totpSecret: null,
    },
  });

  await clearPending();
  await createSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  });
  await audit({ actorId: user.id, action: "RECOVERY_USED", entityType: "Auth", entityId: user.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/account/2fa/setup` } });
}
