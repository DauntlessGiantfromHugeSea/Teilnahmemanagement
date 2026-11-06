import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateRecoveryCodes, verifyTotp } from "@/lib/auth";
import { encryptField, safeDecrypt } from "@/lib/crypto";
import { clearPending, createSession, getPending, getSession, stashRecoveryCodes } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  const pending = session ? null : await getPending();
  const uid = session?.uid ?? pending?.uid;
  if (!uid) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });

  const form = await req.formData();
  const code = String(form.get("code") ?? "");

  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) {
    return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
  }

  // Massgeblich ist diese Pruefung, nicht die in der Middleware: ohne
  // vollwertige Sitzung darf nur ein Konto ohne zweiten Faktor einen
  // einrichten. Andernfalls genuegte das Passwort, um den bestehenden
  // Faktor gegen einen eigenen zu tauschen.
  if (!session) {
    const hasFactor = user.totpEnabled || user.emailCodeEnabled;
    if (pending?.stage !== "setup" || hasFactor) {
      return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
    }
  }

  // Geprueft wird gegen den Kandidaten, nicht gegen das aktive Geheimnis.
  const secret = safeDecrypt(user.totpPendingSecret);
  if (!secret || !verifyTotp(secret, code)) {
    return new NextResponse(null, { status: 303, headers: { Location: `/account/2fa/setup?error=1` } });
  }

  const recovery = generateRecoveryCodes(10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      // Jetzt erst wird der Kandidat zum aktiven Geheimnis.
      totpSecret: encryptField(secret),
      totpPendingSecret: null,
      totpEnabled: true,
      twoFaFailedCount: 0,
      twoFaLockedUntil: null,
      recoveryCodes: encryptField(JSON.stringify(recovery)),
    },
  });
  await audit({ actorId: user.id, action: "TOTP_ENABLED", entityType: "Auth", entityId: user.id });

  // Sitzung aufsetzen (falls noch nicht vorhanden)
  if (!session) {
    await createSession({ uid: user.id, role: user.role, name: user.name, email: user.email });
    await clearPending();
  }

  // Recovery-Codes ueber ein kurzlebiges httpOnly-Cookie an die Folgeseite
  // uebergeben, nicht ueber die URL.
  stashRecoveryCodes(recovery);
  return new NextResponse(null, { status: 303, headers: { Location: `/account/2fa/recovery` } });
}
