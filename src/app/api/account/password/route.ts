import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function POST(req: Request) {
  const base = new URL(req.url).origin;
  const s = await getSession();
  if (!s) return NextResponse.redirect(`${base}/login`, { status: 303 });
  const f = await req.formData();
  const current = String(f.get("current") ?? "");
  const next = String(f.get("next") ?? "");
  if (next.length < 10) {
    return NextResponse.redirect(`${base}/account/password?error=length`, { status: 303 });
  }
  const u = await prisma.user.findUnique({ where: { id: s.uid } });
  if (!u || !(await verifyPassword(current, u.passwordHash))) {
    return NextResponse.redirect(`${base}/account/password?error=current`, { status: 303 });
  }
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash: await hashPassword(next) },
  });
  await audit({ actorId: u.id, action: "PASSWORD_CHANGED", entityType: "Auth", entityId: u.id });
  return NextResponse.redirect(`${base}/account/password?ok=1`, { status: 303 });
}
