import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return new NextResponse(null, { status: 303, headers: { Location: `/login` } });
  const f = await req.formData();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  if (next.length < 10) {
    return new NextResponse(null, { status: 303, headers: { Location: `/account/password?error=length` } });
  }
  const u = await prisma.user.findUnique({ where: { id: s.uid } });
  if (!u || !(await verifyPassword(current, u.passwordHash))) {
    return new NextResponse(null, { status: 303, headers: { Location: `/account/password?error=current` } });
  }
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(next) },
  });
  await audit({ actorId: u.id, action: "PASSWORD_CHANGED", entityType: "Auth", entityId: u.id });
  return new NextResponse(null, { status: 303, headers: { Location: `/account/password?ok=1` } });
}
