import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST() {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });

  await prisma.user.update({
    where: { id: session.uid },
    data: { emailCodeEnabled: false, loginCodeHash: null, loginCodeExpiresAt: null },
  });
  await audit({ actorId: session.uid, action: "EMAIL_CODE_DISABLED", entityType: "Auth", entityId: session.uid });

  return new NextResponse(null, { status: 303, headers: { Location: `/account?ok=email-2fa-off` } });
}
