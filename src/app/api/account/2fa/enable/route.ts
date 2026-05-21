import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateRecoveryCodes, verifyTotp } from "@/lib/auth";
import { encryptField, safeDecrypt } from "@/lib/crypto";
import { clearPending, createSession, getPending, getSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  const pending = session ? null : await getPending();
  const uid = session?.uid ?? pending?.uid;
  if (!uid) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });

  const form = await req.formData();
  const code = String(form.get("code") ?? "");

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user || !user.totpSecret) {
    return new NextResponse(null, { status: 303, headers: { Location: `/account/2fa/setup?error=1` } });
  }
  const secret = safeDecrypt(user.totpSecret);
  if (!secret || !verifyTotp(secret, code)) {
    return new NextResponse(null, { status: 303, headers: { Location: `/account/2fa/setup?error=1` } });
  }

  const recovery = generateRecoveryCodes(10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabled: true,
      recoveryCodes: encryptField(JSON.stringify(recovery)),
    },
  });
  await audit({ actorId: user.id, action: "TOTP_ENABLED", entityType: "Auth", entityId: user.id });

  // Sitzung aufsetzen (falls noch nicht vorhanden)
  if (!session) {
    await createSession({ uid: user.id, role: user.role, name: user.name, email: user.email });
    await clearPending();
  }

  // Recovery-Codes via Query an Folgeseite übergeben (einmalige Anzeige)
  const params = new URLSearchParams({ codes: recovery.join(",") });
  return new NextResponse(null, { status: 303, headers: { Location: `/account/2fa/recovery?${params}` } });
}
