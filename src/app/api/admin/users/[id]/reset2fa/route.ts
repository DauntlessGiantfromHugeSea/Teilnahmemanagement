import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  const base = new URL(req.url).origin;
  if (!s || !isAdmin(s)) return new NextResponse("Forbidden", { status: 403 });
  await prisma.user.update({
    where: { id: params.id },
    data: { totpEnabled: false, totpSecret: null, recoveryCodes: null },
  });
  await audit({ actorId: s.uid, action: "RESET_2FA", entityType: "User", entityId: params.id });
  return NextResponse.redirect(`${base}/admin/users?ok=1`, { status: 303 });
}
